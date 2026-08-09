import { useEffect, useCallback, useState } from 'react';
import Landing from './pages/Landing';
import Auth from './pages/Auth';
import ChatApp from './components/chat/ChatApp';
import Admin from './pages/Admin';
import ToastHost from './components/ToastHost';
import VideoLoader from './components/VideoLoader';
import BlackoutOverlay from './components/BlackoutOverlay';
import { useStore } from './lib/store';
import { loadPrivateKey } from './lib/keystore';
import { exportPublicRaw } from './lib/crypto';
import { initPresence, stopPresence, startLocationSharing, stopLocationSharing } from './lib/realtime';
import { loadSession, clearSession, attachIdleWatcher } from './lib/session';
import { rpcLogout } from './lib/api';
import { updateTitle } from './lib/notify';

function isMasterPortal() {
  return /\/kaukontrol/i.test(window.location.pathname + window.location.hash + window.location.search);
}

export default function App() {
  const view = useStore((s) => s.view);
  const setSession = useStore((s) => s.setSession);
  const setView = useStore((s) => s.setView);
  const [booted, setBooted] = useState(false);

  const doLogout = useCallback(() => {
    stopPresence();
    stopLocationSharing();
    rpcLogout();
    clearSession();
    useStore.getState().setSession(null, null);
    setView('landing');
  }, [setView]);

  useEffect(() => attachIdleWatcher(doLogout), [doLogout]);

  useEffect(() => {
    const onAuthFail = () => doLogout();
    window.addEventListener('nexus:logout', onAuthFail);
    return () => window.removeEventListener('nexus:logout', onAuthFail);
  }, [doLogout]);

  useEffect(() => {
    (async () => {
      const user = loadSession();
      const portal = isMasterPortal();
      if (portal) {
        if (user?.is_admin) setSession(user, null);
        setView('admin');
        return;
      }
      let key: CryptoKey | null = null;
      if (user) {
        try {
          const k = await loadPrivateKey(user.username);
          if (k) {
            const derived = await exportPublicRaw(k);
            if (derived === user.public_key) key = k;
          }
        } catch {
          key = null;
        }
      }
      if (user && key) {
        setSession(user, key);
        setView('app');
        initPresence();
        startLocationSharing();
      } else {
        clearSession();
      }
    })();
  }, [setSession, setView]);

  useEffect(() => {
    const route = () => {
      if (!isMasterPortal()) return;
      stopPresence();
      setView('admin');
    };
    window.addEventListener('popstate', route);
    window.addEventListener('hashchange', route);
    return () => {
      window.removeEventListener('popstate', route);
      window.removeEventListener('hashchange', route);
    };
  }, [setView]);

  useEffect(() => {
    const onVis = () => {
      if (!document.hidden) {
        updateTitle(Object.values(useStore.getState().unread).reduce((a, b) => a + b, 0));
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  return (
    <>
      {view === 'landing' && <Landing />}
      {view === 'auth' && <Auth />}
      {view === 'app' && <ChatApp />}
      {view === 'admin' && <Admin />}
      <BlackoutOverlay />
      <ToastHost />
      {!booted && <VideoLoader onDone={() => setBooted(true)} />}
    </>
  );
}
