// One-time login codes: the rules, kept free of the database so they are easy to unit test.
import crypto from 'node:crypto';

export const OTP = {
  length: 6,
  ttlMs: 5 * 60 * 1000, // a code works for 5 minutes
  resendMs: 30 * 1000, // wait 30 seconds before asking for another
  maxAttempts: 5, // wrong guesses before the code is cancelled
  windowMs: 60 * 60 * 1000, // at most `maxSends` codes per hour per phone
  maxSends: 5,
};

export function generateCode() {
  return String(crypto.randomInt(0, 10 ** OTP.length)).padStart(OTP.length, '0');
}

/** Codes are stored only as a keyed hash, tied to the phone number they were sent to. */
export function hashCode(phone, code, secret) {
  return crypto.createHmac('sha256', secret).update(`${phone}:${code}`).digest('hex');
}

/** Constant-time comparison of two hex hashes. */
export function hashesMatch(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

/**
 * Whether a new code may be sent, given the phone's last record.
 * Returns { ok: true, windowStart, sends } with the counters to store,
 * or { ok: false, waitMs, reason } explaining how long to wait.
 */
export function checkSend(record, now = Date.now()) {
  if (record?.lastSentAt && now - record.lastSentAt < OTP.resendMs) {
    return { ok: false, reason: 'cooldown', waitMs: OTP.resendMs - (now - record.lastSentAt) };
  }
  const windowOpen = record?.windowStart && now - record.windowStart < OTP.windowMs;
  const windowStart = windowOpen ? record.windowStart : now;
  const sends = windowOpen ? record.sends ?? 0 : 0;
  if (sends >= OTP.maxSends) {
    return { ok: false, reason: 'limit', waitMs: OTP.windowMs - (now - windowStart) };
  }
  return { ok: true, windowStart, sends: sends + 1 };
}

/** "98•••••210" style, for telling people where the code went without echoing the full number. */
export function maskPhone(phone) {
  const digits = String(phone);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 2)}${'•'.repeat(digits.length - 5)}${digits.slice(-3)}`;
}
