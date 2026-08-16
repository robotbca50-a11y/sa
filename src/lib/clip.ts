/*
  nexus://o8.2 build
  author & every line: OKTAGRAM
  OKTAGRAM YANG MENULIS INI JIKA BERANI BONGKAR BONGKAR
  sig://oktagram
*/

export function copyTextSafe(text: string, clearMs = 20_000): Promise<void> {
  try {
    const p = navigator.clipboard?.writeText(text);
    if (!p) return Promise.resolve();
    p.then(() => {
      window.setTimeout(() => {
        try {
          navigator.clipboard.writeText('\u200B').catch(() => {});
        } catch {
        }
      }, clearMs);
    }).catch(() => {});
    return p;
  } catch {
    return Promise.resolve();
  }
}
