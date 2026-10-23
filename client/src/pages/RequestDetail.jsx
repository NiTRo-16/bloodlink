import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { getSocket } from '../lib/socket.js';
import { formatDateTime, timeAgo, timeUntil } from '../lib/format.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import BloodDrop from '../components/BloodDrop.jsx';
import UrgencyTag from '../components/UrgencyTag.jsx';
import RequestsMap from '../components/RequestsMap.jsx';

export default function RequestDetail() {
  const { id } = useParams();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api(`/requests/${id}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [id]);

  useEffect(load, [load]);

  // Refresh live when donors respond or the request closes.
  useEffect(() => {
    const socket = getSocket();
    const onResponse = (e) => {
      if (e.requestId !== id) return;
      if (e.status === 'accepted') toast(`${e.donor.name} (${e.donor.bloodGroup}) can donate`, 'success');
      load();
    };
    const onClosed = (e) => e._id === id && load();
    socket.on('response:updated', onResponse);
    socket.on('request:closed', onClosed);
    return () => {
      socket.off('response:updated', onResponse);
      socket.off('request:closed', onClosed);
    };
  }, [id, load, toast]);

  if (error) {
    return (
      <div className="panel mx-auto max-w-md text-center">
        <p className="font-semibold">{error}</p>
        <Link to="/" className="mt-3 inline-block font-extrabold text-blood underline">Back to open requests</Link>
      </div>
    );
  }
  if (!data) return <p className="p-8 text-center text-slate">Loading…</p>;

  const r = data.request;
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex flex-wrap items-center gap-5">
        <BloodDrop group={r.bloodGroup} size="xl" muted={r.status !== 'open'} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <UrgencyTag urgency={r.urgency} />
            {r.status !== 'open' && (
              <span className="rounded-full bg-ink px-2.5 py-0.5 text-xs font-semibold text-white">
                {{ fulfilled: 'Fulfilled', cancelled: 'Cancelled', expired: 'Expired' }[r.status]}
              </span>
            )}
          </div>
          <h1 className="mt-2 text-3xl">
            {r.units} unit{r.units > 1 ? 's' : ''} of {r.bloodGroup} for {r.patientName}
          </h1>
          <p className="mt-1 text-slate">
            {r.hospital}
            {r.distanceKm != null && `, ${r.distanceKm} km from you`}
          </p>
        </div>
      </header>

      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="panel space-y-3">
          <Detail label="Needed by" value={`${formatDateTime(r.neededBy)} (${timeUntil(r.neededBy)})`} />
          <Detail label="Posted" value={timeAgo(r.createdAt)} />
          {data.role === 'owner' && <Detail label="Donors alerted" value={`${r.notifiedCount} within ${r.radiusKm} km`} />}
          {r.notes && <Detail label="Notes" value={r.notes} />}
        </section>
        <RequestsMap requests={[r]} className="h-56 md:h-auto" />
      </div>

      {data.role === 'owner' ? <OwnerView data={data} onChange={load} /> : <DonorView data={data} onChange={load} />}
    </div>
  );
}

function Detail({ label, value }) {
  return (
    <div>
      <p className="text-sm text-slate">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}

function OwnerView({ data, onChange }) {
  const toast = useToast();
  const { request, responses } = data;
  const accepted = responses.filter((x) => x.status === 'accepted' || x.status === 'donated');
  const [donated, setDonated] = useState([]);
  const [busy, setBusy] = useState(false);

  async function close(status) {
    if (status === 'cancelled' && !window.confirm('Cancel this request? Donors will stop seeing it.')) return;
    setBusy(true);
    try {
      const res = await api(`/requests/${request._id}/status`, { method: 'PATCH', body: { status, donatedBy: donated } });
      toast(status === 'fulfilled' ? `Marked as fulfilled. ${res.donatedCount} donation(s) recorded.` : 'Request cancelled.', 'success');
      onChange();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  const toggle = (id) => setDonated((d) => (d.includes(id) ? d.filter((x) => x !== id) : [...d, id]));

  return (
    <section className="space-y-4">
      <h2 className="text-xl">
        {accepted.length === 0 ? 'Waiting for donors' : `${accepted.length} donor${accepted.length > 1 ? 's' : ''} can help`}
      </h2>
      {request.status === 'expired' && (
        <p className="panel">
          This request closed automatically 12 hours after the time it was needed by. If you still need blood,{' '}
          <Link to="/requests/new" className="font-extrabold text-blood underline">post a new request</Link>.
        </p>
      )}
      {accepted.length === 0 && request.status === 'open' && (
        <p className="panel text-slate">
          {request.notifiedCount > 0
            ? `${request.notifiedCount} compatible donors were alerted. Their replies appear here instantly. Keep this page open.`
            : 'No registered donors match yet. Share BloodLink with friends and family so more donors join.'}
        </p>
      )}
      <ul className={accepted.length ? 'list-group' : ''}>
        {accepted.map(({ donor, status }) => (
          <li key={donor._id} className="flex flex-wrap items-center gap-4 px-4 py-4 sm:px-5">
            <BloodDrop group={donor.bloodGroup} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{donor.name}</p>
              <p className="text-sm text-slate">{donor.distanceKm != null ? `${donor.distanceKm} km from the hospital` : ''}</p>
            </div>
            <a href={`tel:${donor.phone}`} className="btn-success">Call {donor.phone}</a>
            {request.status === 'open' && (
              <label className="flex w-full items-center gap-2 text-sm sm:w-auto">
                <input type="checkbox" className="h-4 w-4 accent-sage" checked={donated.includes(donor._id)} onChange={() => toggle(donor._id)} />
                Donated
              </label>
            )}
            {status === 'donated' && <span className="text-sm font-semibold text-sage">Donated</span>}
          </li>
        ))}
      </ul>

      {request.status === 'open' && (
        <div className="flex flex-wrap gap-2">
          <button onClick={() => close('fulfilled')} className="btn-primary" disabled={busy}>
            Mark as fulfilled
          </button>
          <button onClick={() => close('cancelled')} className="btn-secondary" disabled={busy}>
            Cancel request
          </button>
          <p className="w-full text-xs text-slate">Tick the donors who donated so they are paused from alerts until they can give again.</p>
        </div>
      )}
    </section>
  );
}

function DonorView({ data, onChange }) {
  const { user } = useAuth();
  const toast = useToast();
  const r = data.request;
  const [busy, setBusy] = useState(false);

  async function respond(status) {
    setBusy(true);
    try {
      await api(`/requests/${r._id}/respond`, { method: 'POST', body: { status } });
      toast(status === 'accepted' ? 'Thank you. The family can now see your number.' : 'Marked as not available.', 'success');
      onChange();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  if (r.myResponse === 'accepted' || r.myResponse === 'donated') {
    return (
      <section className="rounded-2xl border-3 border-ink bg-sage-soft p-5 shadow-card sm:p-6">
        <h2 className="text-xl">
          {r.myResponse === 'donated' ? 'You donated for this request. Thank you.' : 'You said you can donate'}
        </h2>
        <p className="mt-1">Contact {r.requesterName || 'the family'} to coordinate your visit.</p>
        <a href={`tel:${r.contactPhone}`} className="btn-success mt-4">Call {r.contactPhone}</a>
      </section>
    );
  }

  if (r.status !== 'open') return <p className="panel text-slate">This request is closed.</p>;

  if (!data.canRespond) {
    return (
      <p className="panel text-slate">
        {!user.isDonor ? (
          <>Only registered donors can respond. <Link to="/dashboard" className="font-extrabold text-blood underline">Become a donor</Link></>
        ) : (
          `Your blood group (${user.bloodGroup}) can't be used for this patient, or you aren't eligible to donate yet.`
        )}
      </p>
    );
  }

  return (
    <section className="panel">
      <h2 className="text-xl">Can you donate?</h2>
      <p className="mt-1 text-slate">If you accept, the family sees your name and number and you see theirs.</p>
      <div className="mt-4 flex gap-2">
        <button onClick={() => respond('accepted')} className="btn-primary flex-1 py-3" disabled={busy}>I can donate</button>
        <button onClick={() => respond('declined')} className="btn-secondary" disabled={busy || r.myResponse === 'declined'}>
          {r.myResponse === 'declined' ? 'Declined' : 'Not this time'}
        </button>
      </div>
    </section>
  );
}
