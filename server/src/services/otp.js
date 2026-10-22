// Sending and checking one-time codes. Used for logging in and for confirming a phone number at sign-up.
// A code is tied to its purpose, so a sign-up code can't be used to log in and the other way round.
import OtpCode from '../models/OtpCode.js';
import { HttpError } from '../utils/http.js';
import { checkSend, generateCode, hashCode, hashesMatch, maskPhone, OTP } from '../utils/otp.js';
import { sendOtp } from './sms.js';

const seconds = (ms) => Math.ceil(ms / 1000);

/** Sends a new code to `phone`, subject to the rate limits. Returns what the browser needs to show. */
export async function issueCode(phone, purpose) {
  const now = Date.now();
  const record = await OtpCode.findOne({ phone }).lean();
  const allowed = checkSend(
    record && { lastSentAt: +record.lastSentAt, windowStart: +record.windowStart, sends: record.sends },
    now
  );
  if (!allowed.ok) {
    throw new HttpError(
      429,
      allowed.reason === 'cooldown'
        ? `Wait ${seconds(allowed.waitMs)} seconds before asking for a new code.`
        : `Too many codes asked for. Try again in ${Math.ceil(allowed.waitMs / 60000)} minutes.`
    );
  }

  const code = generateCode();
  const expiresAt = now + OTP.ttlMs;
  await OtpCode.updateOne(
    { phone },
    {
      purpose,
      codeHash: hashCode(phone, code, process.env.JWT_SECRET),
      expiresAt: new Date(expiresAt),
      attempts: 0,
      lastSentAt: new Date(now),
      windowStart: new Date(allowed.windowStart),
      sends: allowed.sends,
      purgeAt: new Date(Math.max(expiresAt, allowed.windowStart + OTP.windowMs)),
    },
    { upsert: true }
  );

  let devCode;
  try {
    ({ devCode } = await sendOtp(phone, code));
  } catch (err) {
    // Nothing reached the phone, so don't count this send against the limits or leave a live code behind.
    if (record) {
      await OtpCode.updateOne(
        { phone },
        { codeHash: null, lastSentAt: record.lastSentAt, windowStart: record.windowStart, sends: record.sends }
      );
    } else {
      await OtpCode.deleteOne({ phone });
    }
    throw err;
  }
  return {
    sentTo: maskPhone(phone),
    expiresIn: seconds(OTP.ttlMs),
    resendIn: seconds(OTP.resendMs),
    ...(devCode && { devCode }),
  };
}

/** Checks `code` for `phone` and uses it up. Throws a 400 with a clear message if it doesn't match. */
export async function consumeCode(phone, rawCode, purpose) {
  const code = String(rawCode ?? '').trim();
  if (!new RegExp(`^\\d{${OTP.length}}$`).test(code)) throw new HttpError(400, `Enter the ${OTP.length}-digit code`);

  // Count the attempt atomically before checking, so parallel guesses can't exceed the limit.
  const record = await OtpCode.findOneAndUpdate(
    { phone, purpose, codeHash: { $ne: null }, expiresAt: { $gt: new Date() }, attempts: { $lt: OTP.maxAttempts } },
    { $inc: { attempts: 1 } },
    { new: true }
  );
  if (!record) throw new HttpError(400, 'This code has expired or was already used. Ask for a new one.');

  if (!hashesMatch(record.codeHash, hashCode(phone, code, process.env.JWT_SECRET))) {
    const left = OTP.maxAttempts - record.attempts;
    if (left <= 0) {
      await OtpCode.updateOne({ _id: record._id }, { codeHash: null });
      throw new HttpError(400, 'Too many wrong tries. Ask for a new code.');
    }
    throw new HttpError(400, `That code is wrong. ${left} ${left === 1 ? 'try' : 'tries'} left.`);
  }

  // A code works once.
  await OtpCode.updateOne({ _id: record._id }, { codeHash: null });
}
