import { useEffect, useState } from 'react';

/**
 * The "enter the 6-digit code" step, shared by logging in and signing up.
 * sent: { sentTo, resendIn, devCode? } from the server
 * onVerify(code): resolves on success, throws with a readable message on failure
 * onResend(): resolves with a fresh `sent`
 */
export default function CodeStep({ sent, onVerify, onResend, onChangeNumber, submitLabel, busyLabel }) {
  const [code, setCode] = useState('');
  const [wait, setWait] = useState(sent.resendIn ?? 0); // seconds until "Send a new code" works
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (wait <= 0) return undefined;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  async function verify(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await onVerify(code);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  async function resend() {
    setBusy(true);
    setError('');
    try {
      const next = await onResend();
      setCode('');
      setWait(next.resendIn);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={verify} className="space-y-4">
      <p className="text-sm">
        Code sent to <b>{sent.sentTo}</b>.{' '}
        <button type="button" className="font-extrabold text-blood underline" onClick={onChangeNumber}>
          Use a different number
        </button>
      </p>
      {sent.devCode && (
        <p className="rounded-xl border-2 border-ink bg-amber p-3 text-sm">
          Test mode: your code is <b className="font-display tracking-widest">{sent.devCode}</b>. On a live site it arrives by SMS.
        </p>
      )}
      <label className="block">
        <span className="field-label">6-digit code</span>
        <input
          className="input text-center font-display text-2xl tracking-[0.5em]"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          required
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
        />
      </label>
      {error && <p className="text-sm font-medium text-blood">{error}</p>}
      <button className="btn-primary w-full py-3" disabled={busy || code.length !== 6}>{busy ? busyLabel : submitLabel}</button>
      <button type="button" className="btn-secondary w-full" disabled={busy || wait > 0} onClick={resend}>
        {wait > 0 ? `Send a new code in ${wait}s` : 'Send a new code'}
      </button>
    </form>
  );
}
