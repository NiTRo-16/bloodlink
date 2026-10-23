// Finding the right donors for a request, and the right requests for a donor.
import User from '../models/User.js';
import BloodRequest from '../models/BloodRequest.js';
import DonorResponse from '../models/DonorResponse.js';
import {
  compatibleDonorGroups,
  compatibleRecipientGroups,
  isEligible,
} from '../utils/compatibility.js';

const plainPoint = (loc) => ({ type: 'Point', coordinates: [...loc.coordinates] });

/**
 * Donors who are: compatible, available, within the request's radius, and eligible to donate.
 * MongoDB's $near uses the 2dsphere index and returns the nearest donors first.
 */
export async function findMatchingDonors(request) {
  const donors = await User.find({
    isDonor: true,
    available: true,
    bloodGroup: { $in: compatibleDonorGroups(request.bloodGroup) },
    _id: { $ne: request.requester },
    location: {
      $near: {
        $geometry: plainPoint(request.location),
        $maxDistance: request.radiusKm * 1000, // metres
      },
    },
  }).limit(200);

  return donors.filter((d) => isEligible(d));
}

/**
 * Open requests a donor can help with: compatible blood group and the donor
 * is inside that request's own radius. Includes distance and the donor's current answer.
 */
export async function findAlertsForDonor(donor) {
  if (!donor.isDonor || !donor.available || !donor.location || !isEligible(donor)) return [];

  const requests = await BloodRequest.aggregate([
    {
      $geoNear: {
        near: plainPoint(donor.location),
        distanceField: 'distanceMeters',
        maxDistance: 100 * 1000, // the largest allowed radius
        spherical: true,
        query: {
          status: 'open',
          bloodGroup: { $in: compatibleRecipientGroups(donor.bloodGroup) },
          requester: { $ne: donor._id },
        },
      },
    },
    { $match: { $expr: { $lte: ['$distanceMeters', { $multiply: ['$radiusKm', 1000] }] } } },
    { $sort: { createdAt: -1 } },
    { $limit: 50 },
  ]);

  const responses = await DonorResponse.find({
    donor: donor._id,
    request: { $in: requests.map((r) => r._id) },
  });
  const statusById = new Map(responses.map((r) => [String(r.request), r.status]));

  return requests.map((r) => toDonorView(r, statusById.get(String(r._id)) ?? null, r.distanceMeters / 1000));
}

/** "Sunita Devi" → "Sunita D." */
export function shortName(name) {
  const [first, ...rest] = String(name ?? '').trim().split(/\s+/);
  return rest.length ? `${first} ${rest.at(-1)[0].toUpperCase()}.` : first;
}

/** What a donor sees. The patient's full name and the contact phone appear only after they accept. */
export function toDonorView(r, myResponse, distanceKm) {
  const accepted = myResponse === 'accepted' || myResponse === 'donated';
  return {
    _id: r._id,
    patientName: accepted ? r.patientName : shortName(r.patientName),
    bloodGroup: r.bloodGroup,
    units: r.units,
    hospital: r.hospital,
    notes: r.notes,
    urgency: r.urgency,
    neededBy: r.neededBy,
    status: r.status,
    location: plainPoint(r.location),
    createdAt: r.createdAt,
    distanceKm: distanceKm == null ? null : Math.round(distanceKm * 10) / 10,
    myResponse,
    contactPhone: accepted ? r.contactPhone : null,
  };
}
