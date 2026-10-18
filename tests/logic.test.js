import assert from "node:assert/strict";

function makeLocalStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
    clear: () => { store.clear(); },
  };
}

globalThis.localStorage = makeLocalStorage();
globalThis.window = globalThis;
globalThis.document = {
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: () => ({ style: {} }),
};

const storage = await import("../js/storage.js");
const dates = await import("../js/dates.js");
const utils = await import("../js/utils.js");
const { computeStreak } = await import("../js/render/dashboard.js");

const { normalizeState, defaultState, setState, addSession, sessionsInRange, sumSec, quizSummary, sanitizeTheme, loadState, save } = storage;
const { startOfDay, startOfWeek, startOfMonth, dayKey } = dates;
const { formatDuration, formatClock, parseCount, esc } = utils;

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log("ok - " + name);
  } catch (e) {
    failed++;
    console.error("falhou - " + name);
    console.error("  " + (e && e.message ? e.message : e));
  }
}

test("startOfWeek retorna o domingo da semana", () => {
  const saturday = new Date(2026, 9, 17, 15, 30).getTime();
  const week = new Date(startOfWeek(saturday));
  assert.equal(week.getDay(), 0);
  assert.equal(week.getDate(), 11);
  assert.equal(new Date(startOfDay(saturday)).getHours(), 0);
});

test("startOfMonth retorna o dia 1", () => {
  const mid = new Date(2026, 9, 17, 15, 30).getTime();
  const first = new Date(startOfMonth(mid));
  assert.equal(first.getDate(), 1);
  assert.equal(first.getHours(), 0);
});

test("dayKey faz padding de mes e dia", () => {
  assert.equal(dayKey(new Date(2026, 0, 5, 12).getTime()), "2026-01-05");
});

test("parseCount trata vazio, negativos e decimais", () => {
  assert.equal(parseCount(""), null);
  assert.equal(parseCount(null), null);
  assert.equal(parseCount(undefined), null);
  assert.equal(parseCount("0"), 0);
  assert.equal(parseCount("5.6"), 6);
  assert.equal(parseCount(-1), null);
  assert.equal(parseCount("abc"), null);
  assert.equal(parseCount(10), 10);
});

test("formatDuration e formatClock", () => {
  assert.equal(formatDuration(3900), "1h 5min");
  assert.equal(formatDuration(3600), "1h");
  assert.equal(formatDuration(300), "5min");
  assert.equal(formatDuration(20), "20s");
  assert.equal(formatDuration(59), "1min");
  assert.equal(formatClock(3661), "01:01:01");
});

test("esc neutraliza HTML", () => {
  assert.equal(esc('<b>"x"&</b>'), "&lt;b&gt;&quot;x&quot;&amp;&lt;/b&gt;");
});

test("backup antigo importa com defaults dos campos novos", () => {
  const legacy = {
    subjects: [{ id: "s1", name: "Português", color: "#ABCDEF", weight: 2 }],
    sessions: [{ id: "a1", subjectId: "s1", start: 1000, seconds: 120, note: "x", type: "manual" }],
    settings: { dailyGoalMin: 120, weeklyGoalMin: 600, pomodoroMin: 30, breakMin: 10, longBreakMin: 20 },
  };
  const n = normalizeState(legacy);
  assert.equal(n.subjects[0].weeklyGoalMin, null);
  assert.equal(n.subjects[0].color, "#abcdef");
  assert.equal(n.sessions[0].questions, null);
  assert.equal(n.sessions[0].correct, null);
  assert.equal(n.settings.theme, "auto");
});

test("normalizeState sanitiza questions e correct", () => {
  const n = normalizeState({
    subjects: [{ id: "s1", name: "A" }],
    sessions: [
      { id: "a1", subjectId: "s1", start: 1, seconds: 10, questions: 10, correct: 15 },
      { id: "a2", subjectId: "s1", start: 2, seconds: 10, questions: 0, correct: 3 },
      { id: "a3", subjectId: "s1", start: 3, seconds: 10, questions: "8", correct: "6" },
      { id: "a4", subjectId: "s1", start: 4, seconds: 10, questions: 5 },
    ],
  });
  assert.equal(n.sessions[0].correct, 10);
  assert.equal(n.sessions[1].questions, null);
  assert.equal(n.sessions[1].correct, null);
  assert.equal(n.sessions[2].questions, 8);
  assert.equal(n.sessions[2].correct, 6);
  assert.equal(n.sessions[3].questions, 5);
  assert.equal(n.sessions[3].correct, null);
});

