import { $, esc, clamp, formatDuration } from "../utils.js";
import { state, sessionsInRange, sumSec, subjectName, subjectColor } from "../storage.js";
import { startOfDay, startOfWeek, startOfMonth, startOfNextMonth, dayKey, relDayLabel } from "../dates.js";

export function renderDashboard() {
  const now = Date.now();
  const todaySec = sumSec(sessionsInRange(startOfDay(now), startOfDay(now) + 86400000));
  const weekSec = sumSec(sessionsInRange(startOfWeek(now), startOfWeek(now) + 7 * 86400000));
  const monthSec = sumSec(sessionsInRange(startOfMonth(now), startOfNextMonth(now)));

  $("#statToday").textContent = formatDuration(todaySec);
  $("#statWeek").textContent = formatDuration(weekSec);
  $("#statMonth").textContent = formatDuration(monthSec);

  const streak = computeStreak();
  $("#statStreak").textContent = streak + (streak === 1 ? " dia" : " dias");

  const goalSec = state.settings.dailyGoalMin * 60;
  const pct = goalSec ? clamp(Math.round((todaySec / goalSec) * 100), 0, 100) : 0;
  $("#ring").style.setProperty("--pct", pct);
  $("#ringPct").textContent = pct + "%";
  $("#ringDetail").textContent =
    formatDuration(todaySec) + " de " + formatDuration(goalSec) + " (" + pct + "%)" +
    (pct >= 100 ? " — meta batida!" : " — faltam " + formatDuration(goalSec - todaySec) + ".");
  $("#statTodayGoal").textContent = "meta: " + formatDuration(goalSec);

  const recent = state.sessions.slice(-6).reverse();
  const recentEl = $("#recentList");
  if (!recent.length) {
    recentEl.innerHTML = '<li class="empty">Nenhuma sessão registrada ainda.</li>';
  } else {
    recentEl.innerHTML = recent.map((s) => (
      "<li>" +
        '<span class="dot" style="background:' + esc(subjectColor(s.subjectId)) + '"></span>' +
        "<span>" + esc(subjectName(s.subjectId)) + "</span>" +
        '<span class="spacer"></span>' +
        '<span class="time-val">' + formatDuration(s.seconds) + "</span>" +
        '<span class="hint">' + relDayLabel(s.start) + "</span>" +
      "</li>"
    )).join("");
  }

  const quick = $("#quickStart");
  if (!state.subjects.length) {
    quick.innerHTML = '<p class="hint">Cadastre matérias na aba "Matérias" para começar.</p>';
  } else {
    quick.innerHTML = state.subjects.map((s) =>
      '<button class="chip" data-quick="' + s.id + '">' +
        '<span class="dot" style="background:' + esc(s.color) + '"></span>' + esc(s.name) +
      "</button>"
    ).join("");
  }
}

export function computeStreak() {
  const days = new Set(state.sessions.filter((s) => s.seconds >= 60).map((s) => dayKey(s.start)));
  let d = new Date();
  d.setHours(0, 0, 0, 0);
  if (!days.has(dayKey(d.getTime()))) {
    d.setDate(d.getDate() - 1);
    if (!days.has(dayKey(d.getTime()))) return 0;
  }
  let streak = 0;
  while (days.has(dayKey(d.getTime()))) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}
