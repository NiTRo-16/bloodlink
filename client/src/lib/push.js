import { api } from './api.js';

export function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
}

export function notificationsSupported() {
  return 'Notification' in window && 'serviceWorker' in navigator;
}

function base64ToBytes(base64) {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

/**
 * Asks for notification permission and, if the server has push keys,
 * subscribes this browser so alerts arrive even when the app is closed.
 * Returns 'push' | 'in-app' | 'denied' | 'unsupported'.
 */
export async function enableNotifications() {
  if (!notificationsSupported()) return 'unsupported';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return 'denied';

  const { key } = await api('/push/public-key');
  if (!key || !('PushManager' in window)) return 'in-app';

  const reg = await navigator.serviceWorker.ready;
  const subscription =
    (await reg.pushManager.getSubscription()) ||
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64ToBytes(key) }));
  await api('/push/subscribe', { method: 'POST', body: { subscription: subscription.toJSON() } });
  return 'push';
}

/** Shows a system notification while the app is open in a background tab. */
export async function showLocalNotification(title, body, url) {
  if (!notificationsSupported() || Notification.permission !== 'granted' || !document.hidden) return;
  const reg = await navigator.serviceWorker.ready;
  reg.showNotification(title, { body, icon: '/icon.svg', data: { url } });
}
