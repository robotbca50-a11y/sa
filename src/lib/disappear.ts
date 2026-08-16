/*
  nexus://o8.2 build
  author & every line: OKTAGRAM
  OKTAGRAM YANG MENULIS INI JIKA BERANI BONGKAR BONGKAR
  sig://oktagram
*/

const PREFIX = 'nexus:disappear:';

export function getDisappearSeconds(convKey: string): number {
  try {
    const v = Number(localStorage.getItem(PREFIX + convKey) || '0');
    return v > 0 ? v : 0;
  } catch {
    return 0;
  }
}

export function setDisappearSeconds(convKey: string, seconds: number) {
  try {
    if (seconds > 0) localStorage.setItem(PREFIX + convKey, String(seconds));
    else localStorage.removeItem(PREFIX + convKey);
  } catch {
  }
}

export function cycleDisappear(convKey: string): number {
  const opts = [0, 5, 30, 60, 3600];
  const cur = getDisappearSeconds(convKey);
  const next = opts[(opts.indexOf(cur) + 1) % opts.length];
  setDisappearSeconds(convKey, next);
  return next;
}

export function disappearLabel(seconds: number): string {
  if (seconds <= 0) return 'Off';
  if (seconds < 60) return `${seconds} dtk`;
  if (seconds < 3600) return `${seconds / 60} mnt`;
  return '1 jam';
}
