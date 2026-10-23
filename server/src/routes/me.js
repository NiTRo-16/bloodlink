import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { requireAuth } from '../middleware/auth.js';
import BloodRequest from '../models/BloodRequest.js';
import DonorResponse from '../models/DonorResponse.js';
import OtpCode from '../models/OtpCode.js';
import { asyncHandler, HttpError, toPoint } from '../utils/http.js';
import { isEligible, isValidBloodGroup, nextEligibleDate } from '../utils/compatibility.js';
import { findAlertsForDonor } from '../services/matching.js';
import { broadcast, emitToUser } from '../services/notify.js';
import { deleteAccountLimit } from '../middleware/rateLimits.js';

const router = Router();
router.use(requireAuth);

function profile(user) {
  return {
    user,
    eligibility: { eligible: isEligible(user), nextEligibleDate: nextEligibleDate(user) },
  };
}

// GET /api/me
router.get('/', (req, res) => res.json(profile(req.user)));

// PATCH /api/me  (availability toggle, location, becoming a donor, recording a past donation)
router.patch(
  '/',
  asyncHandler(async (req, res) => {
    const user = req.user;
    const { available, isDonor, bloodGroup, gender, lat, lng, lastDonationDate } = req.body;

    if (typeof available === 'boolean') user.available = available;
    if (['male', 'female', 'other'].includes(gender)) user.gender = gender;
    if (bloodGroup !== undefined) {
      if (!isValidBloodGroup(bloodGroup)) throw new HttpError(400, 'Invalid blood group');
      user.bloodGroup = bloodGroup;
    }
    if (lat !== undefined && lng !== undefined) user.location = toPoint(lat, lng);
    if (lastDonationDate !== undefined) {
      const d = lastDonationDate ? new Date(lastDonationDate) : null;
      if (d && (Number.isNaN(d.getTime()) || d > new Date())) {
        throw new HttpError(400, 'Last donation date cannot be in the future');
      }
      user.lastDonationDate = d;
    }
    if (typeof isDonor === 'boolean') {
      if (isDonor && (!user.bloodGroup || !user.location)) {
        throw new HttpError(400, 'Add your blood group and location to become a donor');
      }
      user.isDonor = isDonor;
    }

    await user.save();
    res.json(profile(user));
  })
);

// GET /api/me/alerts  (open requests this donor can help with right now)
router.get(
  '/alerts',
  asyncHandler(async (req, res) => {
    res.json(await findAlertsForDonor(req.user));
  })
);

// GET /api/me/requests  (requests I posted)
router.get(
  '/requests',
  asyncHandler(async (req, res) => {
    const requests = await BloodRequest.find({ requester: req.user._id }).sort({ createdAt: -1 }).lean();
    const counts = await DonorResponse.aggregate([
      { $match: { request: { $in: requests.map((r) => r._id) }, status: { $in: ['accepted', 'donated'] } } },
      { $group: { _id: '$request', n: { $sum: 1 } } },
    ]);
    const countById = new Map(counts.map((c) => [String(c._id), c.n]));
    res.json(
      requests.map((r) => ({
        ...r,
        notifiedCount: r.notifiedDonors?.length ?? 0,
        notifiedDonors: undefined,
        acceptedCount: countById.get(String(r._id)) ?? 0,
      }))
    );
  })
);

// GET /api/me/history  (my answers to requests, including donations)
router.get(
  '/history',
  asyncHandler(async (req, res) => {
    const responses = await DonorResponse.find({ donor: req.user._id })
      .sort({ updatedAt: -1 })
      .populate('request', 'bloodGroup units hospital status neededBy urgency')
      .lean();
    res.json(responses.filter((r) => r.request));
  })
);

// DELETE /api/me  { password }  (delete the account and everything tied to it)
router.delete(
  '/',
  deleteAccountLimit,
  asyncHandler(async (req, res) => {
    const user = req.user;
    if (!(await bcrypt.compare(String(req.body?.password ?? ''), user.passwordHash))) {
      throw new HttpError(401, 'That password is wrong');
    }

    // Requests they posted: close the open ones for everyone watching, then remove them and their replies.
    const posted = await BloodRequest.find({ requester: user._id }, '_id status notifiedDonors').lean();
    for (const r of posted.filter((p) => p.status === 'open')) {
      r.notifiedDonors.forEach((id) => emitToUser(id, 'alert:closed', { _id: r._id, status: 'cancelled' }));
      broadcast('request:closed', { _id: r._id, status: 'cancelled' });
    }
    const postedIds = posted.map((r) => r._id);
    await DonorResponse.deleteMany({ request: { $in: postedIds } });
    await BloodRequest.deleteMany({ _id: { $in: postedIds } });

    // Their answers to other people's requests: requesters who were counting on them see it live.
    const answered = await DonorResponse.find({ donor: user._id, status: 'accepted' })
      .populate('request', 'requester status')
      .lean();
    await DonorResponse.deleteMany({ donor: user._id });
    for (const { request } of answered) {
      if (request?.status !== 'open') continue;
      emitToUser(request.requester, 'response:updated', { requestId: request._id, status: 'withdrawn' });
      const acceptedCount = await DonorResponse.countDocuments({ request: request._id, status: 'accepted' });
      broadcast('request:updated', { _id: request._id, acceptedCount });
    }

    await BloodRequest.updateMany({ notifiedDonors: user._id }, { $pull: { notifiedDonors: user._id } });
    await OtpCode.deleteMany({ phone: user.phone });
    await user.deleteOne();
    res.json({ deleted: true });
  })
);

export default router;
