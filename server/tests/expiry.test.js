// Automatic expiry of requests nobody closed. Needs MongoDB; uses (and drops) `bloodlink_test_expiry`.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import BloodRequest from '../src/models/BloodRequest.js';
import { EXPIRE_AFTER_MS, expireOverdueRequests } from '../src/services/expiry.js';

const MONGO_URI = process.env.TEST_EXPIRY_MONGO_URI || 'mongodb://127.0.0.1:27017/bloodlink_test_expiry';
const HOUR = 60 * 60 * 1000;
let mongoAvailable = true;

before(async () => {
  try {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 2000 });
    await mongoose.connection.dropDatabase();
  } catch {
    mongoAvailable = false;
  }
});
after(async () => {
  if (!mongoAvailable) return;
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

const request = (neededBy, status = 'open') =>
  BloodRequest.create({
    requester: new mongoose.Types.ObjectId(),
    patientName: 'Test',
    bloodGroup: 'O+',
    units: 1,
    hospital: 'AIIMS',
    contactPhone: '9000000000',
    location: { type: 'Point', coordinates: [77.2, 28.6] },
    neededBy,
    status,
  });

test('expires open requests 12 hours after they were needed, and nothing else', async (t) => {
  if (!mongoAvailable) return t.skip('MongoDB is not running');
  const now = new Date();
  const overdue = await request(new Date(now - EXPIRE_AFTER_MS - HOUR));
  const recentlyDue = await request(new Date(now - EXPIRE_AFTER_MS + HOUR)); // only 11 hours late
  const future = await request(new Date(now.getTime() + 6 * HOUR));
  const oldButFulfilled = await request(new Date(now - 10 * EXPIRE_AFTER_MS), 'fulfilled');

  assert.equal(await expireOverdueRequests(now), 1);

  const status = async (r) => (await BloodRequest.findById(r._id)).status;
  assert.equal(await status(overdue), 'expired');
  assert.equal((await BloodRequest.findById(overdue._id)).closedAt.getTime(), now.getTime());
  assert.equal(await status(recentlyDue), 'open');
  assert.equal(await status(future), 'open');
  assert.equal(await status(oldButFulfilled), 'fulfilled');

  // Running again changes nothing.
  assert.equal(await expireOverdueRequests(now), 0);
});
