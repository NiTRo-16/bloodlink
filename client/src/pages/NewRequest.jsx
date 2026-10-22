import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import BloodGroupPicker from '../components/BloodGroupPicker.jsx';
import LocationPicker from '../components/LocationPicker.jsx';

// Value for <input type="datetime-local">, in local time
function localDateTime(hoursFromNow) {
  const d = new Date(Date.now() + hoursFromNow * 3600000);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

const URGENCY_OPTIONS = [
  { value: 'normal', label: 'Normal', hint: 'Within a few days' },
  { value: 'urgent', label: 'Urgent', hint: 'Today' },
  { value: 'critical', label: 'Critical', hint: 'Right now' },
];

export default function NewRequest() {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    patientName: '',
    bloodGroup: '',
    units: 1,
    hospital: '',
    urgency: 'urgent',
    neededBy: localDateTime(6),
    radiusKm: 10,
    contactPhone: user.phone,
    notes: '',
  });
  const [position, setPosition] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    if (!form.bloodGroup) return setError('Choose the blood group the patient needs.');
    if (!position) return setError('Set the hospital location on the map.');
    setBusy(true);
    setError('');
    try {
      const { request, notifiedCount } = await api('/requests', {
        method: 'POST',
        body: { ...form, ...position, neededBy: new Date(form.neededBy).toISOString() },
      });
      toast(
        notifiedCount
          ? `Request posted. ${notifiedCount} compatible donor${notifiedCount > 1 ? 's were' : ' was'} alerted.`
          : 'Request posted. No matching donors nearby yet. New donors will see it.',
        notifiedCount ? 'success' : 'info'
      );
      navigate(`/requests/${request._id}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-3xl">Post a blood request</h1>
      <p className="mt-2 text-slate">Compatible donors near the hospital are alerted the moment you post.</p>

      <form onSubmit={submit} className="panel mt-6 space-y-5">
        <BloodGroupPicker value={form.bloodGroup} onChange={(g) => setForm({ ...form, bloodGroup: g })} label="Blood group needed" />

        <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
          <label className="block">
            <span className="field-label">Patient name</span>
            <input className="input" required value={form.patientName} onChange={set('patientName')} />
          </label>
          <label className="block">
            <span className="field-label">Units needed</span>
            <input className="input" type="number" inputMode="numeric" min={1} max={20} required value={form.units} onChange={set('units')} />
          </label>
        </div>

        <label className="block">
          <span className="field-label">Hospital</span>
          <input className="input" required placeholder="Hospital name and ward" value={form.hospital} onChange={set('hospital')} />
        </label>

        <LocationPicker value={position} onChange={setPosition} label="Hospital location" />

        <fieldset>
          <legend className="field-label">How urgent is it?</legend>
          <div className="grid grid-cols-3 gap-2">
            {URGENCY_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                aria-pressed={form.urgency === o.value}
                onClick={() => setForm({ ...form, urgency: o.value })}
                className="choice p-3 text-left"
              >
                <span className="block font-semibold">{o.label}</span>
                <span className="text-xs text-slate">{o.hint}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="field-label">Needed by</span>
            <input className="input" type="datetime-local" required value={form.neededBy} onChange={set('neededBy')} />
          </label>
          <label className="block">
            <span className="field-label">Alert donors within</span>
            <select className="input" value={form.radiusKm} onChange={set('radiusKm')}>
              {[5, 10, 20, 50].map((km) => (
                <option key={km} value={km}>{km} km</option>
              ))}
            </select>
          </label>
        </div>

        <label className="block">
          <span className="field-label">Contact number for donors</span>
          <input className="input" type="tel" required value={form.contactPhone} onChange={set('contactPhone')} />
          <span className="mt-1 block text-xs text-slate">Shown only to donors who accept your request.</span>
        </label>

        <label className="block">
          <span className="field-label">Anything donors should know (optional)</span>
          <textarea className="input min-h-20" maxLength={500} placeholder="Ward number, who to ask for at reception" value={form.notes} onChange={set('notes')} />
        </label>

        {error && <p className="text-sm font-medium text-blood">{error}</p>}
        <button className="btn-primary w-full py-3 text-base" disabled={busy}>
          {busy ? 'Alerting donors…' : 'Post request and alert donors'}
        </button>
      </form>
    </div>
  );
}
