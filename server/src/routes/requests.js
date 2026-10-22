import { Router } from 'express';
import mongoose from 'mongoose';
import { requireAuth } from '../middleware/auth.js';
import BloodRequest from '../models/BloodRequest.js';
import DonorResponse from '../models/DonorResponse.js';
import User from '../models/User.js';
import { asyncHandler, distanceKm, HttpError, normalizePhone, publicRequest, toPoint } from '../utils/http.js';
import { canDonateTo, isEligible, isValidBloodGroup } from '../utils/compatibility.js';
import { findMatchingDonors, toDonorView } from '../services/matching.js';
import { broadcast, emitToUser, sendPush } from '../services/notify.js';
import { postRequestLimit, respondLimit } from '../middleware/rateLimits.js';

const router = Router();

async function loadRequest(id) {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(404, 'Request not found');
  const request = await BloodRequest.findById(id);
  if (!request) throw new HttpError(404, 'Request not found');
  return request;
}

// GET /api/requests/open  (public: powers the live map, no personal details)
router.get(
  '/open',
  asyncHandler(async (_req, res) => {
    const requests = await BloodRequest.find({ status: 'open' }).sort({ createdAt: -1 }).limit(200).lean();
    const counts = await DonorResponse.aggregate([
      { $match: { request: { $in: requests.map((r) => r._id) }, status: 'accepted' } },
      { $group: { _id: '$request', n: { $sum: 1 } } },
    ]);
    const countById = new Map(counts.map((c) => [String(c._id), c.n]));
    res.json(requests.map((r) => publicRequest(r, countById.get(String(r._id)) ?? 0)));
  })
);

// POST /api/requests  (post a request and alert matching donors)
router.post(
  '/',
  requireAuth,
  postRequestLimit,
  asyncHandler(async (req, res) => {
    const { patientName, bloodGroup, units, hospital, notes, urgency, neededBy, radiusKm, lat, lng } = req.body;

    if (!isValidBloodGroup(bloodGroup)) throw new HttpError(400, 'Choose the blood group needed');
    const neededByDate = new Date(neededBy);
    if (Number.isNaN(neededByDate.getTime())) throw new HttpError(400, 'Enter when the blood is needed');

    const request = await BloodRequest.create({
      requester: req.user._id,
      patientName,
      bloodGroup,
      units: Number(units),
      hospital,
      notes: notes ?? '',
      contactPhone: normalizePhone(req.body.contactPhone || req.user.phone),
      urgency,
      neededBy: neededByDate,
      radiusKm: Number(radiusKm) || 10,
      location: toPoint(lat, lng),
    });

    const donors = await findMatchingDonors(request);
    request.notifiedDonors = donors.map((d) => d._id);
    await request.save();

    // Alert every matching donor: live in the app, and by push if subscribed.
    for (const donor of donors) {
      const view = toDonorView(request, null, distanceKm(donor.location, request.location));
      emitToUser(donor._id, 'alert:new', view);
      sendPush(donor, {
        title: `${request.bloodGroup} blood needed ${view.distanceKm} km away`,
        body: `${request.units} unit(s) at ${request.hospital}. Tap to respond.`,
        url: `/requests/${request._id}`,
      });
    }

    broadcast('request:opened', publicRequest(request));
    res.status(201).json({ request, notifiedCount: donors.length });
  })
);

// GET /api/requests/:id  (what you see depends on who you are)
router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const request = await loadRequest(req.params.id);
    const isOwner = request.requester.equals(req.user._id);

    if (isOwner) {
      const responses = await DonorResponse.find({ request: request._id })
        .populate('donor', 'name phone bloodGroup gender location')
        .sort({ updatedAt: -1 })
        .lean();
      return res.json({
        role: 'owner',
        request: { ...request.toJSON(), notifiedCount: request.notifiedDonors.length, notifiedDonors: undefined },
        responses: responses
          .filter((r) => r.donor)
          .map((r) => ({
            _id: r._id,
            status: r.status,
            updatedAt: r.updatedAt,
            donor: {
              _id: r.donor._id,
              name: r.donor.name,
              bloodGroup: r.donor.bloodGroup,
              // Phone numbers are shared only with donors who said yes.
              phone: r.status === 'declined' ? null : r.donor.phone,
              distanceKm: distanceKm(r.donor.location, request.location),
            },
          })),
      });
    }

    const mine = await DonorResponse.findOne({ request: request._id, donor: req.user._id });
    const view = toDonorView(request, mine?.status ?? null, distanceKm(req.user.location, request.location));
    if (view.contactPhone) {
      const requester = await User.findById(request.requester, 'name');
      view.requesterName = requester?.name ?? null;
    }
    res.json({
      role: 'viewer',
      request: view,
      canRespond:
        request.status === 'open' &&
        req.user.isDonor &&
        canDonateTo(req.user.bloodGroup, request.bloodGroup) &&
        isEligible(req.user),
    });
  })
);

