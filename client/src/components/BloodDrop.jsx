// The blood-drop badge that carries a blood group throughout the app.

const SIZES = {
  sm: { w: 36, text: 12 },
  md: { w: 52, text: 16 },
  lg: { w: 84, text: 26 },
  xl: { w: 120, text: 38 },
};

export const DROP_PATH = 'M50 4C50 4 12 52 12 78a38 38 0 0 0 76 0C88 52 50 4 50 4z';

export default function BloodDrop({ group, size = 'md', muted = false, className = '' }) {
  const s = SIZES[size];
  return (
    <svg
      viewBox="0 0 100 120"
      width={s.w}
      height={s.w * 1.2}
      className={`shrink-0 ${className}`}
      role="img"
      aria-label={`Blood group ${group}`}
    >
      {/* Black outline; muted drops are white so they read as "off" rather than as a lighter red */}
      <path d={DROP_PATH} fill={muted ? '#FFFFFF' : '#E5172F'} stroke="#000" strokeWidth="7" strokeLinejoin="round" />
      <text
        x="50"
        y="88"
        textAnchor="middle"
        fontFamily="'Archivo Black', 'Archivo', system-ui, sans-serif"
        fontSize={group?.length > 2 ? 26 : 32}
        fill={muted ? '#000' : '#fff'}
      >
        {group}
      </text>
    </svg>
  );
}

/** HTML string version for Leaflet map markers: a pin coloured by urgency. */
export function dropMarkerHtml(group, urgency) {
  const ring = urgency === 'critical' ? '<span class="pulse-ring"></span>' : '';
  return `<div class="map-pin ${urgency}">${ring}<b>${group}</b></div>`;
}
