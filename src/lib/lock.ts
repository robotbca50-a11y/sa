const PIN_KEY = 'nexus:lock:pin';
const TIMEOUT_KEY = 'nexus:lock:timeout';

let locked = false;
let lastActive = Date.now();

export function getLockPin(): string | null {
  try {
    return localStorage.getItem(PIN_KEY);
  } catch {
    return null;
  }
}

export function setLockPin(pin: string | null) {
  try {
    if (pin) localStorage.setItem(PIN_KEY, pin);
    else localStorage.removeItem(PIN_KEY);
  } catch {
  }
}

export function getLockTimeout(): number {
  try {
    const v = Number(localStorage.getItem(TIMEOUT_KEY) || '0');
    return v > 0 ? v : 0;
  } catch {
    return 0;
  }
}

export function setLockTimeout(sec: number) {
  try {
    if (sec > 0) localStorage.setItem(TIMEOUT_KEY, String(sec));
    else localStorage.removeItem(TIMEOUT_KEY);
  } catch {
  }
}

export function lockEnabled(): boolean {
  return !!getLockPin() && getLockTimeout() > 0;
}

export function isLocked(): boolean {
  return locked && lockEnabled();
}

export function markActive() {
  lastActive = Date.now();
}

export function lockNow() {
  if (lockEnabled()) locked = true;
}

export function unlock(pin: string): boolean {
  const cur = getLockPin();
  if (cur && pin === cur) {
    locked = false;
    lastActive = Date.now();
    return true;
  }
  return false;
}

export function checkAutoLock(): boolean {
  if (!lockEnabled()) return false;
  const elapsed = (Date.now() - lastActive) / 1000;
  if (elapsed >= getLockTimeout()) {
    locked = true;
    return true;
  }
  return locked;
}

export function onUserActivity() {
  if (locked) return;
  lastActive = Date.now();
}
