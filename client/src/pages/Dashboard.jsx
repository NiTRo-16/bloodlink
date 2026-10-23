import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { getSocket } from '../lib/socket.js';
import { enableNotifications, notificationsSupported, showLocalNotification } from '../lib/push.js';
import { formatDate, timeAgo, timeUntil } from '../lib/format.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import BloodDrop from '../components/BloodDrop.jsx';
import BloodGroupPicker from '../components/BloodGroupPicker.jsx';
import LocationPicker from '../components/LocationPicker.jsx';
import UrgencyTag from '../components/UrgencyTag.jsx';

export default function Dashboard() {
  const { user } = useAuth();
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
      <div className="space-y-6">
        <h1 className="text-3xl">Hi, {user.name.split(' ')[0]}</h1>
        {user.isDonor ? <DonorPanel /> : <BecomeDonor />}
      </div>
      <div className="space-y-6">
        <MyRequests />
        {user.isDonor && <History />}
        <DeleteAccount />
      </div>
    </div>
  );
}

function DeleteAccount() {
  const { signOut } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function remove(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/me', { method: 'DELETE', body: { password } });
      signOut();
      navigate('/', { replace: true });
      toast('Your account and its data were deleted.', 'success');
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-sm font-semibold text-slate underline hover:text-ink">
        Delete my account
      </button>
    );
  }
  return (
    <form onSubmit={remove} className="panel space-y-4 border-blood">
      <div>
        <h2 className="text-xl">Delete your account?</h2>
        <p className="mt-1 text-sm">
          This permanently removes your profile, your donation history, your answers to requests, and any requests you
          posted. Open requests are closed for the donors who were alerted. It can't be undone.
        </p>
      </div>
      <label className="block">
        <span className="field-label">Enter your password to confirm</span>
        <input className="input" type="password" autoComplete="current-password" required value={password}
          onChange={(e) => setPassword(e.target.value)} />
      </label>
      {error && <p className="text-sm font-medium text-blood">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" disabled={busy || !password}>{busy ? 'Deleting…' : 'Delete account permanently'}</button>
        <button type="button" className="btn-secondary" onClick={() => { setOpen(false); setPassword(''); setError(''); }}>
          Keep my account
        </button>
      </div>
    </form>
  );
}

