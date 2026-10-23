import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import BloodGroupPicker from '../components/BloodGroupPicker.jsx';
import LocationPicker from '../components/LocationPicker.jsx';
import CodeStep from '../components/CodeStep.jsx';

export default function Register() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', phone: '', password: '', gender: 'male', isDonor: true, bloodGroup: '', acceptTerms: false });
  const [position, setPosition] = useState(null);
  const [verifyPhone, setVerifyPhone] = useState(false); // whether the server can send codes
  const [sent, setSent] = useState(null); // set once a confirmation code is on its way
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  useEffect(() => {
    api('/auth/otp')
      .then((r) => setVerifyPhone(r.enabled))
      .catch(() => {});
  }, []);

  // The form is long, so start each step at the top of the page.
  const onCodeStep = sent !== null;
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [onCodeStep]);

  const requestCode = () => api('/auth/register/code', { method: 'POST', body: { phone: form.phone } });

  async function createAccount(code) {
    const data = await api('/auth/register', { method: 'POST', body: { ...form, ...(position || {}), code } });
    await signIn(data);
    navigate('/dashboard', { replace: true });
  }

  // Step 1: check the form, then either send a confirmation code or (if codes aren't available) sign up directly.
  async function submit(e) {
    e.preventDefault();
    if (form.isDonor && !form.bloodGroup) return setError('Choose your blood group.');
    if (form.isDonor && !position) return setError('Set your location so we can alert you about nearby requests.');
    setBusy(true);
    setError('');
    try {
      if (verifyPhone) setSent(await requestCode());
      else await createAccount();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  // Step 2: confirm the number with the code, which creates the account.
  if (sent) {
    return (
      <div className="mx-auto max-w-sm">
        <h1 className="text-3xl">Confirm your number</h1>
        <p className="mt-2 text-slate">So donors and families know this number really belongs to you.</p>
        <div className="panel mt-6">
          <CodeStep
            sent={sent}
            submitLabel="Create account"
            busyLabel="Creating account…"
            onVerify={createAccount}
            onResend={async () => {
              const next = await requestCode();
              setSent(next);
              return next;
            }}
            onChangeNumber={() => setSent(null)}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-3xl">Create your account</h1>
      <p className="mt-2 text-slate">Donors get alerts when a nearby patient needs their blood group. Anyone can post a request.</p>

      <form onSubmit={submit} className="panel mt-6 space-y-5">
        <label className="block">
          <span className="field-label">Full name</span>
          <input className="input" required autoComplete="name" value={form.name} onChange={set('name')} />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="field-label">Phone number</span>
            <input className="input" type="tel" required autoComplete="tel" placeholder="98765 43210" value={form.phone} onChange={set('phone')} />
            {verifyPhone && <span className="mt-1 block text-xs text-slate">We'll text a code to confirm it.</span>}
          </label>
          <label className="block">
            <span className="field-label">Password</span>
            <input className="input" type="password" required minLength={6} autoComplete="new-password" value={form.password} onChange={set('password')} />
          </label>
        </div>
        <label className="block">
          <span className="field-label">Gender</span>
          <select className="input" value={form.gender} onChange={set('gender')}>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </select>
          <span className="mt-1 block text-xs text-slate">Used only to work out when you can donate again.</span>
        </label>

        <label className="flex cursor-pointer items-start gap-3 rounded-xl border-3 border-ink bg-blood-soft p-4">
          <input type="checkbox" className="mt-1 h-5 w-5 accent-blood" checked={form.isDonor}
            onChange={(e) => setForm({ ...form, isDonor: e.target.checked })} />
          <span>
            <span className="block font-semibold">I want to donate blood</span>
            <span className="text-sm text-slate">Your phone number is shared only with a requester after you accept their request.</span>
          </span>
        </label>

        {form.isDonor && (
          <>
            <BloodGroupPicker value={form.bloodGroup} onChange={(g) => setForm({ ...form, bloodGroup: g })} label="Your blood group" />
            <LocationPicker value={position} onChange={setPosition} label="Where you usually are"
              hint="Home or work. Only the distance is shown to others, never this exact spot." />
          </>
        )}

        <label className="flex cursor-pointer items-start gap-3 text-sm">
          <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-blood" required checked={form.acceptTerms}
            onChange={(e) => setForm({ ...form, acceptTerms: e.target.checked })} />
          <span>
            I'm 18 or older and agree to the{' '}
            <Link to="/terms" target="_blank" className="font-extrabold text-blood underline">terms of use</Link> and{' '}
            <Link to="/privacy" target="_blank" className="font-extrabold text-blood underline">privacy policy</Link>.
          </span>
        </label>

        {error && <p className="text-sm font-medium text-blood">{error}</p>}
        <button className="btn-primary w-full py-3" disabled={busy}>
          {verifyPhone ? (busy ? 'Sending code…' : 'Continue') : busy ? 'Creating account…' : 'Create account'}
        </button>
      </form>
      <p className="mt-4 text-center text-sm text-slate">
        Already registered? <Link to="/login" className="font-extrabold text-blood underline">Log in</Link>
      </p>
    </div>
  );
}
