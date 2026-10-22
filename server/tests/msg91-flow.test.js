// The real server talking to a fake MSG91 running on this machine: sign up and log in with texted codes.
// Needs MongoDB; uses (and drops) the `bloodlink_test_sms` database.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';

const SERVER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MONGO_URI = process.env.TEST_SMS_MONGO_URI || 'mongodb://127.0.0.1:27017/bloodlink_test_sms';
const PORT = 5056;
const BASE = `http://127.0.0.1:${PORT}/api`;

let server;
let fakeMsg91;
let mongoAvailable = true;
const texts = []; // what the fake MSG91 was asked to send
let failNext = false;

async function call(method, route, body) {
  const res = await fetch(BASE + route, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

before(async () => {
  try {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 2000 });
    await mongoose.connection.dropDatabase();
  } catch {
    mongoAvailable = false;
    return;
  }

  fakeMsg91 = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://fake');
    res.setHeader('Content-Type', 'application/json');
    if (req.headers.authkey !== 'fake-key') return res.end(JSON.stringify({ type: 'error', message: 'Bad authkey' }));
    if (failNext) {
      failNext = false;
      return res.end(JSON.stringify({ type: 'error', message: 'Template not approved' })); // 200 with an error, like MSG91
    }
    texts.push(Object.fromEntries(url.searchParams));
    res.end(JSON.stringify({ type: 'success', request_id: `req-${texts.length}` }));
  });
  await new Promise((resolve) => fakeMsg91.listen(0, '127.0.0.1', resolve));

  server = spawn(process.execPath, ['src/index.js'], {
    cwd: SERVER_DIR,
    env: {
      ...process.env,
      PORT: String(PORT),
      MONGO_URI,
      JWT_SECRET: 'test-secret-for-msg91-tests',
      MSG91_AUTH_KEY: 'fake-key',
      MSG91_TEMPLATE_ID: 'tmpl-test',
      MSG91_API_URL: `http://127.0.0.1:${fakeMsg91.address().port}/api/v5/otp`,
      OTP_DEV_SHOW_CODE: 'false',
      RATE_LIMIT: 'off', // this suite makes many requests from one address; limits have their own suite
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
  fakeMsg91?.close();
  if (mongoAvailable) {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});

const it = (name, fn) => test(name, async (t) => (mongoAvailable ? fn(t) : t.skip('MongoDB is not running')));

it('turns codes on when MSG91 is configured', async () => {
  assert.deepEqual((await call('GET', '/auth/otp')).body, { enabled: true });
});

it('a failed text can be retried straight away', async () => {
  failNext = true;
  const failed = await call('POST', '/auth/register/code', { phone: '9200000001' });
  assert.equal(failed.status, 502);
  assert.match(failed.body.error, /couldn't send the code/);

  // Not blocked by the 30-second wait, because nothing was sent.
  const retry = await call('POST', '/auth/register/code', { phone: '9200000001' });
  assert.equal(retry.status, 200);
});

it('signs up with the code from the text, which is never sent to the browser', async () => {
  const sms = texts.at(-1);
  assert.equal(sms.mobile, '919200000001');
  assert.equal(sms.template_id, 'tmpl-test');
  assert.match(sms.otp, /^\d{6}$/);

  const res = await call('POST', '/auth/register', {
    name: 'Priya', phone: '9200000001', password: 'password123', isDonor: false, code: sms.otp,
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.user.phoneVerified, true);
});

it('logs in with a texted code', async () => {
  // The sign-up text was just sent to this number; clear it so the 30-second wait doesn't apply.
  await mongoose.connection.collection('otpcodes').deleteMany({});
  const sent = await call('POST', '/auth/otp/request', { phone: '9200000001' });
  assert.equal(sent.status, 200);
  assert.equal(sent.body.devCode, undefined);

  const res = await call('POST', '/auth/otp/verify', { phone: '9200000001', code: texts.at(-1).otp });
  assert.equal(res.status, 200);
  assert.equal(res.body.user.name, 'Priya');
});
