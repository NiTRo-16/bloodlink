import { useEffect, useMemo } from 'react';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import { Link } from 'react-router-dom';
import L from 'leaflet';
import { dropMarkerHtml } from './BloodDrop.jsx';
import { timeUntil, toLatLng } from '../lib/format.js';

function FitToRequests({ points }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 1) map.setView(points[0], 13);
    else if (points.length > 1) map.fitBounds(points, { padding: [40, 40], maxZoom: 13 });
    // Re-fit only when the number of requests changes, so live updates don't jump the map around.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points.length, map]);
  return null;
}

/** bare: no frame of its own, for when the parent already draws one */
export default function RequestsMap({ requests, className = '', bare = false }) {
  const points = useMemo(() => requests.map((r) => toLatLng(r.location)), [requests]);
  const frame = bare ? '' : 'rounded-2xl border-3 border-ink shadow-card';

  return (
    <div className={`isolate overflow-hidden bg-white ${frame} ${className}`}>
      {/* On touch screens one finger scrolls the page, not the map; pinch still zooms it */}
      <MapContainer center={[22.9734, 78.6569]} zoom={5} dragging={!L.Browser.mobile} className="h-full w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitToRequests points={points} />
        {requests.map((r) => (
          <Marker
            key={r._id}
            position={toLatLng(r.location)}
            icon={L.divIcon({
              className: '',
              html: dropMarkerHtml(r.bloodGroup, r.urgency),
              // The pin is a square rotated 45°, so its point sits ~27px below its centre.
              iconSize: [38, 38],
              iconAnchor: [19, 46],
              popupAnchor: [0, -44],
            })}
          >
            <Popup>
              <p className="font-display text-base text-ink">
                {r.units} unit{r.units > 1 ? 's' : ''} of {r.bloodGroup}
              </p>
              <p className="text-sm text-slate">{r.hospital}</p>
              <p className="text-sm text-slate">Needed {timeUntil(r.neededBy)}</p>
              <Link to={`/requests/${r._id}`} className="mt-1 inline-block text-sm font-extrabold text-blood underline">
                View request
              </Link>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
