import { useEffect, useState } from 'react';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';

const pinIcon = L.divIcon({
  className: '',
  html: '<div class="pin-marker"></div>',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

const FALLBACK_CENTER = [22.9734, 78.6569]; // centre of India, until the user picks a spot

function ClickToPlace({ onPick }) {
  useMapEvents({ click: (e) => onPick({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}

function FlyTo({ position }) {
  const map = useMap();
  useEffect(() => {
    if (position) map.flyTo([position.lat, position.lng], Math.max(map.getZoom(), 14), { duration: 0.6 });
  }, [position, map]);
  return null;
}

/** value: { lat, lng } | null */
export default function LocationPicker({ value, onChange, label = 'Location', hint }) {
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState('');

  function useMyLocation() {
    if (!navigator.geolocation) return setError('Your browser cannot share location. Tap the map instead.');
    setLocating(true);
    setError('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        onChange({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {
        setLocating(false);
        setError('Location permission was blocked. Tap the map to place the pin instead.');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="field-label mb-0">{label}</span>
        <button type="button" onClick={useMyLocation} className="text-sm font-extrabold text-blood underline hover:underline">
          {locating ? 'Finding you…' : 'Use my current location'}
        </button>
      </div>
      <div className="isolate h-56 overflow-hidden rounded-xl border-3 border-ink">
        <MapContainer center={value ? [value.lat, value.lng] : FALLBACK_CENTER} zoom={value ? 14 : 5} className="h-full w-full">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ClickToPlace onPick={onChange} />
          <FlyTo position={value} />
          {value && <Marker position={[value.lat, value.lng]} icon={pinIcon} />}
        </MapContainer>
      </div>
      <p className="mt-1.5 text-xs text-slate">
        {error || hint || (value ? 'Pin placed. Tap the map to move it.' : 'Tap the map or use your current location.')}
      </p>
    </div>
  );
}
