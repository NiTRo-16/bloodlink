// Requests nobody closed: once they're well past their needed-by time, mark them expired
// so donors stop seeing them and the map shows only live needs.
import BloodRequest from '../models/BloodRequest.js';
import { broadcast, emitToUser } from './notify.js';

export const EXPIRE_AFTER_MS = 12 * 60 * 60 * 1000; // 12 hours after the needed-by time
const CHECK_EVERY_MS = 10 * 60 * 1000;

/** Expires every open request whose needed-by time passed more than 12 hours ago. Returns how many. */
export async function expireOverdueRequests(now = new Date()) {
  const overdue = await BloodRequest.find(
    { status: 'open', neededBy: { $lt: new Date(now.getTime() - EXPIRE_AFTER_MS) } },
    '_id notifiedDonors'
  ).lean();
  if (!overdue.length) return 0;

  // status: 'open' again here, in case the requester closed one in the meantime.
  await BloodRequest.updateMany(
    { _id: { $in: overdue.map((r) => r._id) }, status: 'open' },
    { status: 'expired', closedAt: now }
  );
  for (const r of overdue) {
    r.notifiedDonors.forEach((id) => emitToUser(id, 'alert:closed', { _id: r._id, status: 'expired' }));
    broadcast('request:closed', { _id: r._id, status: 'expired' });
  }
  return overdue.length;
}

/** Runs the check now and then every 10 minutes for as long as the server runs. */
export function startExpiryJob() {
  const run = () =>
    expireOverdueRequests()
      .then((n) => n && console.log(`Expired ${n} overdue request${n === 1 ? '' : 's'}`))
      .catch((err) => console.error('Expiring requests failed:', err.message));
  run();
  setInterval(run, CHECK_EVERY_MS).unref();
}
