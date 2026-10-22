// Security headers and rate limits, against the real server with its normal (production) limits.
// Needs MongoDB; uses (and drops) the `bloodlink_test_security` database.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';

const SERVER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MONGO_URI = process.env.TEST_SECURITY_MONGO_URI || 'mongodb://127.0.0.1:27017/bloodlink_test_security';
const PORT = 5058;
const BASE = `http://127.0.0.1:${PORT}/api`;

let server;
let mongoAvailable = true;

async function call(method, route, { token, body } = {}) {
  const res = await fetch(BASE + route, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, headers: res.headers, body: await res.json().catch(() => ({})) };
}

before(async () => {
  try {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 2000 });
    await mongoose.connection.dropDatabase();
  } catch {
    mongoAvailable = false;
    return;
  }
  const env = { ...process.env, PORT: String(PORT), MONGO_URI, JWT_SECRET: 'test-secret-for-security-tests', OTP_DEV_SHOW_CODE: 'false' };
  for (const key of ['RATE_LIMIT', 'MSG91_AUTH_KEY', 'MSG91_TEMPLATE_ID', 'TRUST_PROXY', 'RENDER']) delete env[key];
  server = spawn(process.execPath, ['src/index.js'], { cwd: SERVER_DIR, env, stdio: ['ignore', 'pipe', 'pipe'] });
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

const it = (name, fn) => test(name, async (t) => (mongoAvailable ? fn(t) : t.skip('MongoDB is not running')));

async function signUp(phone, name) {
  // Codes are off in this suite, so sign-up doesn't need one.
  const res = await call('POST', '/auth/register', { body: { name, phone, password: 'password123', isDonor: false } });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.token;
}

it('sends security headers and hides the framework', async () => {
  const { headers } = await call('GET', '/health');
  assert.equal(headers.get('x-powered-by'), null);
  assert.equal(headers.get('x-content-type-options'), 'nosniff');
  assert.equal(headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
  const csp = headers.get('content-security-policy');
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /frame-ancestors 'self'/);
  assert.match(csp, /img-src 'self' data: https:\/\/\*\.tile\.openstreetmap\.org/);
  assert.doesNotMatch(csp, /upgrade-insecure-requests/);
});

it('locks a phone number after 10 wrong passwords, even for the right one', async () => {
  await signUp('9300000001', 'Asha');
  // Successful logins don't count towards the limit...
  for (let i = 0; i < 12; i++) {
    assert.equal((await call('POST', '/auth/login', { body: { phone: '9300000001', password: 'password123' } })).status, 200);
  }
  // ...so the number still gets its full 10 wrong tries.
  for (let i = 0; i < 10; i++) {
    const res = await call('POST', '/auth/login', { body: { phone: '9300000001', password: 'wrong' } });
    assert.equal(res.status, 401, `attempt ${i + 1}`);
  }
  const locked = await call('POST', '/auth/login', { body: { phone: '9300000001', password: 'password123' } });
  assert.equal(locked.status, 429);
  assert.match(locked.body.error, /Too many failed logins for this number/);
  assert.ok(locked.headers.get('ratelimit'), 'tells the client when to retry');
});

it('allows 5 blood requests an hour per account', async () => {
  const token = await signUp('9300000003', 'Meena');
  const body = {
    patientName: 'Test', bloodGroup: 'O+', units: 1, hospital: 'AIIMS',
    neededBy: new Date(Date.now() + 86400000).toISOString(), lat: 28.6, lng: 77.2,
  };
  for (let i = 0; i < 5; i++) assert.equal((await call('POST', '/requests', { token, body })).status, 201, `request ${i + 1}`);
  const sixth = await call('POST', '/requests', { token, body });
  assert.equal(sixth.status, 429);
  assert.match(sixth.body.error, /5 requests in the last hour/);

  // Someone else can still post.
  const other = await signUp('9300000004', 'Kiran');
  assert.equal((await call('POST', '/requests', { token: other, body })).status, 201);
});

// Last, because it uses up this address's allowance of failed logins for the rest of the run.
it('limits failed logins from one address across different numbers', async () => {
  let blocked;
  for (let i = 0; i < 25 && !blocked; i++) {
    const res = await call('POST', '/auth/login', { body: { phone: `93100000${String(i).padStart(2, '0')}`, password: 'wrong' } });
    if (res.status === 429) blocked = res;
  }
  assert.ok(blocked, 'expected the per-address limit to kick in');
  assert.match(blocked.body.error, /Too many failed logins\. Try again in 15 minutes/);
});
