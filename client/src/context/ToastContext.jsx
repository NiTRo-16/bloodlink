import { createContext, useCallback, useContext, useState } from 'react';

const ToastContext = createContext(() => {});

// Short messages at the bottom of the screen. tone: 'info' | 'success' | 'error' | 'alert'
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const toast = useCallback((message, tone = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'alert' ? 8000 : 4000);
  }, []);

  const tones = {
    info: 'bg-white text-ink',
    success: 'bg-sage-soft text-ink',
    error: 'bg-amber text-ink',
    alert: 'bg-blood text-white',
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="fixed inset-x-0 bottom-[calc(6rem+env(safe-area-inset-bottom))] z-[1200] sm:bottom-4 flex flex-col items-center gap-2 px-4" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast-in max-w-md rounded-xl border-3 border-ink px-4 py-3 text-sm font-bold shadow-cta ${tones[t.tone]}`}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
