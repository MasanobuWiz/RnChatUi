import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { fetchAuthSession } from 'aws-amplify/auth';

export type Tier = 'guest' | 'free' | 'pro';
type SubsState = { loaded: boolean; tier: Tier };

const SubsContext = createContext<SubsState>({ loaded: false, tier: 'guest' });

export function SubsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SubsState>({ loaded: false, tier: 'guest' });

  async function detect() {
    try {
      const session = await fetchAuthSession();
      const id = session.tokens?.idToken;
      if (!id) return setState({ loaded: true, tier: 'guest' });
      const payload: any = id.payload || {};
      const t = String(payload['custom:tier'] || 'free').toLowerCase();
      setState({ loaded: true, tier: (t === 'pro' ? 'pro' : 'free') as Tier });
    } catch {
      setState({ loaded: true, tier: 'guest' });
    }
  }

  useEffect(() => { detect(); }, []);

  return <SubsContext.Provider value={state}>{children}</SubsContext.Provider>;
}

export const useEntitlements = () => useContext(SubsContext);