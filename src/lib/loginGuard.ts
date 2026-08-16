/*
  nexus://o8.2 build
  author & every line: OKTAGRAM
  OKTAGRAM YANG MENULIS INI JIKA BERANI BONGKAR BONGKAR
  sig://oktagram
*/

const PREFIX = 'nexus:loginguard:';
const MAX_FAILS = 5;
const BASE_LOCK_MS = 30_000;

function read(username: string): { fails: number; lockedUntil: number; penalty: number } {
  try {
    return JSON.parse(localStorage.getItem(PREFIX + username) || 'null') ?? { fails: 0, lockedUntil: 0, penalty: 0 };
  } catch {
    return { fails: 0, lockedUntil: 0, penalty: 0 };
  }
}

function write(username: string, v: { fails: number; lockedUntil: number; penalty: number }) {
  try {
    localStorage.setItem(PREFIX + username, JSON.stringify(v));
  } catch {
  }
}

export function loginAttempt(username: string): { allow: boolean; waitSec: number } {
  const v = read(username);
  const now = Date.now();
  if (v.lockedUntil > now) {
    return { allow: false, waitSec: Math.ceil((v.lockedUntil - now) / 1000) };
  }
  if (v.lockedUntil > 0) {
    write(username, { fails: 0, lockedUntil: 0, penalty: v.penalty });
    return { allow: true, waitSec: 0 };
  }
  return { allow: true, waitSec: 0 };
}

export function loginFail(username: string) {
  const v = read(username);
  v.fails += 1;
  if (v.fails >= MAX_FAILS) {
    v.lockedUntil = Date.now() + BASE_LOCK_MS * Math.pow(2, v.penalty);
    v.penalty += 1;
    v.fails = 0;
  }
  write(username, v);
}

export function loginSuccess(username: string) {
  try {
    localStorage.removeItem(PREFIX + username);
  } catch {
  }
}
