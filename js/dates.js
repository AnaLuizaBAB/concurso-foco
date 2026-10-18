import { pad } from "./utils.js";

export function startOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function startOfWeek(ts) {
  const d = new Date(startOfDay(ts));
  d.setDate(d.getDate() - d.getDay());
  return d.getTime();
}

export function startOfMonth(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  d.setDate(1);
  return d.getTime();
}

export function startOfNextMonth(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  d.setDate(1);
  d.setMonth(d.getMonth() + 1);
  return d.getTime();
}

export function dayKey(ts) {
  const d = new Date(ts);
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}

export function formatDateLong(ts) {
  return new Date(ts).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
}

export function relDayLabel(ts) {
  const today = startOfDay(Date.now());
  if (startOfDay(ts) === today) return "Hoje";
  if (startOfDay(ts) === today - 86400000) return "Ontem";
  return formatDateLong(ts);
}
