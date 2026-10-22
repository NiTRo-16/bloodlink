// sms.js with a fake MSG91: no real texts are sent.
import { test, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { isOtpEnabled, sendOtp, toMsg91Mobile } from '../src/services/sms.js';

const KEYS = ['MSG91_AUTH_KEY', 'MSG91_TEMPLATE_ID', 'MSG91_COUNTRY_CODE', 'MSG91_API_URL', 'OTP_DEV_SHOW_CODE'];
let saved;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  KEYS.forEach((k) => delete process.env[k]);
  mock.method(console, 'log', () => {});
  mock.method(console, 'error', () => {});
});
afterEach(() => {
  KEYS.forEach((k) => (saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k])));
  mock.restoreAll();
});

const useMsg91 = () => {
  process.env.MSG91_AUTH_KEY = 'test-auth-key';
  process.env.MSG91_TEMPLATE_ID = 'tmpl-123';
};
const fakeMsg91 = (status, body) =>
  mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify(body), { status }));

test('codes are off when neither MSG91 nor test mode is set up', async () => {
  assert.equal(isOtpEnabled(), false);
  await assert.rejects(sendOtp('9876543210', '123456'), { status: 503 });
});

test('MSG91 needs both the auth key and the template ID', () => {
  process.env.MSG91_AUTH_KEY = 'only-the-key';
  assert.equal(isOtpEnabled(), false);
  process.env.MSG91_TEMPLATE_ID = 'tmpl-123';
  assert.equal(isOtpEnabled(), true);
});

test('test mode returns the code instead of texting it', async () => {
  process.env.OTP_DEV_SHOW_CODE = 'true';
  assert.deepEqual(await sendOtp('9876543210', '123456'), { devCode: '123456' });
});

test('sends our code to MSG91 with the key, template and Indian number', async () => {
  useMsg91();
  const fetch = fakeMsg91(200, { type: 'success', request_id: 'abc' });

  assert.deepEqual(await sendOtp('9876543210', '048213'), {});
  const [url, options] = fetch.mock.calls[0].arguments;
  assert.equal(url.origin + url.pathname, 'https://control.msg91.com/api/v5/otp');
  assert.equal(url.searchParams.get('template_id'), 'tmpl-123');
  assert.equal(url.searchParams.get('mobile'), '919876543210');
  assert.equal(url.searchParams.get('otp'), '048213');
  assert.equal(url.searchParams.get('otp_expiry'), '5');
  assert.equal(options.method, 'POST');
  assert.equal(options.headers.authkey, 'test-auth-key');
});

test('a live MSG91 setup never reveals the code, even if test mode is also on', async () => {
  useMsg91();
  process.env.OTP_DEV_SHOW_CODE = 'true';
  fakeMsg91(200, { type: 'success' });
  assert.deepEqual(await sendOtp('9876543210', '123456'), {});
});

test("MSG91's '200 OK but type: error' counts as a failure", async () => {
  useMsg91();
  fakeMsg91(200, { type: 'error', message: 'Invalid template' });
  await assert.rejects(sendOtp('9876543210', '123456'), { status: 502, message: /couldn't send the code/ });
});

test('HTTP errors and network failures are reported the same friendly way', async () => {
  useMsg91();
  fakeMsg91(401, { type: 'error', message: 'Unauthorized' });
  await assert.rejects(sendOtp('9876543210', '123456'), { status: 502 });

  mock.method(globalThis, 'fetch', async () => {
    throw new TypeError('fetch failed');
  });
  await assert.rejects(sendOtp('9876543210', '123456'), { status: 502 });
});

test('numbers get the country code MSG91 expects', () => {
  assert.equal(toMsg91Mobile('9876543210'), '919876543210');
  assert.equal(toMsg91Mobile('+919876543210'), '919876543210');
  assert.equal(toMsg91Mobile('+447700900123'), '447700900123');
  process.env.MSG91_COUNTRY_CODE = '977';
  assert.equal(toMsg91Mobile('9812345678'), '9779812345678');
});