function DonorPanel() {
  const { user, eligibility, updateProfile, refresh } = useAuth();
  const toast = useToast();
  const [alerts, setAlerts] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [notifyState, setNotifyState] = useState(
    notificationsSupported() && Notification.permission === 'granted' ? 'on' : 'off'
  );

  const loadAlerts = useCallback(() => {
    api('/me/alerts')
      .then(setAlerts)
      .catch((e) => toast(e.message, 'error'))
      .finally(() => setLoaded(true));
  }, [toast]);

  useEffect(loadAlerts, [loadAlerts, user.available, user.location]);

  // Live alerts while the dashboard is open.
  useEffect(() => {
    const socket = getSocket();
    const onNew = (a) => {
      setAlerts((list) => [{ ...a, fresh: true }, ...list.filter((x) => x._id !== a._id)]);
      toast(`${a.bloodGroup} blood needed ${a.distanceKm} km away at ${a.hospital}`, 'alert');
      showLocalNotification(`${a.bloodGroup} blood needed nearby`, a.hospital, `/requests/${a._id}`);
    };
    const onClosed = ({ _id }) => setAlerts((list) => list.filter((x) => x._id !== _id));
    const onDonation = () => {
      toast('Thank you. Your donation was recorded.', 'success');
      refresh();
    };
    socket.on('alert:new', onNew);
    socket.on('alert:closed', onClosed);
    socket.on('donation:recorded', onDonation);
    return () => {
      socket.off('alert:new', onNew);
      socket.off('alert:closed', onClosed);
      socket.off('donation:recorded', onDonation);
    };
  }, [toast, refresh]);

  async function respond(alert, status) {
    try {
      const res = await api(`/requests/${alert._id}/respond`, { method: 'POST', body: { status } });
      setAlerts((list) =>
        list.map((a) => (a._id === alert._id ? { ...a, myResponse: status, contactPhone: res.contactPhone, fresh: false } : a))
      );
      toast(status === 'accepted' ? 'Thank you. The family can now see your number.' : 'Marked as not available for this one.', status === 'accepted' ? 'success' : 'info');
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  async function toggleAvailable() {
    try {
      await updateProfile({ available: !user.available });
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  async function turnOnNotifications() {
    const result = await enableNotifications().catch(() => 'denied');
    if (result === 'push') toast('Notifications are on, even when the app is closed.', 'success');
    else if (result === 'in-app') toast('Notifications are on while BloodLink is open.', 'success');
    else if (result === 'denied') toast('Notifications are blocked. Allow them in your browser settings.', 'error');
    else toast('This browser does not support notifications.', 'error');
    if (result === 'push' || result === 'in-app') setNotifyState('on');
  }

  const canDonate = eligibility?.eligible;
  // The status card's colour is the donor's state at a glance: mint receiving, yellow waiting, white paused.
  const stateClass = !canDonate
    ? 'bg-amber'
    : user.available
      ? 'bg-sage-soft'
      : 'bg-white';

  return (
    <>
      <section className={`flex flex-wrap items-center gap-5 rounded-2xl border-3 border-ink p-5 shadow-card sm:p-6 ${stateClass}`}>
        <BloodDrop group={user.bloodGroup} size="lg" muted={!user.available || !canDonate} />
        {/* basis-48 lets the switch drop to its own row on phones instead of squeezing this text */}
        <div className="min-w-0 flex-1 basis-48">
          <p className="font-display text-xl">
            {!canDonate
              ? `You can donate again on ${formatDate(eligibility.nextEligibleDate)}`
              : user.available
                ? 'You are receiving alerts'
                : 'Alerts are paused'}
          </p>
          <p className="text-sm text-slate">
            {!canDonate
              ? 'We will start alerting you again after this date.'
              : user.available
                ? 'You will hear about compatible requests near you.'
                : 'Turn alerts back on when you are ready to donate.'}
          </p>
        </div>
        <label className="ml-auto flex cursor-pointer items-center gap-3">
          <span className="text-sm font-semibold">Available</span>
          <button
            type="button"
            role="switch"
            aria-checked={user.available}
            onClick={toggleAvailable}
            className={`relative h-8 w-14 rounded-full border-3 border-ink transition-colors ${user.available ? 'bg-blood' : 'bg-white'}`}
          >
            <span className={`absolute top-0.5 h-5 w-5 rounded-full border-2 border-ink bg-white transition-all ${user.available ? 'left-[26px]' : 'left-0.5'}`} />
          </button>
        </label>
        {notifyState === 'off' && (
          <button onClick={turnOnNotifications} className="btn-secondary w-full">
            Turn on phone notifications
          </button>
        )}
      </section>

      <section>
        <h2 className="text-xl">Requests you can help with</h2>
        <ul className="mt-3 space-y-3">
          {loaded && alerts.length === 0 && (
            <li className="panel text-slate">
              {user.available && canDonate
                ? 'No one near you needs your blood group right now. Keep this page open or turn on notifications.'
                : 'You will see requests here once you are available and eligible.'}
            </li>
          )}
          {alerts.map((a) => (
            <li key={a._id} className={`panel ${a.fresh ? 'alert-in' : ''} ${a.urgency === 'critical' ? 'border-blood' : ''}`}>
              <div className="flex items-start gap-4">
                <BloodDrop group={a.bloodGroup} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link to={`/requests/${a._id}`} className="font-display text-lg hover:underline">{a.hospital}</Link>
                    <UrgencyTag urgency={a.urgency} />
                  </div>
                  <p className="text-sm text-slate">
                    {a.units} unit{a.units > 1 ? 's' : ''} for {a.patientName}, {a.distanceKm} km away. Needed {timeUntil(a.neededBy)}.
                  </p>
                  {a.notes && <p className="mt-1 text-sm">{a.notes}</p>}
                </div>
              </div>

              {a.myResponse === 'accepted' ? (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-ink bg-sage-soft p-3 pl-4">
                  <p className="text-sm font-extrabold">You said you can donate. Call the family to coordinate.</p>
                  <a href={`tel:${a.contactPhone}`} className="btn-success">Call {a.contactPhone}</a>
                </div>
              ) : (
                <div className="mt-4 flex gap-2">
                  <button onClick={() => respond(a, 'accepted')} className="btn-primary flex-1">I can donate</button>
                  <button onClick={() => respond(a, 'declined')} className="btn-secondary" disabled={a.myResponse === 'declined'}>
                    {a.myResponse === 'declined' ? 'Declined' : 'Not this time'}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      <UpdateLocation />
    </>
  );
}

function UpdateLocation() {
  const { user, updateProfile } = useAuth();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(
    user.location ? { lat: user.location.coordinates[1], lng: user.location.coordinates[0] } : null
  );

  async function save() {
    try {
      await updateProfile(pos);
      toast('Location updated.', 'success');
      setOpen(false);
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-sm font-semibold text-slate hover:text-ink">
        Moved? Update where you get alerts
      </button>
    );
  }
  return (
    <section className="panel space-y-3">
      <LocationPicker value={pos} onChange={setPos} label="Your alert location" />
      <div className="flex gap-2">
        <button onClick={save} className="btn-primary" disabled={!pos}>Save location</button>
        <button onClick={() => setOpen(false)} className="btn-secondary">Cancel</button>
      </div>
    </section>
  );
}

function BecomeDonor() {
  const { updateProfile } = useAuth();
  const toast = useToast();
  const [bloodGroup, setBloodGroup] = useState('');
  const [pos, setPos] = useState(null);

  async function save() {
    try {
      await updateProfile({ bloodGroup, ...pos, isDonor: true, available: true });
      toast('You are now a donor. Thank you.', 'success');
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  return (
    <section className="panel space-y-5">
      <div>
        <h2 className="text-xl">Become a donor</h2>
        <p className="text-sm text-slate">One donation can help save up to three lives. You choose which requests to accept.</p>
      </div>
      <BloodGroupPicker value={bloodGroup} onChange={setBloodGroup} label="Your blood group" />
      <LocationPicker value={pos} onChange={setPos} label="Where you usually are" />
      <button onClick={save} className="btn-primary w-full py-3" disabled={!bloodGroup || !pos}>Register as a donor</button>
    </section>
  );
}

function MyRequests() {
  const [requests, setRequests] = useState(null);

  useEffect(() => {
    api('/me/requests').then(setRequests).catch(() => setRequests([]));
    const socket = getSocket();
    // 'withdrawn' means a donor who had accepted deleted their account.
    const change = { accepted: 1, withdrawn: -1 };
    const onResponse = ({ requestId, status }) => {
      if (!change[status]) return;
      setRequests((list) =>
        list?.map((r) => (r._id === requestId ? { ...r, acceptedCount: Math.max(0, r.acceptedCount + change[status]) } : r))
      );
    };
    socket.on('response:updated', onResponse);
    return () => socket.off('response:updated', onResponse);
  }, []);

  return (
    <section>
      <div className="flex items-center justify-between">
        <h2 className="text-xl">Your requests</h2>
        <Link to="/requests/new" className="text-sm font-extrabold text-blood underline">Post a request</Link>
      </div>
      {requests?.length === 0 && (
        <p className="panel mt-3 text-sm text-slate">When you post a request for a patient, you can follow donors' replies here.</p>
      )}
      <ul className={requests?.length ? 'list-group mt-3' : ''}>
        {requests?.map((r) => (
          <li key={r._id}>
            <Link to={`/requests/${r._id}`} className="list-row gap-3">
              <BloodDrop group={r.bloodGroup} size="sm" muted={r.status !== 'open'} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{r.hospital}</p>
                <p className="text-sm text-slate">
                  {r.status === 'open'
                    ? `${r.notifiedCount} alerted, ${r.acceptedCount} accepted`
                    : `${r.status[0].toUpperCase()}${r.status.slice(1)} ${timeAgo(r.closedAt || r.updatedAt)}`}
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function History() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    api('/me/history').then(setItems).catch(() => {});
  }, []);
  const donated = items.filter((i) => i.status === 'donated');

  return (
    <section>
      <h2 className="text-xl">Your donations</h2>
      <p className="mt-1 text-sm text-slate">
        {donated.length === 0
          ? 'Donations you make through BloodLink are recorded here.'
          : `You have donated ${donated.length} time${donated.length > 1 ? 's' : ''} through BloodLink.`}
      </p>
      <ul className={items.length ? 'list-group mt-3' : ''}>
        {items.map((i) => (
          <li key={i._id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm sm:px-5">
            <span>{i.request.bloodGroup} at {i.request.hospital}</span>
            <span className={i.status === 'donated' ? 'font-semibold text-sage' : 'text-slate'}>
              {i.status === 'donated' ? `Donated ${formatDate(i.updatedAt)}` : i.status === 'accepted' ? 'Accepted' : 'Declined'}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
