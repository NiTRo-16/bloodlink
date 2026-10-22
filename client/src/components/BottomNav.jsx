import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { getSocket } from '../lib/socket.js';

// Phone-only tab bar. On wider screens the header carries these links instead.

const ICONS = {
  home: 'M3 11.5 12 4l9 7.5M5.5 9.5V20h13V9.5',
  dashboard: 'M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z',
  login: 'M10 17l5-5-5-5M15 12H3M14 4h5a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-5',
  plus: 'M12 5v14M5 12h14',
};

function Icon({ name }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
}

function Tab({ to, icon, label, dot = false, end = false }) {
  return (
    <NavLink to={to} end={end} className="flex flex-1 justify-center">
      {({ isActive }) => (
        <span
          className={`relative flex min-w-[4.5rem] flex-col items-center gap-0.5 rounded-xl border-3 px-2 py-1 text-xs font-extrabold ${
            isActive ? 'border-ink bg-sky' : 'border-transparent'
          }`}
        >
          <Icon name={icon} />
          {label}
          {dot && (
            <span className="absolute right-3 top-0.5 h-3 w-3 rounded-full border-2 border-ink bg-blood">
              <span className="sr-only">New alert</span>
            </span>
          )}
        </span>
      )}
    </NavLink>
  );
}

export default function BottomNav() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [newAlert, setNewAlert] = useState(false);

  // A dot on Dashboard when an alert arrives while the donor is on another page.
  useEffect(() => {
    if (!user?.isDonor) return undefined;
    const socket = getSocket();
    const onNew = () => setNewAlert(true);
    socket.on('alert:new', onNew);
    return () => socket.off('alert:new', onNew);
  }, [user?.isDonor]);
  useEffect(() => {
    if (pathname === '/dashboard') setNewAlert(false);
  }, [pathname]);

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-[1100] border-t-3 border-ink bg-white pb-[env(safe-area-inset-bottom)] sm:hidden"
      aria-label="Main"
    >
      <div className="flex items-end px-2 pb-2 pt-1.5">
        <Tab to="/" icon="home" label="Home" end />
        {user ? (
          <>
            {/* The main action sits raised in the middle, within thumb reach */}
            <Link
              to="/requests/new"
              className="mx-1 -mt-6 flex flex-col items-center gap-1 text-xs font-extrabold"
              aria-current={pathname === '/requests/new' ? 'page' : undefined}
            >
              <span className="grid h-14 w-14 place-items-center rounded-2xl border-3 border-ink bg-blood text-white shadow-cta active:translate-x-1 active:translate-y-1 active:shadow-none">
                <Icon name="plus" />
              </span>
              Post
            </Link>
            <Tab to="/dashboard" icon="dashboard" label="Dashboard" dot={newAlert} />
          </>
        ) : (
          <>
            <Tab to="/login" icon="login" label="Log in" />
            <div className="flex flex-1 justify-center">
              <Link to="/register" className="btn-primary min-h-11 px-4">
                Sign up
              </Link>
            </div>
          </>
        )}
      </div>
    </nav>
  );
}
