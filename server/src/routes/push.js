import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler, HttpError } from '../utils/http.js';
import { isPushEnabled } from '../services/notify.js';

const router = Router();

// GET /api/push/public-key  (the browser needs this to subscribe)
router.get('/public-key', (_req, res) => {
  res.json({ key: isPushEnabled() ? process.env.VAPID_PUBLIC_KEY : null });
});

// POST /api/push/subscribe  (save this browser's push subscription)
router.post(
  '/subscribe',
  requireAuth,
  asyncHandler(async (req, res) => {
    const sub = req.body?.subscription;
    if (!sub?.endpoint || !/^https:\/\//.test(sub.endpoint) || !sub.keys?.p256dh || !sub.keys?.auth) {
      throw new HttpError(400, 'Invalid push subscription');
    }
    req.user.pushSubscription = { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } };
    await req.user.save();
    res.json({ ok: true });
  })
);

export default router;