// POST /api/requests/:id/respond  { status: 'accepted' | 'declined' }
router.post(
  '/:id/respond',
  requireAuth,
  respondLimit,
  asyncHandler(async (req, res) => {
    const { status } = req.body;
    if (!['accepted', 'declined'].includes(status)) throw new HttpError(400, 'Status must be accepted or declined');

    const request = await loadRequest(req.params.id);
    const donor = req.user;
    if (request.status !== 'open') throw new HttpError(409, 'This request is already closed');
    if (request.requester.equals(donor._id)) throw new HttpError(400, 'You cannot respond to your own request');
    if (!donor.isDonor) throw new HttpError(403, 'Register as a donor to respond');
    if (!canDonateTo(donor.bloodGroup, request.bloodGroup)) {
      throw new HttpError(403, `${donor.bloodGroup} cannot donate to a ${request.bloodGroup} patient`);
    }
    if (status === 'accepted' && !isEligible(donor)) {
      throw new HttpError(403, 'You are not yet eligible to donate again');
    }

    const response = await DonorResponse.findOneAndUpdate(
      { request: request._id, donor: donor._id },
      { status },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // Tell the requester live.
    emitToUser(request.requester, 'response:updated', {
      requestId: request._id,
      status,
      donor: {
        _id: donor._id,
        name: donor.name,
        bloodGroup: donor.bloodGroup,
        phone: status === 'accepted' ? donor.phone : null,
        distanceKm: distanceKm(donor.location, request.location),
      },
    });
    if (status === 'accepted') {
      const requester = await User.findById(request.requester);
      if (requester) {
        sendPush(requester, {
          title: `${donor.name} can donate`,
          body: `${donor.bloodGroup} donor for ${request.hospital}. Open to see their number.`,
          url: `/requests/${request._id}`,
        });
      }
    }

    const counts = await DonorResponse.countDocuments({ request: request._id, status: 'accepted' });
    broadcast('request:updated', { _id: request._id, acceptedCount: counts });

    res.json({
      response,
      contactPhone: status === 'accepted' ? request.contactPhone : null,
    });
  })
);

// PATCH /api/requests/:id/status  { status: 'fulfilled' | 'cancelled', donatedBy?: [donorId] }
router.patch(
  '/:id/status',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { status, donatedBy = [] } = req.body;
    if (!['fulfilled', 'cancelled'].includes(status)) throw new HttpError(400, 'Status must be fulfilled or cancelled');

    const request = await loadRequest(req.params.id);
    if (!request.requester.equals(req.user._id)) throw new HttpError(403, 'Only the requester can close this request');
    if (request.status !== 'open') throw new HttpError(409, 'This request is already closed');

    request.status = status;
    request.closedAt = new Date();
    await request.save();

    // Record who actually donated. They pause from alerts until eligible again.
    let donatedCount = 0;
    if (status === 'fulfilled' && Array.isArray(donatedBy) && donatedBy.length) {
      const ids = donatedBy.filter((id) => mongoose.isValidObjectId(id));
      const accepted = await DonorResponse.find({ request: request._id, donor: { $in: ids }, status: 'accepted' });
      const donorIds = accepted.map((r) => r.donor);
      await DonorResponse.updateMany({ _id: { $in: accepted.map((r) => r._id) } }, { status: 'donated' });
      await User.updateMany({ _id: { $in: donorIds } }, { lastDonationDate: request.closedAt });
      donatedCount = donorIds.length;
      donorIds.forEach((id) => emitToUser(id, 'donation:recorded', { requestId: request._id }));
    }

    request.notifiedDonors.forEach((id) => emitToUser(id, 'alert:closed', { _id: request._id, status }));
    broadcast('request:closed', { _id: request._id, status });

    res.json({ request, donatedCount });
  })
);

export default router;
