import { Router } from 'express';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import { signToken } from '../middleware/auth.js';
import { asyncHandler, HttpError, normalizePhone, toPoint } from '../utils/http.js';
import { isValidBloodGroup } from '../utils/compatibility.js';
import { isOtpEnabled } from '../services/sms.js';
import { consumeCode, issueCode } from '../services/otp.js';
import { loginLimits, otpLimit, signupLimit } from '../middleware/rateLimits.js';

const router = Router();

const ALREADY_REGISTERED = 'This phone number is already registered';

// POST /api/auth/register/code  { phone }  (send a code to confirm the number before signing up)
router.post(
  '/register/code',
  signupLimit,
  asyncHandler(async (req, res) => {
    const phone = normalizePhone(req.body.phone);
    if (!isOtpEnabled()) throw new HttpError(503, 'Phone codes are not available yet.');
    if (await User.exists({ phone })) throw new HttpError(409, ALREADY_REGISTERED);
    res.json(await issueCode(phone, 'signup'));
  })
);

// POST /api/auth/register
// While codes can be delivered, `code` (from /register/code) is required and the number is marked verified.
// Without any way to send codes, accounts are still created, with phoneVerified: false.
router.post(
  '/register',
  signupLimit,
  asyncHandler(async (req, res) => {
    const { name, password, gender, isDonor, bloodGroup, lat, lng } = req.body;
    const phone = normalizePhone(req.body.phone);

    if (!name?.trim()) throw new HttpError(400, 'Name is required');
    if (!password || password.length < 6) throw new HttpError(400, 'Password must be at least 6 characters');
    if (await User.exists({ phone })) throw new HttpError(409, ALREADY_REGISTERED);

    const data = {
      name: name.trim(),
      phone,
      gender: ['male', 'female', 'other'].includes(gender) ? gender : 'other',
      passwordHash: await bcrypt.hash(password, 10),
      isDonor: Boolean(isDonor),
    };

    if (data.isDonor) {
      if (!isValidBloodGroup(bloodGroup)) throw new HttpError(400, 'Choose your blood group');
      data.bloodGroup = bloodGroup;
      data.location = toPoint(lat, lng); // donors need a location to be matched
    } else if (lat != null && lng != null) {
      data.location = toPoint(lat, lng);
    }

    // Checked last, so a mistake elsewhere in the form doesn't use up the code.
    if (isOtpEnabled()) {
      if (!req.body.code) throw new HttpError(400, 'Confirm your phone number with the code we sent');
      await consumeCode(phone, req.body.code, 'signup');
      data.phoneVerified = true;
    }

    const user = await User.create(data);
    res.status(201).json({ token: signToken(user), user });
  })
);

// POST /api/auth/login
router.post(
  '/login',
  loginLimits,
  asyncHandler(async (req, res) => {
    const phone = normalizePhone(req.body.phone);
    const user = await User.findOne({ phone });
    const ok = user && (await bcrypt.compare(String(req.body.password ?? ''), user.passwordHash));
    if (!ok) throw new HttpError(401, 'Wrong phone number or password');
    res.json({ token: signToken(user), user });
  })
);

// GET /api/auth/otp  (whether one-time codes are offered, for logging in and confirming numbers)
router.get('/otp', (_req, res) => res.json({ enabled: isOtpEnabled() }));

// POST /api/auth/otp/request  { phone }  (send a login code)
router.post(
  '/otp/request',
  otpLimit,
  asyncHandler(async (req, res) => {
    const phone = normalizePhone(req.body.phone);
    if (!isOtpEnabled()) throw new HttpError(503, 'Logging in with a code is not available yet. Use your password.');
    if (!(await User.exists({ phone }))) {
      throw new HttpError(404, 'No account uses this number. Check it, or create an account.');
    }
    res.json(await issueCode(phone, 'login'));
  })
);

// POST /api/auth/otp/verify  { phone, code }  (log in with the code)
router.post(
  '/otp/verify',
  otpLimit,
  asyncHandler(async (req, res) => {
    const phone = normalizePhone(req.body.phone);
    await consumeCode(phone, req.body.code, 'login');
    const user = await User.findOne({ phone });
    if (!user) throw new HttpError(401, 'Account not found');
    // Receiving the code proves they own the number, so older accounts get verified this way too.
    if (!user.phoneVerified) {
      user.phoneVerified = true;
      await user.save();
    }
    res.json({ token: signToken(user), user });
  })
);

export default router;
