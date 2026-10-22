import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import CodeStep from '../components/CodeStep.jsx';

export default function Login() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [method, setMethod] = useState('password');
  const [otpEnabled, setOtpEnabled] = useState(false);
  const [phone, setPhone] = useState('');

  // The code option only appears when the server can deliver codes.
  useEffect(() => {
    api('/auth/otp')
      .then((r) => setOtpEnabled(r.enabled))
      .catch(() => {});
  }, []);

  async function finish(session) {
    await signIn(session);
    navigate(location.state?.from || '/dashboard', { replace: true });
  }

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="text-3xl">Log in</h1>
      <div className="panel mt-6 space-y-4">
        {otpEnabled && (
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="How to log in">
            <button type="button" className="choice py-2 text-sm font-extrabold" aria-pressed={method === 'password'} onClick={() => setMethod('password')}>
              Password
            </button>
            <button type="button" className="choice py-2 text-sm font-extrabold" aria-pressed={method === 'code'} onClick={() => setMethod('code')}>
              One-time code
            </button>
          </div>
        )}
        {method === 'password' ? (
          <PasswordForm phone={phone} setPhone={setPhone} onDone={finish} />
        ) : (
          <CodeForm phone={phone} setPhone={setPhone} onDone={finish} />
        )}
      </div>
      <p className="mt-4 text-center text-sm text-slate">
        New here? <Link to="/register" className="font-extrabold text-blood underline">Create an account</Link>
      </p>
    </div>
  );
}

function PhoneField({ phone, setPhone, disabled = false }) {
  return (
    <label className="block">
      <span className="field-label">Phone number</span>
      <input className="input disabled:bg-mist" type="tel" autoComplete="tel" required disabled={disabled} value={phone}
        onChange={(e) => setPhone(e.target.value)} />
    </label>
  );
}

function PasswordForm({ phone, setPhone, onDone }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await onDone(await api('/auth/login', { method: 'POST', body: { phone, password } }));
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <PhoneField phone={phone} setPhone={setPhone} />
      <label className="block">
        <span className="field-label">Password</span>
        <input className="input" type="password" autoComplete="current-password" required value={password}
          onChange={(e) => setPassword(e.target.value)} />
      </label>
      {error && <p className="text-sm font-medium text-blood">{error}</p>}
      <button className="btn-primary w-full py-3" disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</button>
    </form>
  );
}

function CodeForm({ phone, setPhone, onDone }) {
  const [sent, setSent] = useState(null); // { sentTo, resendIn, devCode? } once a code is on its way
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const requestCode = () => api('/auth/otp/request', { method: 'POST', body: { phone } });

  async function sendCode(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      setSent(await requestCode());
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!sent) {
    return (
      <form onSubmit={sendCode} className="space-y-4">
        <PhoneField phone={phone} setPhone={setPhone} />
        <p className="text-sm text-slate">We'll send a 6-digit code to this number.</p>
        {error && <p className="text-sm font-medium text-blood">{error}</p>}
        <button className="btn-primary w-full py-3" disabled={busy}>{busy ? 'Sending…' : 'Send code'}</button>
      </form>
    );
  }

  return (
    <CodeStep
      sent={sent}
      submitLabel="Log in"
      busyLabel="Checking…"
      onVerify={async (code) => onDone(await api('/auth/otp/verify', { method: 'POST', body: { phone, code } }))}
      onResend={async () => {
        const next = await requestCode();
        setSent(next);
        return next;
      }}
      onChangeNumber={() => setSent(null)}
    />
  );
}
