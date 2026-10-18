import { $, $$, formatClock, formatDuration, readQuizInputs, syncQuizFields } from "./utils.js";
import { dayKey } from "./dates.js";
import { state, save, scheduleSave, addSession } from "./storage.js";
import { toast, beep, notify, requestNotifyPermission } from "./ui.js";
import { renderDashboard } from "./render/dashboard.js";
import { renderStats } from "./render/stats.js";
import { renderHistory } from "./render/history.js";

let tickHandle = null;

export function startTicker() {
  if (!tickHandle) tickHandle = setInterval(onTick, 500);
}

export function timerElapsed() {
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

export function resetTimerState() {
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

export function timerStart() {
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

export function timerPause() {
  const t = state.timer;
  if (t.status !== "running") return;
  t.accumulatedSec = timerElapsed();
  t.elapsedSec = t.accumulatedSec;
  t.startedAt = null;
  t.status = "paused";
  save();
  renderTimer();
}

export function timerFinish() {
  const t = state.timer;
  const elapsed = Math.round(timerElapsed());
  if (t.status === "running" || t.status === "paused") {
    if (t.phase === "focus" && elapsed >= 1) {
      const quiz = readQuizInputs($("#timerQuestions"), $("#timerCorrect"));
      addSession({
        subjectId: t.subjectId,
        start: Date.now() - elapsed * 1000,
        seconds: elapsed,
        note: $("#timerNote").value.trim(),
        type: t.mode,
        questions: quiz.questions,
        correct: quiz.correct,
      });
      $("#timerNote").value = "";
      $("#timerQuestions").value = "";
      syncQuizFields($("#timerQuestions"), $("#timerCorrect"));
      toast("Sessão de " + formatDuration(elapsed) + " registrada.");
    } else if (t.phase === "break") {
      toast("Pausa encerrada.");
    }
  }
  resetTimerState();
  renderDashboard();
}

export function onTick() {
  const t = state.timer;
  if (t.status !== "running") return;
  const elapsed = timerElapsed();
  t.elapsedSec = elapsed;

  if (t.mode === "pomodoro" && t.durationSec && elapsed >= t.durationSec) {
    if (t.phase === "focus") {
      ensureCycleDate();
      const quiz = readQuizInputs($("#timerQuestions"), $("#timerCorrect"));
      addSession({
        subjectId: t.subjectId,
        start: Date.now() - t.durationSec * 1000,
        seconds: t.durationSec,
        note: $("#timerNote").value.trim(),
        type: "pomodoro",
        questions: quiz.questions,
        correct: quiz.correct,
      });
      $("#timerNote").value = "";
      $("#timerQuestions").value = "";
      syncQuizFields($("#timerQuestions"), $("#timerCorrect"));
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
    renderTimer();
    renderDashboard();
    renderStats();
    renderHistory();
    return;
  }

  renderTimerTime(elapsed);
  scheduleSave();
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

export function renderTimer() {
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
