import { URGENCY } from '../lib/format.js';

export default function UrgencyTag({ urgency }) {
  const u = URGENCY[urgency] ?? URGENCY.normal;
  return (
    <span className={`inline-flex items-center rounded-full border-2 border-ink px-2.5 py-0.5 text-xs font-extrabold ${u.className}`}>
      {u.label}
    </span>
  );
}
