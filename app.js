"use strict";

const STORAGE_KEY = "concursofoco.v1";
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
const pad = (n) => String(n).padStart(2, "0");
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ---------- Datas ---------- */

function startOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function startOfWeek(ts) {
  const d = new Date(startOfDay(ts));
  d.setDate(d.getDate() - d.getDay());
  return d.getTime();
}

function startOfMonth(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  d.setDate(1);
  return d.getTime();
}

function startOfNextMonth(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  d.setDate(1);
  d.setMonth(d.getMonth() + 1);
  return d.getTime();
}

function dayKey(ts) {
  const d = new Date(ts);
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}

function formatClock(totalSec) {
  totalSec = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return pad(h) + ":" + pad(m) + ":" + pad(s);
}

function formatDuration(totalSec) {
  totalSec = Math.round(totalSec);
  const h = Math.floor(totalSec / 3600);
  const m = Math.round((totalSec % 3600) / 60);
  if (h > 0 && m > 0) return h + "h " + m + "min";
  if (h > 0) return h + "h";
  if (m > 0) return m + "min";
  return totalSec + "s";
}

function formatDateLong(ts) {
  return new Date(ts).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
}

function relDayLabel(ts) {
  const today = startOfDay(Date.now());
  if (startOfDay(ts) === today) return "Hoje";
  if (startOfDay(ts) === today - 86400000) return "Ontem";
  return formatDateLong(ts);
}

/* ---------- Estado ---------- */

const DEFAULT_SUBJECTS = [
  { name: "Português", color: "#4f8ef7", weight: 1 },
  { name: "Matemática", color: "#f2a154", weight: 1 },
  { name: "Raciocínio Lógico", color: "#9b6cf0", weight: 1 },
  { name: "Direito Constitucional", color: "#34c77b", weight: 1 },
  { name: "Direito Administrativo", color: "#e05d8a", weight: 1 },
  { name: "Informática", color: "#38bdd9", weight: 1 },
];

function defaultState() {
  return {
    subjects: DEFAULT_SUBJECTS.map((s) => ({ id: uid(), ...s })),
    sessions: [],
    settings: { dailyGoalMin: 240, weeklyGoalMin: 1200, pomodoroMin: 25, breakMin: 5, longBreakMin: 15 },
    timer: {
      mode: "stopwatch",
      status: "idle",
      subjectId: null,
      phase: "focus",
      accumulatedSec: 0,
      elapsedSec: 0,
      startedAt: null,
      durationSec: null,
      cyclesToday: 0,
      cycleDate: dayKey(Date.now()),
    },
  };
}

let state = loadState();

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    return normalizeState(parsed);
  } catch (e) {
    console.warn("Falha ao carregar dados, usando padrão.", e);
    return defaultState();
  }
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const SESSION_TYPES = ["stopwatch", "pomodoro", "manual"];

function sanitizeColor(c) {
  return typeof c === "string" && HEX_COLOR.test(c) ? c.toLowerCase() : "#4f8ef7";
}

