import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { fetchAuthSession, signOut } from 'aws-amplify/auth';
import { Hub } from 'aws-amplify/utils';

type AuthState = {
  loaded: boolean;
  signedIn: boolean;
  idToken?: string;
  sub?: string;
  email?: string;
  signOut?: () => Promise<void>;
};

const AuthContext = createContext<AuthState>({ loaded: false, signedIn: false });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ loaded: false, signedIn: false });

  async function refresh() {
    try {
      const session = await fetchAuthSession();
      const id = session.tokens?.idToken;
      const payload: any = id?.payload || {};
      setState({
        loaded: true,
        signedIn: !!id,
        idToken: id?.toString(),
        sub: payload?.sub,
        email: payload?.email,
        signOut: async () => { await signOut(); },
      });
    } catch {
      setState({ loaded: true, signedIn: false, signOut: async () => { await signOut(); } });
    }
  }

  useEffect(() => {
    refresh();
    const unsub = Hub.listen('auth', ({ payload }) => {
      const ev = payload?.event as string | undefined;
      if (ev === 'signedIn' || ev === 'tokenRefresh' || ev === 'signedOut') refresh();
    });
    return () => { unsub(); };
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
