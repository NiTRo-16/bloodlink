// End-to-end API tests: start the real server against a throwaway database and walk
// through the main flows. Needs MongoDB running locally; skipped (not failed) without it.
// The test database is `bloodlink_test` and is dropped before and after the run.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';

const SERVER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MONGO_URI = process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27017/bloodlink_test';
const PORT = 5055;
const BASE = `http://127.0.0.1:${PORT}/api`;
const CENTRE = { lat: 28.6139, lng: 77.209 }; // central Delhi
const DAY = 24 * 60 * 60 * 1000;

let server;
let mongoAvailable = true;

/** A point `north` and `east` km from the centre. */
const near = (north, east) => ({
  lat: CENTRE.lat + north / 111,
  lng: CENTRE.lng + east / (111 * Math.cos((CENTRE.lat * Math.PI) / 180)),
});

async function call(method, route, { token, body } = {}) {
  const res = await fetch(BASE + route, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

function portOpen(port) {
  return new Promise((resolve) => {
    const s = net.connect(port, '127.0.0.1');
    s.once('connect', () => s.end(() => resolve(true)));
    s.once('error', () => resolve(false));
  });
}

before(async () => {
  try {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 2000 });
    await mongoose.connection.dropDatabase();
  } catch {
    mongoAvailable = false;
    return;
  }
  assert.equal(await portOpen(PORT), false, `Port ${PORT} is busy; stop whatever is using it`);

  server = spawn(process.execPath, ['src/index.js'], {
    cwd: SERVER_DIR,
    env: {
      ...process.env,
      PORT: String(PORT),
      MONGO_URI,
      JWT_SECRET: 'test-secret-for-api-tests',
      OTP_DEV_SHOW_CODE: 'true',
      RATE_LIMIT: 'off', // this suite makes many requests from one address; limits have their own suite
      VAPID_PUBLIC_KEY: '',
      VAPID_PRIVATE_KEY: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  server.stdout.on('data', (d) => (output += d));
  server.stderr.on('data', (d) => (output += d));

  for (let i = 0; i < 100; i++) {
    if ((await call('GET', '/health').catch(() => ({}))).status === 200) return;
    if (server.exitCode !== null) break;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`API server did not start:\n${output}`);
});

after(async () => {
  server?.kill();
  if (mongoAvailable) {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});

// Shared state, built up by the tests in order.
const users = {};
let requestId;

/** Signs up the way the app does while codes are on: get a code for the number, then register with it. */
async function register(key, data) {
  const sent = await call('POST', '/auth/register/code', { body: { phone: data.phone } });
  assert.equal(sent.status, 200, JSON.stringify(sent.body));
  const res = await call('POST', '/auth/register', { body: { password: 'password123', ...data, code: sent.body.devCode } });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  users[key] = { ...res.body.user, token: res.body.token };
  return users[key];
}

const it = (name, fn) => test(name, async (t) => (mongoAvailable ? fn(t) : t.skip('MongoDB is not running')));

// ---------- Accounts ----------

it('health check responds', async () => {
  assert.deepEqual((await call('GET', '/health')).body, { ok: true });
});

it('registers donors and a requester', async () => {
  await register('oNeg', { name: 'Aarav', phone: '9100000001', gender: 'male', isDonor: true, bloodGroup: 'O-', ...near(1, 0.5) });
  await register('bPos', { name: 'Rohan', phone: '9100000002', gender: 'male', isDonor: true, bloodGroup: 'B+', ...near(3, -2) });
  await register('aPos', { name: 'Kabir', phone: '9100000003', gender: 'male', isDonor: true, bloodGroup: 'A+', ...near(-1.5, -1) });
  await register('far', { name: 'Meera', phone: '9100000004', gender: 'female', isDonor: true, bloodGroup: 'O+', ...near(30, 0) });
  await register('recent', { name: 'Vikram', phone: '9100000005', gender: 'male', isDonor: true, bloodGroup: 'B+', ...near(1, 1) });
  await register('paused', { name: 'Sneha', phone: '9100000006', gender: 'female', isDonor: true, bloodGroup: 'B-', ...near(0.5, 2) });
  await register('family', { name: 'Sunita', phone: '9100000009', gender: 'female', isDonor: false });
  assert.equal(users.family.isDonor, false);
  assert.equal(users.family.phoneVerified, true);
});

it('will not create an account without confirming the number', async () => {
  const body = { name: 'X', phone: '9100000020', password: 'password123', isDonor: false };
  const noCode = await call('POST', '/auth/register', { body });
  assert.equal(noCode.status, 400);
  assert.match(noCode.body.error, /Confirm your phone number/);

  const sent = await call('POST', '/auth/register/code', { body: { phone: body.phone } });
  const wrongCode = sent.body.devCode === '000000' ? '111111' : '000000';
  const wrong = await call('POST', '/auth/register', { body: { ...body, code: wrongCode } });
  assert.equal(wrong.status, 400);
  assert.match(wrong.body.error, /wrong/);

  // A form mistake is reported first and doesn't use up the code.
  const badForm = await call('POST', '/auth/register', { body: { ...body, password: '123', code: sent.body.devCode } });
  assert.match(badForm.body.error, /at least 6/);
  const ok = await call('POST', '/auth/register', { body: { ...body, code: sent.body.devCode } });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.user.phoneVerified, true);
});

it('does not send sign-up codes to numbers that already have an account', async () => {
  const res = await call('POST', '/auth/register/code', { body: { phone: '9100000001' } });
  assert.equal(res.status, 409);
});

it('keeps sign-up and login codes apart', async () => {
  // A sign-up code can't log anyone in...
  const signup = await call('POST', '/auth/register/code', { body: { phone: '9100000021' } });
  const asLogin = await call('POST', '/auth/otp/verify', { body: { phone: '9100000021', code: signup.body.devCode } });
  assert.equal(asLogin.status, 400);
  // ...and a code sent to someone else's number can't register yours.
  const other = await call('POST', '/auth/register/code', { body: { phone: '9100000022' } });
  const stolen = await call('POST', '/auth/register', {
    body: { name: 'X', phone: '9100000023', password: 'password123', code: other.body.devCode },
  });
  assert.equal(stolen.status, 400);
});

it('never returns password hashes', async () => {
  const res = await call('GET', '/me', { token: users.bPos.token });
  assert.equal(res.status, 200);
  assert.equal(res.body.user.passwordHash, undefined);
  assert.equal(res.body.user.pushSubscription, undefined);
});

it('normalises phone numbers on login', async () => {
  const res = await call('POST', '/auth/login', { body: { phone: '91000-00002', password: 'password123' } });
  assert.equal(res.status, 200);
  assert.equal(res.body.user.name, 'Rohan');
});

it('rejects bad registrations with clear messages', async () => {
  const cases = [
    [{ name: 'X', phone: '123', isDonor: false }, 400, /valid phone/],
    [{ name: 'X', phone: '9100000001', isDonor: false }, 409, /already registered/],
    [{ name: '', phone: '9100000010', isDonor: false }, 400, /Name is required/],
    [{ name: 'X', phone: '9100000011', isDonor: true, bloodGroup: 'C+', ...CENTRE }, 400, /blood group/],
    [{ name: 'X', phone: '9100000012', isDonor: true, bloodGroup: 'O+', lat: 200, lng: 77 }, 400, /valid location/],
  ];
  // These fail on the form before the code is checked, so no code is needed.
  for (const [body, status, message] of cases) {
    const res = await call('POST', '/auth/register', { body: { password: 'password123', ...body } });
    assert.equal(res.status, status, JSON.stringify(body));
    assert.match(res.body.error, message);
  }
  const short = await call('POST', '/auth/register', { body: { name: 'X', phone: '9100000013', password: '123' } });
  assert.equal(short.status, 400);
  assert.match(short.body.error, /at least 6/);
});

it('refuses wrong passwords without saying which part was wrong', async () => {
  for (const body of [{ phone: '9100000002', password: 'nope' }, { phone: '9199999999', password: 'password123' }]) {
    const res = await call('POST', '/auth/login', { body });
    assert.equal(res.status, 401);
    assert.equal(res.body.error, 'Wrong phone number or password');
  }
});

it('requires a valid token for private routes', async () => {
  assert.equal((await call('GET', '/me')).status, 401);
  assert.equal((await call('GET', '/me', { token: 'not-a-token' })).status, 401);
  assert.equal((await call('POST', '/requests', { body: {} })).status, 401);
});

it('records a recent donation and pausing alerts', async () => {
  const recent = await call('PATCH', '/me', {
    token: users.recent.token,
    body: { lastDonationDate: new Date(Date.now() - 30 * DAY).toISOString() },
  });
  assert.equal(recent.body.eligibility.eligible, false);

  const future = await call('PATCH', '/me', { token: users.recent.token, body: { lastDonationDate: new Date(Date.now() + DAY).toISOString() } });
  assert.equal(future.status, 400);

  const paused = await call('PATCH', '/me', { token: users.paused.token, body: { available: false } });
  assert.equal(paused.body.user.available, false);
});

it('only lets someone become a donor with a blood group and location', async () => {
  const res = await call('PATCH', '/me', { token: users.family.token, body: { isDonor: true } });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /blood group and location/);
});

// ---------- Posting and matching ----------

it('validates new requests', async () => {
  const base = { patientName: 'Test', units: 1, hospital: 'AIIMS', neededBy: new Date(Date.now() + DAY).toISOString(), ...CENTRE };
  const bad = [
    [{ ...base, bloodGroup: 'Z+' }, /blood group/],
    [{ ...base, bloodGroup: 'B+', neededBy: 'soon' }, /when the blood is needed/],
    [{ ...base, bloodGroup: 'B+', lat: undefined }, /valid location/],
    [{ ...base, bloodGroup: 'B+', units: 50 }, /units|maximum/i],
  ];
  for (const [body, message] of bad) {
    const res = await call('POST', '/requests', { token: users.family.token, body });
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.match(res.body.error, message);
  }
});

it('alerts only compatible, eligible, available donors within the radius', async () => {
  const res = await call('POST', '/requests', {
    token: users.family.token,
    body: {
      patientName: 'Ramesh Kumar',
      bloodGroup: 'B+',
      units: 2,
      hospital: 'Safdarjung Hospital',
      notes: 'Ward 4',
      urgency: 'critical',
      neededBy: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
      radiusKm: 10,
      ...CENTRE,
    },
  });
  assert.equal(res.status, 201);
  requestId = res.body.request._id;
  // O- (compatible, near) and B+ (exact, near). Not: A+ (incompatible), O+ (30 km away),
  // the B+ who donated 30 days ago, or the B- who paused alerts.
  assert.equal(res.body.notifiedCount, 2);
  assert.equal(res.body.request.contactPhone, '9100000009');
});

it("lists the request in a matching donor's alerts, with distance", async () => {
  const alerts = (await call('GET', '/me/alerts', { token: users.oNeg.token })).body;
  const alert = alerts.find((a) => a._id === requestId);
  assert.ok(alert, 'O- donor should see the B+ request');
  assert.ok(alert.distanceKm > 0 && alert.distanceKm < 10);
  assert.equal(alert.contactPhone, null);

  for (const key of ['aPos', 'far', 'recent', 'paused']) {
    const list = (await call('GET', '/me/alerts', { token: users[key].token })).body;
    assert.equal(list.some((a) => a._id === requestId), false, `${key} should not see it`);
  }
});

it('shows the public map no personal details', async () => {
  const open = (await call('GET', '/requests/open')).body;
  const r = open.find((x) => x._id === requestId);
  assert.ok(r);
  for (const field of ['patientName', 'contactPhone', 'requester', 'notifiedDonors', 'notes']) {
    assert.equal(r[field], undefined, `${field} must not be public`);
  }
});

it('hides the family phone number until a donor accepts', async () => {
  const view = (await call('GET', `/requests/${requestId}`, { token: users.bPos.token })).body;
  assert.equal(view.role, 'viewer');
  assert.equal(view.canRespond, true);
  assert.equal(view.request.contactPhone, null);
  assert.equal(view.request.requesterName, undefined);
});

it('stops donors who cannot give from responding', async () => {
  const incompatible = await call('POST', `/requests/${requestId}/respond`, { token: users.aPos.token, body: { status: 'accepted' } });
  assert.equal(incompatible.status, 403);
  assert.match(incompatible.body.error, /cannot donate/);

  const ineligible = await call('POST', `/requests/${requestId}/respond`, { token: users.recent.token, body: { status: 'accepted' } });
  assert.equal(ineligible.status, 403);
  assert.match(ineligible.body.error, /not yet eligible/);

  const notDonor = await call('POST', `/requests/${requestId}/respond`, { token: users.family.token, body: { status: 'accepted' } });
  assert.equal(notDonor.status, 400); // it's their own request

  const badStatus = await call('POST', `/requests/${requestId}/respond`, { token: users.bPos.token, body: { status: 'maybe' } });
  assert.equal(badStatus.status, 400);
});

it('shares phone numbers both ways once a donor accepts', async () => {
  const res = await call('POST', `/requests/${requestId}/respond`, { token: users.bPos.token, body: { status: 'accepted' } });
  assert.equal(res.status, 200);
  assert.equal(res.body.contactPhone, '9100000009');

  const view = (await call('GET', `/requests/${requestId}`, { token: users.bPos.token })).body;
  assert.equal(view.request.contactPhone, '9100000009');
  assert.equal(view.request.requesterName, 'Sunita');
});

it("keeps a declining donor's number private", async () => {
  await call('POST', `/requests/${requestId}/respond`, { token: users.oNeg.token, body: { status: 'declined' } });
  const owner = (await call('GET', `/requests/${requestId}`, { token: users.family.token })).body;
  assert.equal(owner.role, 'owner');
  assert.equal(owner.request.notifiedCount, 2);
  const byName = Object.fromEntries(owner.responses.map((r) => [r.donor.name, r]));
  assert.equal(byName.Rohan.status, 'accepted');
  assert.equal(byName.Rohan.donor.phone, '9100000002');
  assert.equal(byName.Aarav.status, 'declined');
  assert.equal(byName.Aarav.donor.phone, null);
  // Owners see distances, never donor coordinates.
  assert.equal(byName.Rohan.donor.location, undefined);
  assert.ok(byName.Rohan.donor.distanceKm > 0);
});

it('counts responses on the requester\'s list and the public map', async () => {
  const mine = (await call('GET', '/me/requests', { token: users.family.token })).body;
  const r = mine.find((x) => x._id === requestId);
  assert.equal(r.notifiedCount, 2);
  assert.equal(r.acceptedCount, 1);
  assert.equal(r.notifiedDonors, undefined);

  const open = (await call('GET', '/requests/open')).body;
  assert.equal(open.find((x) => x._id === requestId).acceptedCount, 1);
});

it('allows one response per donor, which they can change', async () => {
  await call('POST', `/requests/${requestId}/respond`, { token: users.oNeg.token, body: { status: 'accepted' } });
  await call('POST', `/requests/${requestId}/respond`, { token: users.oNeg.token, body: { status: 'declined' } });
  const owner = (await call('GET', `/requests/${requestId}`, { token: users.family.token })).body;
  assert.equal(owner.responses.filter((r) => r.donor.name === 'Aarav').length, 1);
  assert.equal(owner.responses.find((r) => r.donor.name === 'Aarav').status, 'declined');
});

it('returns 404 for unknown or malformed request ids', async () => {
  assert.equal((await call('GET', '/requests/not-an-id', { token: users.bPos.token })).status, 404);
  assert.equal((await call('GET', '/requests/64b000000000000000000000', { token: users.bPos.token })).status, 404);
});

// ---------- Closing ----------

it('only the requester can close a request', async () => {
  const res = await call('PATCH', `/requests/${requestId}/status`, { token: users.bPos.token, body: { status: 'fulfilled' } });
  assert.equal(res.status, 403);
});

it('records donations only for donors who accepted, and pauses them', async () => {
  const res = await call('PATCH', `/requests/${requestId}/status`, {
    token: users.family.token,
    body: { status: 'fulfilled', donatedBy: [users.bPos._id, users.oNeg._id, 'junk'] },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.donatedCount, 1); // Aarav declined, so only Rohan counts

  const rohan = (await call('GET', '/me', { token: users.bPos.token })).body;
  assert.equal(rohan.eligibility.eligible, false);
  assert.ok(new Date(rohan.eligibility.nextEligibleDate) > new Date(Date.now() + 80 * DAY));

  const aarav = (await call('GET', '/me', { token: users.oNeg.token })).body;
  assert.equal(aarav.eligibility.eligible, true);

  const history = (await call('GET', '/me/history', { token: users.bPos.token })).body;
  assert.equal(history.find((h) => h.request._id === requestId).status, 'donated');
});

it('closed requests leave the map and refuse changes', async () => {
  const open = (await call('GET', '/requests/open')).body;
  assert.equal(open.some((x) => x._id === requestId), false);

  const again = await call('PATCH', `/requests/${requestId}/status`, { token: users.family.token, body: { status: 'cancelled' } });
  assert.equal(again.status, 409);

  const respond = await call('POST', `/requests/${requestId}/respond`, { token: users.oNeg.token, body: { status: 'accepted' } });
  assert.equal(respond.status, 409);
});

it('a donor who just gave stops getting alerts', async () => {
  const res = await call('POST', '/requests', {
    token: users.family.token,
    body: { patientName: 'Second', bloodGroup: 'B+', units: 1, hospital: 'AIIMS', neededBy: new Date(Date.now() + DAY).toISOString(), radiusKm: 10, ...CENTRE },
  });
  assert.equal(res.body.notifiedCount, 1); // only the O- donor now
  assert.deepEqual((await call('GET', '/me/alerts', { token: users.bPos.token })).body, []);
});

// ---------- Logging in with a code ----------

// These numbers got sign-up codes seconds ago; clear that history so the 30-second resend wait doesn't apply.
const forgetSentCodes = () => mongoose.connection.collection('otpcodes').deleteMany({});

it('logs in with a one-time code', async () => {
  await forgetSentCodes();
  // Pretend Kabir signed up before verification existed: logging in with a code should verify the number.
  await mongoose.connection.collection('users').updateOne({ phone: '9100000003' }, { $set: { phoneVerified: false } });
  assert.deepEqual((await call('GET', '/auth/otp')).body, { enabled: true });

  const unknown = await call('POST', '/auth/otp/request', { body: { phone: '9199999999' } });
  assert.equal(unknown.status, 404);

  const sent = await call('POST', '/auth/otp/request', { body: { phone: '9100000003' } });
  assert.equal(sent.status, 200);
  assert.equal(sent.body.sentTo, '91•••••003');
  assert.match(sent.body.devCode, /^\d{6}$/);

  const tooSoon = await call('POST', '/auth/otp/request', { body: { phone: '9100000003' } });
  assert.equal(tooSoon.status, 429);

  const wrongCode = sent.body.devCode === '000000' ? '111111' : '000000';
  const wrong = await call('POST', '/auth/otp/verify', { body: { phone: '9100000003', code: wrongCode } });
  assert.equal(wrong.status, 400);
  assert.match(wrong.body.error, /4 tries left/);

  const ok = await call('POST', '/auth/otp/verify', { body: { phone: '9100000003', code: sent.body.devCode } });
  assert.equal(ok.status, 200);
  assert.equal((await call('GET', '/me', { token: ok.body.token })).body.user.name, 'Kabir');
  assert.equal(ok.body.user.phoneVerified, true);

  const reused = await call('POST', '/auth/otp/verify', { body: { phone: '9100000003', code: sent.body.devCode } });
  assert.equal(reused.status, 400);
});

it('cancels a code after five wrong tries', async () => {
  const sent = await call('POST', '/auth/otp/request', { body: { phone: '9100000004' } });
  const wrongCode = sent.body.devCode === '000000' ? '111111' : '000000';
  let last;
  for (let i = 0; i < 5; i++) last = await call('POST', '/auth/otp/verify', { body: { phone: '9100000004', code: wrongCode } });
  assert.match(last.body.error, /Too many wrong tries/);
  const right = await call('POST', '/auth/otp/verify', { body: { phone: '9100000004', code: sent.body.devCode } });
  assert.equal(right.status, 400);
});

// ---------- Robustness ----------

it('answers malformed JSON and unknown routes with clean errors', async () => {
  const res = await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad' });
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: 'Invalid JSON' });
  assert.equal((await call('GET', '/nope')).status, 404);
});
