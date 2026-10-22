import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

const linkClass = ({ isActive }) =>
  `rounded-xl border-3 px-3.5 py-1.5 text-sm font-extrabold transition-colors ${
    isActive ? 'border-ink bg-sky' : 'border-transparent hover:border-ink hover:bg-white'
  }`;

export function LogoMark({ size = 44 }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-xl border-3 border-ink bg-blood shadow-sm"
      style={{ width: size, height: size }}
    >
      <svg width={size * 0.45} height={size * 0.55} viewBox="0 0 100 120" aria-hidden="true">
        <path d="M50 6C50 6 12 52 12 78a38 38 0 0 0 76 0C88 52 50 6 50 6z" fill="#fff" stroke="#000" strokeWidth="9" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

export default function Navbar() {
  const { user, signOut } = useAuth();

  return (
    // Sits above Leaflet's controls (z-index 1000) so maps scroll underneath it.
    // pt-[env(...)] keeps the header clear of the notch when installed to the home screen.
    <header className="sticky top-0 z-[1100] border-b-3 border-ink bg-mist pt-[env(safe-area-inset-top)]">
      <nav className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-2.5 sm:py-3">
        <Link to="/" className="mr-auto flex items-center gap-3 font-display text-2xl tracking-tight text-ink">
          <LogoMark />
          BloodLink
        </Link>

        {/* On phones these links live in the bottom tab bar (BottomNav) */}
        {user ? (
          <>
            <NavLink to="/dashboard" className={(s) => `hidden sm:block ${linkClass(s)}`}>
              Dashboard
            </NavLink>
            <Link to="/requests/new" className="btn-primary hidden min-h-10 px-4 py-2 sm:inline-flex">
              Post a request
            </Link>
            <button onClick={signOut} className="whitespace-nowrap px-2 py-2 text-sm font-extrabold hover:underline">
              Log out
            </button>
          </>
        ) : (
          <>
            <NavLink to="/login" className={(s) => `hidden sm:block ${linkClass(s)}`}>
              Log in
            </NavLink>
            <Link to="/register" className="btn-primary hidden min-h-10 px-4 py-2 sm:inline-flex">
              Sign up
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}
