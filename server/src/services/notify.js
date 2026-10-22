// Real-time alerts (Socket.io) and push notifications (Web Push).
import { Server } from 'socket.io';
import webpush from 'web-push';
import User from '../models/User.js';
import { verifyToken } from '../middleware/auth.js';

let io = null;
let pushEnabled = false;

export function initRealtime(httpServer, clientUrl) {
  io = new Server(httpServer, { cors: { origin: clientUrl } });

  // Logged-in users join a private room so we can alert them personally.
  // Everyone (even logged out) gets public map updates.
  io.on('connection', (socket) => {
    const userId = socket.handshake.auth?.token && verifyToken(socket.handshake.auth.token);
    if (userId) socket.join(`user:${userId}`);
  });

  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_EMAIL } = process.env;
  if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(VAPID_EMAIL || 'mailto:admin@example.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    pushEnabled = true;
    console.log('Web Push enabled');
  } else {
    console.log('Web Push disabled (no VAPID keys). Live alerts still work while the app is open.');
  }
}

/** Send an event to one user's open tabs. */
export function emitToUser(userId, event, payload) {
  io?.to(`user:${userId}`).emit(event, payload);
}

/** Send an event to everyone connected (used for the public live map). */
export function broadcast(event, payload) {
  io?.emit(event, payload);
}

/** Push notification that reaches the phone even when the app is closed. */
export async function sendPush(user, payload) {
  if (!pushEnabled || !user.pushSubscription) return;
  try {
    await webpush.sendNotification(user.pushSubscription, JSON.stringify(payload));
  } catch (err) {
    // 404/410 means the subscription expired; forget it.
    if (err.statusCode === 404 || err.statusCode === 410) {
      await User.updateOne({ _id: user._id }, { pushSubscription: null });
    } else {
      console.warn('Push failed:', err.message);
    }
  }
}

export function isPushEnabled() {
  return pushEnabled;
}
