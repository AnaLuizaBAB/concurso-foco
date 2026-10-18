export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
export const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
export const pad = (n) => String(n).padStart(2, "0");
export const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

export function parseCount(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

export function readQuizInputs(qEl, cEl) {
  const q = parseCount(qEl.value);
  const questions = q !== null && q > 0 ? q : null;
  const c = parseCount(cEl.value);
  return { questions, correct: questions !== null && c !== null ? clamp(c, 0, questions) : null };
}

export function syncQuizFields(qEl, cEl) {
  const field = cEl.closest(".field");
  const show = parseCount(qEl.value) > 0;
  field.hidden = !show;
  if (!show) cEl.value = "";
}

export function toInputDateTime(ts) {
  const d = new Date(ts);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function formatClock(totalSec) {
  totalSec = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return pad(h) + ":" + pad(m) + ":" + pad(s);
}

export function formatDuration(totalSec) {
  totalSec = Math.round(totalSec);
  const h = Math.floor(totalSec / 3600);
  const m = Math.round((totalSec % 3600) / 60);
  if (h > 0 && m > 0) return h + "h " + m + "min";
  if (h > 0) return h + "h";
  if (m > 0) return m + "min";
  return totalSec + "s";
}
