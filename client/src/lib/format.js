export const BLOOD_GROUPS = ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'];

export const URGENCY = {
  normal: { label: 'Normal', className: 'bg-white text-ink' },
  urgent: { label: 'Urgent', className: 'bg-amber text-ink' },
  critical: { label: 'Critical', className: 'bg-blood text-white' },
};

/** "in 3 h", "in 2 days", "overdue by 1 h" */
export function timeUntil(date) {
  const diff = new Date(date).getTime() - Date.now();
  const abs = Math.abs(diff);
  const mins = Math.round(abs / 60000);
  let text;
  if (mins < 60) text = `${mins} min`;
  else if (mins < 60 * 48) text = `${Math.round(mins / 60)} h`;
  else text = `${Math.round(mins / 1440)} days`;
  return diff >= 0 ? `in ${text}` : `overdue by ${text}`;
}

export function timeAgo(date) {
  const mins = Math.round((Date.now() - new Date(date).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)} h ago`;
  const days = Math.round(mins / 1440);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

export function formatDate(date) {
  return new Date(date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateTime(date) {
  return new Date(date).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** [lng, lat] GeoJSON coordinates to Leaflet's [lat, lng] */
export const toLatLng = (point) => [point.coordinates[1], point.coordinates[0]];