function normalizeState(s) {
  const base = defaultState();
  const subjectIds = new Set();
  const sessionIds = new Set();

  const subjects = (Array.isArray(s.subjects) ? s.subjects : []).map((raw) => {
    if (!raw || typeof raw !== "object") return null;
    const name = typeof raw.name === "string" ? raw.name.trim().slice(0, 60) : "";
    if (!name) return null;
    const id = typeof raw.id === "string" && raw.id ? raw.id : uid();
    if (subjectIds.has(id)) return null;
    subjectIds.add(id);
    return { id, name, color: sanitizeColor(raw.color), weight: Math.max(0.5, Number(raw.weight) || 1) };
  }).filter(Boolean);

  const sessions = (Array.isArray(s.sessions) ? s.sessions : []).map((raw) => {
    if (!raw || typeof raw !== "object") return null;
    const seconds = Number(raw.seconds);
    const start = Number(raw.start);
    if (!isFinite(seconds) || !isFinite(start)) return null;
    const id = typeof raw.id === "string" && raw.id ? raw.id : uid();
    if (sessionIds.has(id)) return null;
    sessionIds.add(id);
    return {
      id,
      subjectId: typeof raw.subjectId === "string" ? raw.subjectId : "",
      start: Math.round(start),
      seconds: Math.max(1, Math.round(seconds)),
      note: typeof raw.note === "string" ? raw.note.slice(0, 120) : "",
      type: SESSION_TYPES.includes(raw.type) ? raw.type : "stopwatch",
    };
  }).filter(Boolean);

  const rawSettings = s.settings && typeof s.settings === "object" ? s.settings : {};

  return {
    subjects: subjects.length ? subjects : base.subjects,
    sessions,
    settings: {
      dailyGoalMin: Math.max(10, Number(rawSettings.dailyGoalMin) || base.settings.dailyGoalMin),
      weeklyGoalMin: Math.max(30, Number(rawSettings.weeklyGoalMin) || base.settings.weeklyGoalMin),
      pomodoroMin: clamp(Number(rawSettings.pomodoroMin) || base.settings.pomodoroMin, 5, 120),
      breakMin: clamp(Number(rawSettings.breakMin) || base.settings.breakMin, 1, 60),
      longBreakMin: clamp(Number(rawSettings.longBreakMin) || base.settings.longBreakMin, 5, 120),
    },
    timer: normalizeTimerData(s.timer, subjectIds),
  };
}

function normalizeTimerData(raw, subjectIds) {
  const base = defaultState().timer;
  const t = raw && typeof raw === "object" ? raw : {};
  const dur = Number(t.durationSec);
  const out = {
    ...base,
    ...t,
    mode: t.mode === "pomodoro" ? "pomodoro" : "stopwatch",
    status: t.status === "running" || t.status === "paused" ? t.status : "idle",
    phase: t.phase === "break" ? "break" : "focus",
    subjectId: typeof t.subjectId === "string" && subjectIds.has(t.subjectId) ? t.subjectId : null,
    accumulatedSec: Math.max(0, Number(t.accumulatedSec) || 0),
    elapsedSec: Math.max(0, Number(t.elapsedSec) || 0),
    startedAt: typeof t.startedAt === "number" && isFinite(t.startedAt) ? t.startedAt : null,
    durationSec: isFinite(dur) && dur > 0 ? Math.round(dur) : null,
    cyclesToday: Math.max(0, Math.round(Number(t.cyclesToday) || 0)),
    cycleDate: typeof t.cycleDate === "string" ? t.cycleDate : dayKey(Date.now()),
  };
  if (out.status === "running") {
    out.status = "paused";
    out.accumulatedSec = out.elapsedSec || out.accumulatedSec || 0;
    out.startedAt = null;
  }
  return out;
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn("Falha ao salvar.", e);
  }
}

/* ---------- Utilidades de dados ---------- */

function getSubject(id) {
  return state.subjects.find((s) => s.id === id) || null;
}

function subjectName(id) {
  const s = getSubject(id);
  return s ? s.name : "Matéria removida";
}

function subjectColor(id) {
  const s = getSubject(id);
  return s ? s.color : "#93a0b8";
}

function sessionsInRange(from, to) {
  return state.sessions.filter((s) => s.start >= from && s.start < to);
}

function sumSec(list) {
  return list.reduce((acc, s) => acc + s.seconds, 0);
}

function addSession(data) {
  const session = {
    id: uid(),
    subjectId: data.subjectId,
    start: data.start,
    seconds: Math.max(1, Math.round(data.seconds)),
    note: data.note || "",
    type: data.type || "stopwatch",
  };
  state.sessions.push(session);
  save();
  return session;
}

/* ---------- Toast / som / notificação ---------- */

let toastTimer = null;
function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2800);
}

function beep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [0, 0.25].forEach((offset, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = i === 0 ? 880 : 1175;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + offset);
      gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + offset + 0.2);
      osc.start(ctx.currentTime + offset);
      osc.stop(ctx.currentTime + offset + 0.22);
    });
    setTimeout(() => ctx.close(), 800);
  } catch (e) { /* som indisponível */ }
}

function notify(title, body) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  if (!document.hidden) return;
  try { new Notification(title, { body }); } catch (e) { /* ignora */ }
}

function requestNotifyPermission() {
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission().catch(() => {});
  }
}

/* ---------- Navegação por abas ---------- */