test("normalizeState sanitiza weeklyGoalMin", () => {
  const n = normalizeState({
    subjects: [
      { id: "s1", name: "A", weeklyGoalMin: "300" },
      { id: "s2", name: "B", weeklyGoalMin: 0 },
      { id: "s3", name: "C", weeklyGoalMin: -10 },
      { id: "s4", name: "D", weeklyGoalMin: 12.6 },
    ],
  });
  assert.equal(n.subjects[0].weeklyGoalMin, 300);
  assert.equal(n.subjects[1].weeklyGoalMin, null);
  assert.equal(n.subjects[2].weeklyGoalMin, null);
  assert.equal(n.subjects[3].weeklyGoalMin, 13);
});

test("sanitizeTheme aceita apenas auto/dark/light", () => {
  assert.equal(sanitizeTheme("light"), "light");
  assert.equal(sanitizeTheme("dark"), "dark");
  assert.equal(sanitizeTheme("azul"), "auto");
  assert.equal(sanitizeTheme(undefined), "auto");
});

test("normalizeState converte timer running em paused", () => {
  const n = normalizeState({
    subjects: [{ id: "s1", name: "A" }],
    timer: { mode: "pomodoro", status: "running", elapsedSec: 100, accumulatedSec: 0, subjectId: "s1" },
  });
  assert.equal(n.timer.status, "paused");
  assert.equal(n.timer.accumulatedSec, 100);
  assert.equal(n.timer.startedAt, null);
});

test("normalizeState remove ids duplicados", () => {
  const n = normalizeState({
    subjects: [{ id: "s1", name: "A" }, { id: "s1", name: "B" }],
    sessions: [
      { id: "x", subjectId: "s1", start: 1, seconds: 10 },
      { id: "x", subjectId: "s1", start: 2, seconds: 10 },
    ],
  });
  assert.equal(n.subjects.length, 1);
  assert.equal(n.sessions.length, 1);
});

test("addSession grava questions/correct com clamp", () => {
  setState(defaultState());
  const sid = storage.state.subjects[0].id;
  const s = addSession({ subjectId: sid, start: 1000, seconds: 60, questions: 4, correct: 9 });
  assert.equal(s.questions, 4);
  assert.equal(s.correct, 4);
  const s2 = addSession({ subjectId: sid, start: 2000, seconds: 60, questions: 0, correct: 2 });
  assert.equal(s2.questions, null);
  assert.equal(s2.correct, null);
});

test("sessionsInRange, sumSec e quizSummary", () => {
  setState(defaultState());
  const sid = storage.state.subjects[0].id;
  addSession({ subjectId: sid, start: 1000, seconds: 60, questions: 10, correct: 8 });
  addSession({ subjectId: sid, start: 2000, seconds: 120, questions: 5, correct: 5 });
  addSession({ subjectId: sid, start: 3000, seconds: 30 });
  assert.equal(storage.state.sessions.length, 3);
  assert.equal(sumSec(sessionsInRange(0, 2500)), 180);
  const q = quizSummary(storage.state.sessions);
  assert.equal(q.questions, 15);
  assert.equal(q.correct, 13);
  assert.equal(q.accuracy, Math.round((13 / 15) * 100));
});

test("quizSummary sem dados retorna accuracy null", () => {
  const q = quizSummary([]);
  assert.equal(q.questions, 0);
  assert.equal(q.accuracy, null);
});

test("computeStreak conta dias consecutivos", () => {
  setState(defaultState());
  const sid = storage.state.subjects[0].id;
  const now = Date.now();
  addSession({ subjectId: sid, start: now - 3600000, seconds: 3600 });
  addSession({ subjectId: sid, start: now - 86400000 - 3600000, seconds: 3600 });
  assert.equal(computeStreak(), 2);
});

test("save e loadState fazem roundtrip", () => {
  setState(defaultState());
  const sid = storage.state.subjects[0].id;
  addSession({ subjectId: sid, start: 5000, seconds: 300, questions: 10, correct: 7 });
  save();
  const loaded = loadState();
  assert.equal(loaded.sessions.length, 1);
  assert.equal(loaded.sessions[0].questions, 10);
  assert.equal(loaded.sessions[0].correct, 7);
});

console.log("");
console.log(passed + " testes passaram, " + failed + " falharam.");
process.exit(failed ? 1 : 0);
