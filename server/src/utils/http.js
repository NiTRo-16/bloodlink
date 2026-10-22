// Small helpers shared by the routes.

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Express 4 does not catch errors from async handlers; this passes them to the error handler. */
export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Build a GeoJSON point from latitude and longitude, validating both. */
export function toPoint(lat, lng) {
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln) || Math.abs(la) > 90 || Math.abs(ln) > 180) {
    throw new HttpError(400, 'A valid location (lat, lng) is required');
  }
  return { type: 'Point', coordinates: [ln, la] };
}

/** Accepts 10 to 15 digits with an optional leading +, ignoring spaces and dashes. */
export function normalizePhone(phone) {
  const cleaned = String(phone ?? '').replace(/[\s-]/g, '');
  if (!/^\+?\d{10,15}$/.test(cleaned)) throw new HttpError(400, 'Enter a valid phone number');
  return cleaned;
}

/** Distance between two GeoJSON points in kilometres (haversine formula). */
export function distanceKm(a, b) {
  if (!a?.coordinates || !b?.coordinates) return null;
  const [lng1, lat1] = a.coordinates;
  const [lng2, lat2] = b.coordinates;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(6371 * 2 * Math.asin(Math.sqrt(h)) * 10) / 10;
}

/** The fields of a request that anyone may see. No patient name or phone numbers. */
export function publicRequest(r, acceptedCount = 0) {
  return {
    _id: r._id,
    bloodGroup: r.bloodGroup,
    units: r.units,
    hospital: r.hospital,
    urgency: r.urgency,
    neededBy: r.neededBy,
    status: r.status,
    location: { type: 'Point', coordinates: [...r.location.coordinates] },
    createdAt: r.createdAt,
    acceptedCount,
  };
}
