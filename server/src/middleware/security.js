// Security headers for every response, including the built React app in production.
import helmet from 'helmet';

export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      // Everything comes from this server, except Google Fonts and the OpenStreetMap tiles.
      'style-src': ["'self'", 'https://fonts.googleapis.com', "'unsafe-inline'"],
      'font-src': ["'self'", 'https://fonts.gstatic.com'],
      'img-src': ["'self'", 'data:', 'https://*.tile.openstreetmap.org'],
      'connect-src': ["'self'"], // the API and the live-update socket
      // The host (e.g. Render) already serves https; this directive would break plain-http local runs.
      'upgrade-insecure-requests': null,
    },
  },
  // OpenStreetMap's tile servers require a Referer, so keep the browser default
  // instead of helmet's "no-referrer" (which would leave the maps blank).
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
});

/**
 * How many proxies sit in front of the server, so rate limits see each visitor's real IP
 * instead of the proxy's. Render sets RENDER=true and uses one proxy; elsewhere set TRUST_PROXY.
 */
export function proxyHops() {
  if (process.env.TRUST_PROXY !== undefined) return Number(process.env.TRUST_PROXY) || 0;
  return process.env.RENDER ? 1 : 0;
}
