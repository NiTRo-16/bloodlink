// Limits on how often the same visitor, phone number or account can hit sensitive routes.
// Counts live in memory: fine for one server; a restart resets them.
// RATE_LIMIT=off switches them off (the API test suite does this; never on a live site).
import rateLimit from 'express-rate-limit';

const MINUTE = 60 * 1000;
const enabled = () => process.env.RATE_LIMIT !== 'off';

function limit({ minutes, max, message, by, onlyFailures = false }) {
  return rateLimit({
    windowMs: minutes * MINUTE,
    limit: max,
    message: { error: message },
    keyGenerator: by, // default: the visitor's IP
    skipSuccessfulRequests: onlyFailures,
    skip: () => !enabled(),
    standardHeaders: 'draft-7', // tells clients when they can retry
    legacyHeaders: false,
  });
}

const byPhone = (req) => `phone:${String(req.body?.phone ?? '').replace(/\D/g, '')}`;
const byUser = (req) => `user:${req.user._id}`;

/** A ceiling on all API traffic from one IP. */
export const apiLimit = limit({ minutes: 1, max: 300, message: 'Too many requests. Slow down and try again in a minute.' });

/** Wrong passwords: per IP, and per phone number so spreading guesses across IPs doesn't help. */
export const loginLimits = [
  limit({ minutes: 15, max: 20, onlyFailures: true, message: 'Too many failed logins. Try again in 15 minutes.' }),
  limit({ minutes: 15, max: 10, onlyFailures: true, by: byPhone, message: 'Too many failed logins for this number. Try again in 15 minutes, or log in with a code.' }),
];

/** Creating accounts (asking for a sign-up code and registering both count). */
export const signupLimit = limit({ minutes: 60, max: 30, message: 'Too many sign-ups from this network. Try again in an hour.' });

/** Asking for and entering one-time codes, per IP (each phone number also has its own limits). */
export const otpLimit = limit({ minutes: 15, max: 30, message: 'Too many code requests. Try again in 15 minutes.' });

/** Posting blood requests, per account: alerts reach many donors, so this guards against spam. */
export const postRequestLimit = limit({ minutes: 60, max: 5, by: byUser, message: "You've posted 5 requests in the last hour. Wait a while before posting another." });

/** Confirming account deletion with a password, per account (a stolen login can't be used to guess it). */
export const deleteAccountLimit = limit({ minutes: 15, max: 5, by: byUser, message: 'Too many tries. Wait 15 minutes before trying again.' });

/** Accepting or declining requests, per account. */
export const respondLimit = limit({ minutes: 60, max: 60, by: byUser, message: 'Too many responses. Try again later.' });
