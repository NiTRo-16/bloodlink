import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import BloodRequest from '../models/BloodRequest.js';
import DonorResponse from '../models/DonorResponse.js';
import { asyncHandler, HttpError, toPoint } from '../utils/http.js';
import { isEligible, isValidBloodGroup, nextEligibleDate } from '../utils/compatibility.js';
import { findAlertsForDonor } from '../services/matching.js';

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

export default router;
