/** Small localStorage-backed prefs for favorites and recently-used (spec 07 §7/§9). */
const read = (k: string): string[] => {
  try { const v = JSON.parse(localStorage.getItem(k) ?? "[]"); return Array.isArray(v) ? v : []; }
  catch { return []; }
};
const write = (k: string, v: string[]) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } };

export const getList = (k: string): string[] => read(k);
export const pushRecent = (k: string, v: string, max = 8): string[] => {
  const next = [v, ...read(k).filter((x) => x !== v)].slice(0, max);
  write(k, next);
  return next;
};
export const toggleFav = (k: string, v: string): string[] => {
  const cur = read(k);
  const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
  write(k, next);
  return next;
};
