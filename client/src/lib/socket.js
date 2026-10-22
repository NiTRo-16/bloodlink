import { io } from 'socket.io-client';
import { tokenStore } from './api.js';

// One shared connection. It reconnects with the new token after login or logout.
let socket = null;

export function getSocket() {
  if (!socket) socket = io({ auth: { token: tokenStore.get() } });
  return socket;
}

export function reconnectSocket() {
  const s = getSocket();
  s.auth = { token: tokenStore.get() };
  s.disconnect().connect();
}
