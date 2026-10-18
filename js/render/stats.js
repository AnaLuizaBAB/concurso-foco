import { $, esc, formatDuration } from "../utils.js";
import { state, sessionsInRange, sumSec, subjectName, subjectColor, quizSummary } from "../storage.js";
import { startOfDay, startOfWeek, dayKey } from "../dates.js";

export function renderStats() {
  const periodDays = Number($("#statsPeriod").value);
  const now = Date.now();
  const from = periodDays ? startOfDay(now) - (periodDays - 1) * 86400000 : 0;
  const list = state.sessions.filter((s) => s.start >= from);
  const total = sumSec(list);
  const activeDays = new Set(list.map((s) => dayKey(s.start))).size;

  $("#statsTotal").textContent = formatDuration(total);
  $("#statsAvg").textContent = activeDays ? formatDuration(total / activeDays) : "0min";
  $("#statsDays").textContent = String(activeDays);

  const quiz = quizSummary(list);
  $("#statsQuestions").textContent = String(quiz.questions);
  $("#statsAccuracy").textContent = quiz.accuracy === null ? "—" : quiz.accuracy + "%";

  const bySubject = new Map();
  list.forEach((s) => bySubject.set(s.subjectId, (bySubject.get(s.subjectId) || 0) + s.seconds));
  const rows = Array.from(bySubject.entries()).sort((a, b) => b[1] - a[1]);
  const max = rows.length ? rows[0][1] : 1;
  const subjectStatsEl = $("#subjectStats");
  if (!rows.length) {
    subjectStatsEl.innerHTML = '<p class="empty-state">Sem dados no período selecionado.</p>';
  } else {
    subjectStatsEl.innerHTML = rows.map(([id, sec]) => {
      const pct = Math.round((sec / total) * 100);
      return (
        '<div class="bar-row">' +
          '<div class="bar-head">' +
            '<span class="name"><span class="dot" style="background:' + esc(subjectColor(id)) + '"></span>' + esc(subjectName(id)) + "</span>" +
            "<span>" + formatDuration(sec) + " · " + pct + "%</span>" +
          "</div>" +
          '<div class="bar-track"><div class="bar-fill" style="width:' + Math.round((sec / max) * 100) + "%;background:" + esc(subjectColor(id)) + '"></div></div>' +
        "</div>"
      );
    }).join("");
  }

  renderGoalStats(now);
  renderDailyChart(now);
  renderHeatmap(now);
}

function renderGoalStats(now) {
  const el = $("#goalStats");
  const weekStart = startOfWeek(now);
  const weekList = sessionsInRange(weekStart, weekStart + 7 * 86400000);
  const weeklyGoalSec = state.settings.weeklyGoalMin * 60;

  if (!state.subjects.length) {
    el.innerHTML = '<p class="empty-state">Cadastre matérias para ver as metas.</p>';
    return;
  }

  const fixed = state.subjects.filter((s) => s.weeklyGoalMin);
  const flexible = state.subjects.filter((s) => !s.weeklyGoalMin);
  const fixedSec = fixed.reduce((acc, s) => acc + s.weeklyGoalMin * 60, 0);
  const remainingSec = Math.max(0, weeklyGoalSec - fixedSec);
  const flexibleWeight = flexible.reduce((acc, s) => acc + (Number(s.weight) || 1), 0);

  el.innerHTML = state.subjects.map((s) => {
    const done = sumSec(weekList.filter((x) => x.subjectId === s.id));
    const weight = Number(s.weight) || 1;
    const goal = s.weeklyGoalMin
      ? s.weeklyGoalMin * 60
      : (flexibleWeight ? Math.round(remainingSec * (weight / flexibleWeight)) : 0);
    const pct = goal ? Math.min(100, Math.round((done / goal) * 100)) : 0;
    const legend = s.weeklyGoalMin ? "meta individual" : "peso " + s.weight;
    const status = goal === 0 ? "sem meta restante" : (pct >= 100 ? "meta batida" : "faltam " + formatDuration(Math.max(0, goal - done)));
    return (
      '<div class="bar-row">' +
        '<div class="bar-head">' +
          '<span class="name"><span class="dot" style="background:' + esc(s.color) + '"></span>' + esc(s.name) + "</span>" +
          "<span>" + formatDuration(done) + " / " + formatDuration(goal) + " · " + pct + "%</span>" +
        "</div>" +
        '<div class="bar-track"><div class="bar-fill" style="width:' + pct + "%;background:" + esc(s.color) + '"></div></div>' +
        '<span class="bar-sub">' + esc(legend) + " · " + status + "</span>" +
      "</div>"
    );
  }).join("");
}

function renderDailyChart(now) {
  const el = $("#dailyChart");
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const start = startOfDay(now) - i * 86400000;
    const sec = sumSec(sessionsInRange(start, start + 86400000));
    days.push({ start, sec });
  }
  const max = Math.max(...days.map((d) => d.sec), 1);
  const shortWeek = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  el.innerHTML = days.map((d) => {
    const label = new Date(d.start).getDate() + " " + shortWeek[new Date(d.start).getDay()];
    const h = d.sec ? Math.max(4, Math.round((d.sec / max) * 100)) : 2;
    return (
      '<div class="day-col">' +
        '<span class="day-tip">' + (d.sec ? formatDuration(d.sec) : "0min") + "</span>" +
        '<div class="day-bar' + (d.sec ? "" : " zero") + '" style="height:' + h + '%"></div>' +
        '<span class="day-label">' + label + "</span>" +
      "</div>"
    );
  }).join("");
}

function renderHeatmap(now) {
  const el = $("#heatmap");
  const currentWeek = startOfWeek(now);
  const firstWeek = currentWeek - 11 * 7 * 86400000;
  const end = currentWeek + 7 * 86400000;
  const daySec = new Map();
  state.sessions.forEach((s) => {
    const day = startOfDay(s.start);
    if (day >= firstWeek && day < end) daySec.set(day, (daySec.get(day) || 0) + s.seconds);
  });
  const max = Math.max(1, ...Array.from(daySec.values()));
  const cells = [];
  for (let week = 0; week < 12; week++) {
    for (let day = 0; day < 7; day++) {
      const start = firstWeek + week * 7 * 86400000 + day * 86400000;
      const sec = daySec.get(start) || 0;
      const level = sec > 0 ? Math.min(4, Math.ceil((sec / max) * 4)) : 0;
      const label = formatDuration(sec) + " · " +
        new Date(start).toLocaleDateString("pt-BR", { weekday: "short", day: "numeric", month: "short" });
      cells.push('<div class="heat-cell' + (level ? " l" + level : "") + '" title="' + esc(label) + '"></div>');
    }
  }
  el.innerHTML = cells.join("");
}
