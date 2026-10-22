import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { getSocket } from '../lib/socket.js';
import { timeAgo, timeUntil } from '../lib/format.js';
import { useAuth } from '../context/AuthContext.jsx';
import RequestsMap from '../components/RequestsMap.jsx';
import UrgencyTag from '../components/UrgencyTag.jsx';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

const STEPS = [
  { title: 'Post a request', text: 'Blood group, units, hospital and how soon. It takes a minute.', tone: 'bg-sky' },
  { title: 'Donors get alerted', text: 'Only compatible, eligible donors within your radius hear about it.', tone: 'bg-amber' },
  { title: 'Someone says yes', text: 'You get their name and number. Your number stays private until then.', tone: 'bg-sage-soft' },
];

export default function Home() {
  const { user } = useAuth();
  const [requests, setRequests] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api('/requests/open')
      .then((list) => {
        setRequests(list);
        setLoaded(true);
      })
      .catch(() => {});

    // Keep the page live: new requests appear, closed ones disappear.
    const socket = getSocket();
    const onOpened = (r) => setRequests((list) => [r, ...list.filter((x) => x._id !== r._id)]);
    const onUpdated = (u) => setRequests((list) => list.map((x) => (x._id === u._id ? { ...x, ...u } : x)));
    const onClosed = ({ _id }) => setRequests((list) => list.filter((x) => x._id !== _id));
    socket.on('request:opened', onOpened);
    socket.on('request:updated', onUpdated);
    socket.on('request:closed', onClosed);
    return () => {
      socket.off('request:opened', onOpened);
      socket.off('request:updated', onUpdated);
      socket.off('request:closed', onClosed);
    };
  }, []);

  const count = requests.length;

  return (
    <div className="space-y-14">
      {count > 0 && <Ticker requests={requests.slice(0, 8)} />}

      <section className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        <div className="flex flex-col justify-center">
          {loaded && (
            <p
              className={`mb-7 inline-flex -rotate-2 items-center gap-3 self-start rounded-2xl border-3 border-ink px-5 py-2 shadow-card ${
                count ? 'bg-amber' : 'bg-sage-soft'
              }`}
              aria-live="polite"
            >
              {count ? (
                <>
                  <span className="font-display text-6xl leading-none sm:text-7xl">{count}</span>
                  <span className="text-lg font-extrabold leading-tight">
                    {count === 1 ? 'patient is' : 'patients are'}
                    <br />
                    waiting now
                  </span>
                </>
              ) : (
                <span className="py-2 text-lg font-extrabold">Nobody is waiting for blood right now</span>
              )}
            </p>
          )}
          <h1 className="max-w-[12ch] text-5xl leading-[0.98] sm:text-7xl">Someone nearby needs your blood.</h1>
          <p className="mt-6 max-w-md text-lg sm:text-xl">
            Post a request and every compatible donor near the hospital gets an alert. Donors say yes in one tap.
          </p>
          <div className="mt-8 flex flex-wrap gap-4">
            <Link to={user ? '/requests/new' : '/register'} className="btn-primary min-h-14 px-6 text-base">
              Post a blood request
            </Link>
            {!user?.isDonor && (
              <Link to={user ? '/dashboard' : '/register'} className="btn-secondary min-h-14 px-6 text-base">
                I want to donate
              </Link>
            )}
          </div>
        </div>

        <div className="flex h-80 flex-col overflow-hidden rounded-2xl border-3 border-ink bg-white shadow-card sm:h-[28rem] lg:h-[34rem]">
          <div className="flex items-center justify-between border-b-3 border-ink bg-sky px-4 py-3 font-extrabold">
            Open requests
            <span className="inline-flex items-center gap-2 rounded-full border-2 border-ink bg-white px-3 py-0.5 text-sm">
              <span className="live-dot" aria-hidden="true" />
              Live
            </span>
          </div>
          <RequestsMap requests={requests} bare className="flex-1" />
        </div>
      </section>

      <section>
        <div className="mb-6 flex flex-wrap items-end justify-between gap-2">
          <h2 className="text-4xl">Needed right now</h2>
          {count > 8 && <p className="font-bold">Showing the 8 newest of {count}</p>}
        </div>
        {count === 0 ? (
          <p className="panel">
            {loaded
              ? 'When someone posts a request, it appears here and on the map instantly.'
              : 'Loading open requests…'}
          </p>
        ) : (
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {requests.slice(0, 8).map((r) => (
              <RequestCard key={r._id} r={r} />
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-6 md:grid-cols-3">
        {STEPS.map((s, i) => (
          <div key={s.title} className={`rounded-2xl border-3 border-ink p-6 shadow-card ${s.tone}`}>
            <span className="mb-5 grid h-12 w-12 place-items-center rounded-full border-3 border-ink bg-white font-display text-xl">
              {i + 1}
            </span>
            <h3 className="text-2xl">{s.title}</h3>
            <p className="mt-2">{s.text}</p>
          </div>
        ))}
      </section>
    </div>
  );
}

function RequestCard({ r }) {
  return (
    <li className="flex flex-col gap-4 rounded-2xl border-3 border-ink bg-white p-4 shadow-card">
      {/* In multi-column layouts a fixed height keeps every card's facts row level, however long the hospital name */}
      <div className="flex items-start gap-3 sm:min-h-[6.5rem]">
        <span className={`group-block h-16 w-16 ${r.bloodGroup.length > 2 ? 'text-xl' : 'text-2xl'}`}>{r.bloodGroup}</span>
        <div className="min-w-0">
          <h3 className="line-clamp-3 text-lg leading-tight">{r.hospital}</h3>
          <p className="mt-1 text-sm font-semibold">Posted {timeAgo(r.createdAt)}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 divide-x-2 divide-ink overflow-hidden rounded-xl border-2 border-ink text-sm">
        <div className="px-3 py-2">
          <b className="block font-display text-lg font-normal">{plural(r.units, 'unit')}</b>
          needed
        </div>
        <div className="px-3 py-2">
          <b className="block font-display text-lg font-normal">{timeUntil(r.neededBy)}</b>
          deadline
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <UrgencyTag urgency={r.urgency} />
        {r.acceptedCount > 0 && (
          <span className="rounded-full border-2 border-ink bg-sage-soft px-2.5 py-0.5 text-xs font-extrabold">
            {r.acceptedCount} coming
          </span>
        )}
      </div>
      <Link to={`/requests/${r._id}`} className="btn-primary mt-auto w-full">
        View request
      </Link>
    </li>
  );
}

/** The newest requests scrolling across the top. Pauses on hover; static with reduced motion. */
function Ticker({ requests }) {
  // The second copy only makes the loop seamless, so it is hidden from screen readers and the tab order.
  const items = (copy) =>
    requests.map((r) => (
      <Link
        key={r._id}
        to={`/requests/${r._id}`}
        tabIndex={copy ? -1 : undefined}
        className="inline-flex items-center gap-2 px-6 hover:underline"
      >
        <span className="h-2.5 w-2.5 rounded-full bg-blood" aria-hidden="true" />
        <b className="text-amber">{r.bloodGroup}</b> needed at {r.hospital}, {timeUntil(r.neededBy)}
      </Link>
    ));
  return (
    <div className="overflow-hidden whitespace-nowrap rounded-xl border-3 border-ink bg-ink py-2.5 text-sm font-bold text-white shadow-cta">
      <div className="ticker-track">
        <div className="flex">{items(false)}</div>
        <div className="flex" aria-hidden="true">{items(true)}</div>
      </div>
    </div>
  );
}