function switchTab(name) {
  $$(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
  $$(".tab-panel").forEach((p) => p.classList.toggle("active", p.id === "tab-" + name));
  if (name === "dashboard") renderDashboard();
  if (name === "stats") renderStats();
  if (name === "history") renderHistory();
  window.scrollTo({ top: 0 });
}

/* ---------- Cronômetro ---------- */

let tickHandle = null;
let lastPersist = 0;

function timerElapsed() {
  const t = state.timer;
  if (t.status === "running" && t.startedAt) {
    return t.accumulatedSec + (Date.now() - t.startedAt) / 1000;
  }
  return t.accumulatedSec;
}

function ensureCycleDate() {
  const today = dayKey(Date.now());
  if (state.timer.cycleDate !== today) {
    state.timer.cycleDate = today;
    state.timer.cyclesToday = 0;
  }
}

function resetTimerState() {
  const mode = state.timer.mode;
  state.timer.status = "idle";
  state.timer.subjectId = state.timer.subjectId || (state.subjects[0] && state.subjects[0].id) || null;
  state.timer.phase = "focus";
  state.timer.accumulatedSec = 0;
  state.timer.elapsedSec = 0;
  state.timer.startedAt = null;
  state.timer.durationSec = mode === "pomodoro" ? state.settings.pomodoroMin * 60 : null;
  save();
  renderTimer();
}

function timerStart() {
  const t = state.timer;
  if (!t.subjectId) { toast("Escolha uma matéria para começar."); return; }
  ensureCycleDate();
  if (t.status === "idle" || t.status === "paused") {
    if (t.status === "idle") {
      t.accumulatedSec = 0;
      if (t.mode === "pomodoro") {
        t.phase = t.phase || "focus";
        t.durationSec = (t.phase === "focus" ? state.settings.pomodoroMin : state.settings.breakMin) * 60;
      }
      requestNotifyPermission();
    }
    t.startedAt = Date.now();
    t.status = "running";
    save();
    renderTimer();
  }
}

function timerPause() {
  const t = state.timer;
  if (t.status !== "running") return;
  t.accumulatedSec = timerElapsed();
  t.elapsedSec = t.accumulatedSec;
  t.startedAt = null;
  t.status = "paused";
  save();
  renderTimer();
}

function timerFinish() {
  const t = state.timer;
  const elapsed = Math.round(timerElapsed());
  if (t.status === "running" || t.status === "paused") {
    if (t.phase === "focus" && elapsed >= 1) {
      addSession({
        subjectId: t.subjectId,
        start: Date.now() - elapsed * 1000,
        seconds: elapsed,
        note: $("#timerNote").value.trim(),
        type: t.mode,
      });
      $("#timerNote").value = "";
      toast("Sessão de " + formatDuration(elapsed) + " registrada.");
    } else if (t.phase === "break") {
      toast("Pausa encerrada.");
    }
  }
  resetTimerState();
  renderDashboard();
}

function onTick() {
  const t = state.timer;
  if (t.status !== "running") return;
  const elapsed = timerElapsed();
  t.elapsedSec = elapsed;

  if (t.mode === "pomodoro" && t.durationSec && elapsed >= t.durationSec) {
    if (t.phase === "focus") {
      ensureCycleDate();
      addSession({
        subjectId: t.subjectId,
        start: Date.now() - t.durationSec * 1000,
        seconds: t.durationSec,
        note: $("#timerNote").value.trim(),
        type: "pomodoro",
      });
      t.cyclesToday += 1;
      const long = t.cyclesToday % 4 === 0;
      beep();
      notify("Pomodoro concluído!", "Hora da pausa" + (long ? " longa" : "") + ".");
      toast("Pomodoro concluído! Hora da pausa" + (long ? " longa." : "."));
      t.phase = "break";
      t.durationSec = (long ? state.settings.longBreakMin : state.settings.breakMin) * 60;
      t.accumulatedSec = 0;
      t.elapsedSec = 0;
      t.startedAt = Date.now();
    } else {
      beep();
      notify("Pausa concluída!", "Volte ao foco.");
      toast("Pausa concluída. Inicie o próximo foco quando quiser.");
      t.phase = "focus";
      t.durationSec = state.settings.pomodoroMin * 60;
      t.accumulatedSec = 0;
      t.elapsedSec = 0;
      t.startedAt = null;
      t.status = "paused";
    }
    save();
    renderAll();
    return;
  }

  renderTimerTime(elapsed);

  const now = Date.now();
  if (now - lastPersist > 1500) {
    lastPersist = now;
    save();
  }
}

function renderTimerTime(elapsed) {
  const t = state.timer;
  if (t.mode === "pomodoro" && t.durationSec) {
    const remaining = Math.max(0, t.durationSec - elapsed);
    $("#timerTime").textContent = formatClock(remaining);
    document.title = (t.status === "running" ? formatClock(remaining) + " — " + (t.phase === "focus" ? "Foco" : "Pausa") + " • " : "") + "ConcursoFoco";
  } else {
    $("#timerTime").textContent = formatClock(elapsed);
    document.title = (t.status === "running" ? formatClock(elapsed) + " • " : "") + "ConcursoFoco";
  }
}

function renderTimer() {
  const t = state.timer;
  const sel = $("#timerSubject");
  const current = t.subjectId || sel.value || (state.subjects[0] && state.subjects[0].id) || "";
  if (current && !t.subjectId) t.subjectId = current;
  sel.value = current;

  $$("#modeSwitch button").forEach((b) => b.classList.toggle("active", b.dataset.mode === t.mode));

  const phaseEl = $("#timerPhase");
  if (t.mode === "pomodoro") {
    phaseEl.hidden = false;
    phaseEl.textContent = t.phase === "focus" ? "FOCO" : "PAUSA";
    phaseEl.classList.toggle("break", t.phase === "break");
  } else {
    phaseEl.hidden = true;
  }

  const running = t.status === "running";
  $("#btnStart").textContent = running ? "Pausar" : (t.status === "paused" ? "Continuar" : "Iniciar");
  $("#btnFinish").disabled = t.status === "idle";

  if (t.mode === "pomodoro") {
    $("#timerHint").textContent =
      "Ciclos hoje: " + t.cyclesToday + " · Foco " + state.settings.pomodoroMin + "min · Pausa " +
      state.settings.breakMin + "min · Pausa longa " + state.settings.longBreakMin + "min (a cada 4 ciclos)";
  } else {
    $("#timerHint").textContent = "O cronômetro conta o tempo crescente. Finalize para registrar a sessão.";
  }

  renderTimerTime(timerElapsed());
  if (!running) document.title = "ConcursoFoco — Gerenciador de Estudos";
}

/* ---------- Matérias ---------- */

let editingSubjectId = null;

function renderSubjectOptions() {
  const opts = state.subjects.map((s) => '<option value="' + s.id + '">' + esc(s.name) + "</option>").join("");
  const timerSel = $("#timerSubject");
  const keepTimer = state.timer.subjectId || timerSel.value;
  timerSel.innerHTML = opts || '<option value="">Nenhuma matéria</option>';
  if (keepTimer && getSubject(keepTimer)) timerSel.value = keepTimer;

  const manualSel = $("#manualSubject");
  const keepManual = manualSel.value;
  manualSel.innerHTML = opts || '<option value="">Nenhuma matéria</option>';
  if (keepManual && getSubject(keepManual)) manualSel.value = keepManual;

  const filterSel = $("#historyFilter");
  const keepFilter = filterSel.value || "all";
  filterSel.innerHTML = '<option value="all">Todas as matérias</option>' + opts;
  filterSel.value = getSubject(keepFilter) || keepFilter === "all" ? keepFilter : "all";
}

function renderSubjects() {
  const wrap = $("#subjectsList");
  if (!state.subjects.length) {
    wrap.innerHTML = '<p class="empty-state">Nenhuma matéria cadastrada.</p>';
    return;
  }
  const weekStart = startOfWeek(Date.now());
  wrap.innerHTML = state.subjects.map((s) => {
    const weekSec = sumSec(sessionsInRange(weekStart, weekStart + 7 * 86400000).filter((x) => x.subjectId === s.id));
    const totalSec = sumSec(state.sessions.filter((x) => x.subjectId === s.id));
    return (
      '<div class="subject-item" style="border-left-color:' + esc(s.color) + '">' +
        '<div class="name"><span class="dot" style="background:' + esc(s.color) + '"></span>' + esc(s.name) + "</div>" +
        '<div class="meta"><span>Peso: ' + s.weight + "</span><span>Semana: " + formatDuration(weekSec) + "</span><span>Total: " + formatDuration(totalSec) + "</span></div>" +
        '<div class="actions">' +
          '<button class="btn small" data-edit="' + s.id + '">Editar</button>' +
          '<button class="btn small danger" data-del="' + s.id + '">Excluir</button>' +
        "</div>" +
      "</div>"
    );
  }).join("");
}

function resetSubjectForm() {
  editingSubjectId = null;
  $("#subjectFormTitle").textContent = "Adicionar matéria";
  $("#subjectSubmit").textContent = "Adicionar";
  $("#subjectCancel").hidden = true;
  $("#subjectName").value = "";
  $("#subjectColor").value = "#4f8ef7";
  $("#subjectWeight").value = "1";
}

function startEditSubject(id) {
  const s = getSubject(id);
  if (!s) return;
  editingSubjectId = id;
  $("#subjectFormTitle").textContent = "Editar matéria";
  $("#subjectSubmit").textContent = "Salvar alterações";
  $("#subjectCancel").hidden = false;
  $("#subjectName").value = s.name;
  $("#subjectColor").value = s.color;
  $("#subjectWeight").value = s.weight;
  $("#subjectName").focus();
}

/* ---------- Dashboard ---------- */

function renderDashboard() {
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

function computeStreak() {
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

/* ---------- Estatísticas ---------- */

function renderStats() {
  const periodDays = Number($("#statsPeriod").value);
  const now = Date.now();
  const from = periodDays ? startOfDay(now) - (periodDays - 1) * 86400000 : 0;
  const list = state.sessions.filter((s) => s.start >= from);
  const total = sumSec(list);
  const activeDays = new Set(list.map((s) => dayKey(s.start))).size;

  $("#statsTotal").textContent = formatDuration(total);
  $("#statsAvg").textContent = activeDays ? formatDuration(total / activeDays) : "0min";
  $("#statsDays").textContent = String(activeDays);

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
}

function renderGoalStats(now) {
  const el = $("#goalStats");
  const weekStart = startOfWeek(now);
  const weekList = sessionsInRange(weekStart, weekStart + 7 * 86400000);
  const totalWeight = state.subjects.reduce((acc, s) => acc + (Number(s.weight) || 1), 0) || 1;
  const weeklyGoalSec = state.settings.weeklyGoalMin * 60;

  if (!state.subjects.length) {
    el.innerHTML = '<p class="empty-state">Cadastre matérias para ver as metas.</p>';
    return;
  }

  el.innerHTML = state.subjects.map((s) => {
    const done = sumSec(weekList.filter((x) => x.subjectId === s.id));
    const goal = Math.round(weeklyGoalSec * ((Number(s.weight) || 1) / totalWeight));
    const pct = goal ? Math.min(100, Math.round((done / goal) * 100)) : 0;
    return (
      '<div class="bar-row">' +
        '<div class="bar-head">' +
          '<span class="name"><span class="dot" style="background:' + esc(s.color) + '"></span>' + esc(s.name) + "</span>" +
          "<span>" + formatDuration(done) + " / " + formatDuration(goal) + " · " + pct + "%</span>" +
        "</div>" +
        '<div class="bar-track"><div class="bar-fill" style="width:' + pct + "%;background:" + esc(s.color) + '"></div></div>' +
        '<span class="bar-sub">peso ' + s.weight + " · " + (pct >= 100 ? "meta batida" : "faltam " + formatDuration(Math.max(0, goal - done))) + "</span>" +
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

/* ---------- Histórico ---------- */

function renderHistory() {
  const filter = $("#historyFilter").value || "all";
  let list = state.sessions.slice();
  if (filter !== "all") list = list.filter((s) => s.subjectId === filter);
  list.sort((a, b) => b.start - a.start);

  const el = $("#historyList");
  if (!list.length) {
    el.innerHTML = '<p class="empty-state">Nenhuma sessão encontrada.</p>';
    return;
  }

  const groups = new Map();
  list.forEach((s) => {
    const key = dayKey(s.start);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  });

  el.innerHTML = Array.from(groups.entries()).map(([key, sessions]) => {
    const dayTotal = sumSec(sessions);
    const header =
      '<h4>' + relDayLabel(sessions[0].start) + " · " + formatDuration(dayTotal) + "</h4>";
    const rows = sessions.map((s) => {
      const d = new Date(s.start);
      return (
        '<div class="session-row">' +
          '<span class="time-val">' + pad(d.getHours()) + ":" + pad(d.getMinutes()) + "</span>" +
          '<span class="dot" style="background:' + esc(subjectColor(s.subjectId)) + '"></span>' +
          "<span>" + esc(subjectName(s.subjectId)) + "</span>" +
          '<span class="session-note">' + esc(s.note || (s.type === "pomodoro" ? "Pomodoro" : s.type === "manual" ? "Manual" : "")) + "</span>" +
          '<span class="spacer"></span>' +
          '<span class="time-val">' + formatDuration(s.seconds) + "</span>" +
          '<button class="btn small danger" data-delsession="' + s.id + '">Excluir</button>' +
        "</div>"
      );
    }).join("");
    return '<div class="day-group" data-day="' + key + '">' + header + rows + "</div>";
  }).join("");
}

/* ---------- Configurações ---------- */

function renderSettings() {
  $("#setDailyGoal").value = state.settings.dailyGoalMin;
  $("#setWeeklyGoal").value = state.settings.weeklyGoalMin;
  $("#setPomodoro").value = state.settings.pomodoroMin;
  $("#setBreak").value = state.settings.breakMin;
  $("#setLongBreak").value = state.settings.longBreakMin;
}

/* ---------- Exportar / importar ---------- */

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "concursofoco-backup-" + dayKey(Date.now()) + ".json";
  a.click();
  URL.revokeObjectURL(url);
  toast("Backup exportado.");
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!parsed || !Array.isArray(parsed.subjects) || !Array.isArray(parsed.sessions)) {
        throw new Error("formato inválido");
      }
      if (!confirm("Substituir todos os dados atuais pelos dados importados?")) return;
      state = normalizeState(parsed);
      save();
      renderAll();
      renderSettings();
      toast("Dados importados com sucesso.");
    } catch (e) {
      toast("Arquivo inválido. Importe um backup exportado pelo app.");
    }
  };
  reader.readAsText(file);
}

/* ---------- Inicialização ---------- */

function renderAll() {
  renderSubjectOptions();
  renderTimer();
  renderSubjects();
  renderDashboard();
  renderStats();
  renderHistory();
}

function bindEvents() {
  $("#tabs").addEventListener("click", (e) => {
    const tab = e.target.closest(".tab");
    if (tab) switchTab(tab.dataset.tab);
  });

  $("#modeSwitch").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-mode]");
    if (!btn) return;
    if (state.timer.status === "running") {
      toast("Pause ou finalize antes de trocar o modo.");
      return;
    }
    if (state.timer.status === "paused" && state.timer.accumulatedSec > 0) {
      if (!confirm("Trocar de modo descarta o tempo atual não finalizado. Continuar?")) return;
    }
    state.timer.mode = btn.dataset.mode;
    resetTimerState();
    renderTimer();
  });

  $("#timerSubject").addEventListener("change", (e) => {
    if (state.timer.status === "idle") {
      state.timer.subjectId = e.target.value;
      save();
    }
  });

  $("#btnStart").addEventListener("click", () => {
    if (!state.subjects.length) { toast("Cadastre uma matéria primeiro."); return; }
    if (state.timer.status === "running") timerPause();
    else timerStart();
  });

  $("#btnFinish").addEventListener("click", timerFinish);

  $("#quickStart").addEventListener("click", (e) => {
    const chip = e.target.closest("[data-quick]");
    if (!chip) return;
    const id = chip.dataset.quick;
    if (state.timer.status === "idle") {
      state.timer.subjectId = id;
      save();
    }
    switchTab("timer");
    renderTimer();
  });

  $("#subjectForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = $("#subjectName").value.trim();
    if (!name) return;
    const color = $("#subjectColor").value;
    const weight = Math.max(0.5, Number($("#subjectWeight").value) || 1);
    if (editingSubjectId) {
      const s = getSubject(editingSubjectId);
      if (s) { s.name = name; s.color = color; s.weight = weight; }
      toast("Matéria atualizada.");
    } else {
      state.subjects.push({ id: uid(), name, color, weight });
      toast("Matéria adicionada.");
    }
    save();
    resetSubjectForm();
    renderAll();
  });

  $("#subjectCancel").addEventListener("click", resetSubjectForm);

  $("#subjectsList").addEventListener("click", (e) => {
    const editBtn = e.target.closest("[data-edit]");
    const delBtn = e.target.closest("[data-del]");
    if (editBtn) { startEditSubject(editBtn.dataset.edit); return; }
    if (delBtn) {
      const id = delBtn.dataset.del;
      const s = getSubject(id);
      if (!s) return;
      if (state.timer.subjectId === id && state.timer.status !== "idle") {
        toast("Finalize o cronômetro desta matéria antes de excluí-la.");
        return;
      }
      const count = state.sessions.filter((x) => x.subjectId === id).length;
      const msg = count
        ? 'Excluir "' + s.name + '"? As ' + count + " sessões registradas serão mantidas."
        : 'Excluir "' + s.name + '"?';
      if (!confirm(msg)) return;
      state.subjects = state.subjects.filter((x) => x.id !== id);
      if (state.timer.subjectId === id) state.timer.subjectId = null;
      save();
      renderAll();
      toast("Matéria excluída.");
    }
  });

  $("#manualForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const start = new Date($("#manualStart").value).getTime();
    const minutes = Number($("#manualMinutes").value);
    const subjectId = $("#manualSubject").value;
    if (!start || !minutes || minutes < 1 || !subjectId) { toast("Preencha todos os campos."); return; }
    addSession({
      subjectId,
      start,
      seconds: minutes * 60,
      note: $("#manualNote").value.trim(),
      type: "manual",
    });
    $("#manualNote").value = "";
    renderAll();
    toast("Sessão registrada.");
  });

  $("#historyFilter").addEventListener("change", renderHistory);

  $("#historyList").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-delsession]");
    if (!btn) return;
    if (!confirm("Excluir esta sessão do histórico?")) return;
    state.sessions = state.sessions.filter((s) => s.id !== btn.dataset.delsession);
    save();
    renderAll();
    toast("Sessão excluída.");
  });

  $("#statsPeriod").addEventListener("change", renderStats);

  $("#settingsForm").addEventListener("submit", (e) => {
    e.preventDefault();
    state.settings.dailyGoalMin = Math.max(10, Number($("#setDailyGoal").value) || 240);
    state.settings.weeklyGoalMin = Math.max(30, Number($("#setWeeklyGoal").value) || 1200);
    state.settings.pomodoroMin = clamp(Number($("#setPomodoro").value) || 25, 5, 120);
    state.settings.breakMin = clamp(Number($("#setBreak").value) || 5, 1, 60);
    state.settings.longBreakMin = clamp(Number($("#setLongBreak").value) || 15, 5, 120);
    save();
    renderSettings();
    renderTimer();
    renderDashboard();
    renderStats();
    toast("Ajustes salvos.");
  });

  $("#btnExport").addEventListener("click", exportData);

  $("#importFile").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) importData(file);
    e.target.value = "";
  });

  $("#btnReset").addEventListener("click", () => {
    if (!confirm("Apagar TODOS os dados (matérias, sessões e ajustes)? Esta ação não pode ser desfeita.")) return;
    if (!confirm("Tem certeza? Considere exportar um backup antes.")) return;
    localStorage.removeItem(STORAGE_KEY);
    state = defaultState();
    save();
    renderAll();
    renderSettings();
    toast("Todos os dados foram apagados.");
  });
}

function init() {
  renderSettings();
  renderAll();
  bindEvents();

  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  $("#manualStart").value = now.toISOString().slice(0, 16);

  tickHandle = setInterval(onTick, 500);
  save();
}

document.addEventListener("DOMContentLoaded", init);
