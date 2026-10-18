import { uid, clamp, parseCount } from "./utils.js";
import { dayKey } from "./dates.js";

export const STORAGE_KEY = "concursofoco.v1";

const DEFAULT_SUBJECTS = [
  { name: "Português", color: "#4f8ef7", weight: 1 },
  { name: "Matemática", color: "#f2a154", weight: 1 },
  { name: "Raciocínio Lógico", color: "#9b6cf0", weight: 1 },
  { name: "Direito Constitucional", color: "#34c77b", weight: 1 },
  { name: "Direito Administrativo", color: "#e05d8a", weight: 1 },
  { name: "Informática", color: "#38bdd9", weight: 1 },
];

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const SESSION_TYPES = ["stopwatch", "pomodoro", "manual"];
const THEMES = ["auto", "dark", "light"];

export function sanitizeColor(c) {
  return typeof c === "string" && HEX_COLOR.test(c) ? c.toLowerCase() : "#4f8ef7";
}

export function sanitizeTheme(t) {
  return THEMES.includes(t) ? t : "auto";
}

export function defaultState() {
  return {
    subjects: DEFAULT_SUBJECTS.map((s) => ({ id: uid(), ...s, weeklyGoalMin: null })),
    sessions: [],
    settings: { dailyGoalMin: 240, weeklyGoalMin: 1200, pomodoroMin: 25, breakMin: 5, longBreakMin: 15, theme: "auto" },
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

export function loadState() {
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

export function normalizeState(s) {
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
    const goalRaw = Number(raw.weeklyGoalMin);
    return {
      id,
      name,
      color: sanitizeColor(raw.color),
      weight: Math.max(0.5, Number(raw.weight) || 1),
      weeklyGoalMin: Number.isFinite(goalRaw) && goalRaw > 0 ? Math.round(goalRaw) : null,
    };
  }).filter(Boolean);

  const sessions = (Array.isArray(s.sessions) ? s.sessions : []).map((raw) => {
    if (!raw || typeof raw !== "object") return null;
    const seconds = Number(raw.seconds);
    const start = Number(raw.start);
    if (!isFinite(seconds) || !isFinite(start)) return null;
    const id = typeof raw.id === "string" && raw.id ? raw.id : uid();
    if (sessionIds.has(id)) return null;
    sessionIds.add(id);
    const q = parseCount(raw.questions);
    const questions = q !== null && q > 0 ? q : null;
    const c = parseCount(raw.correct);
    return {
      id,
      subjectId: typeof raw.subjectId === "string" ? raw.subjectId : "",
      start: Math.round(start),
      seconds: Math.max(1, Math.round(seconds)),
      note: typeof raw.note === "string" ? raw.note.slice(0, 120) : "",
      type: SESSION_TYPES.includes(raw.type) ? raw.type : "stopwatch",
      questions,
      correct: questions !== null && c !== null ? clamp(c, 0, questions) : null,
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
      theme: sanitizeTheme(rawSettings.theme),
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

export let state = loadState();

export function setState(next) {
  state = next;
}

let saveHandle = null;

export function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn("Falha ao salvar.", e);
  }
}

export function scheduleSave() {
  if (saveHandle) return;
  saveHandle = setTimeout(() => {
    saveHandle = null;
    save();
  }, 2000);
}

export function flushSave() {
  if (saveHandle) {
    clearTimeout(saveHandle);
    saveHandle = null;
  }
  save();
}

export function getSubject(id) {
  return state.subjects.find((s) => s.id === id) || null;
}

export function subjectName(id) {
  const s = getSubject(id);
  return s ? s.name : "Matéria removida";
}

export function subjectColor(id) {
  const s = getSubject(id);
  return s ? s.color : "#93a0b8";
}

export function sessionsInRange(from, to) {
  return state.sessions.filter((s) => s.start >= from && s.start < to);
}

export function sumSec(list) {
  return list.reduce((acc, s) => acc + s.seconds, 0);
}

export function quizSummary(list) {
  const questions = list.reduce((acc, s) => acc + (s.questions || 0), 0);
  const withCorrect = list.filter((s) => s.questions != null && s.correct != null);
  const correctQuestions = withCorrect.reduce((acc, s) => acc + s.questions, 0);
  const correct = withCorrect.reduce((acc, s) => acc + s.correct, 0);
  return {
    questions,
    correctQuestions,
    correct,
    accuracy: correctQuestions ? Math.round((correct / correctQuestions) * 100) : null,
  };
}

export function addSession(data) {
  const q = parseCount(data.questions);
  const questions = q !== null && q > 0 ? q : null;
  const c = parseCount(data.correct);
  const session = {
    id: uid(),
    subjectId: data.subjectId,
    start: data.start,
    seconds: Math.max(1, Math.round(data.seconds)),
    note: data.note || "",
    type: data.type || "stopwatch",
    questions,
    correct: questions !== null && c !== null ? clamp(c, 0, questions) : null,
  };
  state.sessions.push(session);
  save();
  return session;
}
