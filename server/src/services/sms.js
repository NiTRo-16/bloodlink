// Delivering one-time login and sign-up codes.
//
// Real SMS goes through MSG91 (https://msg91.com) once these are set in server/.env:
//   MSG91_AUTH_KEY      your MSG91 auth key
//   MSG91_TEMPLATE_ID   the ID of your DLT-approved OTP template; its code placeholder is filled with ours
// Optional: MSG91_COUNTRY_CODE (default 91), MSG91_API_URL (only for tests).
//
// For local testing only, OTP_DEV_SHOW_CODE=true prints the code in the server log and
// returns it to the browser so the login page can show it. Never set it on a live site:
// anyone could log in as anyone. When MSG91 is configured, it is used instead.
import { HttpError } from '../utils/http.js';
import { maskPhone, OTP } from '../utils/otp.js';

const showCode = () => process.env.OTP_DEV_SHOW_CODE === 'true';
const msg91Configured = () => Boolean(process.env.MSG91_AUTH_KEY && process.env.MSG91_TEMPLATE_ID);

export function isOtpEnabled() {
  return msg91Configured() || showCode();
}

/** Sends the code. Returns { devCode } only when codes are shown instead of texted. */
export async function sendOtp(phone, code) {
  if (msg91Configured()) {
    await sendWithMsg91(phone, code);
    return {};
  }
  if (showCode()) {
    console.log(`[OTP] Login code for ${maskPhone(phone)}: ${code}`);
    return { devCode: code };
  }
  throw new HttpError(503, 'Logging in with a code is not available yet. Use your password.');
}

/** MSG91 wants the country code in front: 9876543210 → 919876543210, +447700900123 → 447700900123. */
export function toMsg91Mobile(phone) {
  const digits = String(phone).replace(/^\+/, '');
  return digits.length === 10 ? `${process.env.MSG91_COUNTRY_CODE || '91'}${digits}` : digits;
}

const SEND_FAILED = "We couldn't send the code. Try again in a minute, or log in with your password.";

async function sendWithMsg91(phone, code) {
  const url = new URL(process.env.MSG91_API_URL || 'https://control.msg91.com/api/v5/otp');
  url.search = new URLSearchParams({
    template_id: process.env.MSG91_TEMPLATE_ID,
    mobile: toMsg91Mobile(phone),
    otp: code, // our own code, so checking it stays in this app
    otp_expiry: String(OTP.ttlMs / 60000), // minutes
  });

  let res;
  let body;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { authkey: process.env.MSG91_AUTH_KEY, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    body = await res.json().catch(() => ({}));
  } catch (err) {
    console.error(`[OTP] MSG91 unreachable for ${maskPhone(phone)}:`, err.message);
    throw new HttpError(502, SEND_FAILED);
  }

  // MSG91 can answer 200 OK with { type: 'error' }, so both are checked.
  if (!res.ok || body.type !== 'success') {
    console.error(`[OTP] MSG91 refused to send to ${maskPhone(phone)} (HTTP ${res.status}):`, body.message || body);
    throw new HttpError(502, SEND_FAILED);
  }
}
