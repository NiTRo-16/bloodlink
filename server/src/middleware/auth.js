import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { HttpError, asyncHandler } from '../utils/http.js';

export function signToken(user) {
  return jwt.sign({ sub: String(user._id) }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

/** Returns the user id inside a valid token, or null. */
export function verifyToken(token) {
  try {
    return jwt.verify(token, process.env.JWT_SECRET).sub;
  } catch {
    return null;
  }
}

/** Requires `Authorization: Bearer <token>` and puts the user on req.user. */
export const requireAuth = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const userId = token && verifyToken(token);
  if (!userId) throw new HttpError(401, 'Please log in');

  const user = await User.findById(userId);
  if (!user) throw new HttpError(401, 'Account not found');
  req.user = user;
  next();
});
