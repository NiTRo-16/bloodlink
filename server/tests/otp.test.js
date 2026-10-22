import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkSend, generateCode, hashCode, hashesMatch, maskPhone, OTP } from '../src/utils/otp.js';

const SECRET = 'test-secret';

test('codes are six digits, including leading zeros', () => {
  for (let i = 0; i < 200; i++) assert.match(generateCode(), /^\d{6}$/);
});

test('a code only matches the phone it was sent to', () => {
  const stored = hashCode('9000000003', '123456', SECRET);
  assert.equal(hashesMatch(stored, hashCode('9000000003', '123456', SECRET)), true);
  assert.equal(hashesMatch(stored, hashCode('9000000003', '123457', SECRET)), false);
  assert.equal(hashesMatch(stored, hashCode('9000000004', '123456', SECRET)), false);
});

test('hash comparison rejects missing or malformed values', () => {
  assert.equal(hashesMatch(null, 'ab'), false);
  assert.equal(hashesMatch('abcd', 'ab'), false);
});

test('the first code for a phone is allowed', () => {
  const now = 1_000_000;
  assert.deepEqual(checkSend(null, now), { ok: true, windowStart: now, sends: 1 });
});

test('a new code must wait 30 seconds after the last one', () => {
  const now = 1_000_000;
  const r = checkSend({ lastSentAt: now - 10_000, windowStart: now - 10_000, sends: 1 }, now);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'cooldown');
  assert.equal(r.waitMs, OTP.resendMs - 10_000);
});

test('after the cooldown, sends in the same hour are counted', () => {
  const now = 1_000_000;
  const r = checkSend({ lastSentAt: now - 60_000, windowStart: now - 120_000, sends: 2 }, now);
  assert.deepEqual(r, { ok: true, windowStart: now - 120_000, sends: 3 });
});

test('the sixth code in an hour is refused', () => {
  const now = 10_000_000;
  const r = checkSend({ lastSentAt: now - 60_000, windowStart: now - 600_000, sends: OTP.maxSends }, now);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'limit');
  assert.equal(r.waitMs, OTP.windowMs - 600_000);
});

test('the hourly count starts again after an hour', () => {
  const now = 10_000_000;
  const r = checkSend({ lastSentAt: now - OTP.windowMs, windowStart: now - OTP.windowMs, sends: OTP.maxSends }, now);
  assert.deepEqual(r, { ok: true, windowStart: now, sends: 1 });
});

test('phone numbers are masked except the first two and last three digits', () => {
  assert.equal(maskPhone('9876543210'), '98•••••210');
});
