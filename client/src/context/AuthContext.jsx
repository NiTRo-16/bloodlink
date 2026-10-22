import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, tokenStore } from '../lib/api.js';
import { reconnectSocket } from '../lib/socket.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [eligibility, setEligibility] = useState(null);
  const [loading, setLoading] = useState(Boolean(tokenStore.get()));

  const refresh = useCallback(async () => {
    if (!tokenStore.get()) return;
    try {
      const data = await api('/me');
      setUser(data.user);
      setEligibility(data.eligibility);
    } catch (err) {
      if (err.status === 401) {
        tokenStore.clear();
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const signIn = useCallback(
    async ({ token }) => {
      tokenStore.set(token);
      reconnectSocket();
      await refresh();
    },
    [refresh]
  );

  const signOut = useCallback(() => {
    tokenStore.clear();
    setUser(null);
    setEligibility(null);
    reconnectSocket();
  }, []);

  const updateProfile = useCallback(async (changes) => {
    const data = await api('/me', { method: 'PATCH', body: changes });
    setUser(data.user);
    setEligibility(data.eligibility);
    return data;
  }, []);

  return (
    <AuthContext.Provider value={{ user, eligibility, loading, signIn, signOut, refresh, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
