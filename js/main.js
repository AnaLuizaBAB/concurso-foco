import { $, $$, clamp, readQuizInputs, syncQuizFields } from "./utils.js";
import { state, setState, save, flushSave, STORAGE_KEY, defaultState, normalizeState, sanitizeTheme, getSubject, addSession } from "./storage.js";
import { dayKey } from "./dates.js";
import { toast, askConfirm, closeConfirm, modalKeydown, registerModalClose } from "./ui.js";
import { timerStart, timerPause, timerFinish, resetTimerState, renderTimer, startTicker } from "./timer.js";
import { renderSubjectOptions, renderSubjects, resetSubjectForm, startEditSubject, submitSubjectForm } from "./render/subjects.js";
import { renderDashboard } from "./render/dashboard.js";
import { renderStats } from "./render/stats.js";
import { renderHistory, openSessionEdit, closeSessionModal, saveSessionEdit } from "./render/history.js";

const TABS = ["dashboard", "timer", "subjects", "stats", "history", "settings"];

function tabFromHash() {
  const name = location.hash.replace(/^#/, "");
  return TABS.includes(name) ? name : "dashboard";
}

function switchTab(name, updateHash) {
  if (!TABS.includes(name)) name = "dashboard";
  $$(".tab").forEach((t) => {
    const active = t.dataset.tab === name;
    t.classList.toggle("active", active);
    t.setAttribute("aria-selected", active ? "true" : "false");
    t.tabIndex = active ? 0 : -1;
  });
  $$(".tab-panel").forEach((p) => p.classList.toggle("active", p.id === "tab-" + name));
  if (updateHash !== false && location.hash !== "#" + name) location.hash = name;
  if (name === "dashboard") renderDashboard();
  if (name === "stats") renderStats();
  if (name === "history") renderHistory();
  window.scrollTo({ top: 0 });
}

function updateThemeColor() {
  const theme = sanitizeTheme(state.settings.theme);
  const light = theme === "light" ||
    (theme === "auto" && window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", light ? "#f4f6fb" : "#0b0f19");
}

function applyTheme() {
  const theme = sanitizeTheme(state.settings.theme);
  const root = document.documentElement;
  if (theme === "auto") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
  updateThemeColor();
}

function renderSettings() {
  $("#setDailyGoal").value = state.settings.dailyGoalMin;
  $("#setWeeklyGoal").value = state.settings.weeklyGoalMin;
  $("#setPomodoro").value = state.settings.pomodoroMin;
  $("#setBreak").value = state.settings.breakMin;
  $("#setLongBreak").value = state.settings.longBreakMin;
  $("#setTheme").value = sanitizeTheme(state.settings.theme);
}

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
  reader.onload = async () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!parsed || !Array.isArray(parsed.subjects) || !Array.isArray(parsed.sessions)) {
        throw new Error("formato inválido");
      }
      if (!(await askConfirm("Substituir todos os dados atuais pelos dados importados?", { confirmLabel: "Importar" }))) return;
      setState(normalizeState(parsed));
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

  $("#tabs").addEventListener("keydown", (e) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    const tabs = $$(".tab");
    const idx = tabs.indexOf(document.activeElement);
    if (idx === -1) return;
    e.preventDefault();
    let next = idx;
    if (e.key === "ArrowLeft") next = (idx - 1 + tabs.length) % tabs.length;
    else if (e.key === "ArrowRight") next = (idx + 1) % tabs.length;
    else if (e.key === "Home") next = 0;
    else next = tabs.length - 1;
    tabs[next].focus();
    switchTab(tabs[next].dataset.tab);
  });

  window.addEventListener("hashchange", () => switchTab(tabFromHash(), false));

  document.addEventListener("keydown", modalKeydown);

  registerModalClose("confirmModal", () => closeConfirm(false));
  registerModalClose("sessionModal", closeSessionModal);

  $("#confirmOk").addEventListener("click", () => closeConfirm(true));
  $("#confirmCancel").addEventListener("click", () => closeConfirm(false));
  $("#confirmModal").addEventListener("click", (e) => {
    if (e.target.closest("[data-confirm-cancel]")) closeConfirm(false);
  });

  $("#modeSwitch").addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-mode]");
    if (!btn) return;
    if (state.timer.status === "running") {
      toast("Pause ou finalize antes de trocar o modo.");
      return;
    }
    if (state.timer.status === "paused" && state.timer.accumulatedSec > 0) {
      if (!(await askConfirm("Trocar de modo descarta o tempo atual não finalizado. Continuar?"))) return;
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

  $("#timerQuestions").addEventListener("input", () => syncQuizFields($("#timerQuestions"), $("#timerCorrect")));
  $("#manualQuestions").addEventListener("input", () => syncQuizFields($("#manualQuestions"), $("#manualCorrect")));

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
    if (submitSubjectForm()) renderAll();
  });

  $("#subjectCancel").addEventListener("click", resetSubjectForm);

  $("#subjectsList").addEventListener("click", async (e) => {
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
      if (!(await askConfirm(msg, { confirmLabel: "Excluir" }))) return;
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
    const quiz = readQuizInputs($("#manualQuestions"), $("#manualCorrect"));
    addSession({
      subjectId,
      start,
      seconds: minutes * 60,
      note: $("#manualNote").value.trim(),
      type: "manual",
      questions: quiz.questions,
      correct: quiz.correct,
    });
    $("#manualNote").value = "";
    $("#manualQuestions").value = "";
    syncQuizFields($("#manualQuestions"), $("#manualCorrect"));
    renderAll();
    toast("Sessão registrada.");
  });

  $("#historyFilter").addEventListener("change", renderHistory);

  $("#historyList").addEventListener("click", async (e) => {
    const editBtn = e.target.closest("[data-editsession]");
    if (editBtn) { openSessionEdit(editBtn.dataset.editsession); return; }
    const btn = e.target.closest("[data-delsession]");
    if (!btn) return;
    if (!(await askConfirm("Excluir esta sessão do histórico?", { confirmLabel: "Excluir" }))) return;
    state.sessions = state.sessions.filter((s) => s.id !== btn.dataset.delsession);
    save();
    renderAll();
    toast("Sessão excluída.");
  });

  $("#sessionEditForm").addEventListener("submit", (e) => {
    e.preventDefault();
    if (!saveSessionEdit()) return;
    closeSessionModal();
    renderAll();
    toast("Sessão atualizada.");
  });

  $("#sessionEditCancel").addEventListener("click", closeSessionModal);
  $("#sessionEditQuestions").addEventListener("input", () => syncQuizFields($("#sessionEditQuestions"), $("#sessionEditCorrect")));
  $("#sessionModal").addEventListener("click", (e) => {
    if (e.target.closest("[data-session-cancel]")) closeSessionModal();
  });

  $("#statsPeriod").addEventListener("change", renderStats);

  $("#setTheme").addEventListener("change", (e) => {
    state.settings.theme = sanitizeTheme(e.target.value);
    applyTheme();
    save();
  });

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

  $("#btnReset").addEventListener("click", async () => {
    if (!(await askConfirm("Apagar TODOS os dados (matérias, sessões e ajustes)? Esta ação não pode ser desfeita.", { confirmLabel: "Continuar" }))) return;
    if (!(await askConfirm("Tem certeza? Considere exportar um backup antes.", { confirmLabel: "Apagar tudo" }))) return;
    localStorage.removeItem(STORAGE_KEY);
    setState(defaultState());
    save();
    renderAll();
    renderSettings();
    toast("Todos os dados foram apagados.");
  });
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  const secure = location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1";
  if (!secure) return;
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

function init() {
  applyTheme();
  renderSettings();
  renderAll();
  bindEvents();
  switchTab(tabFromHash(), false);
  registerServiceWorker();

  if (window.matchMedia) {
    const media = window.matchMedia("(prefers-color-scheme: light)");
    if (media.addEventListener) media.addEventListener("change", () => {
      if (sanitizeTheme(state.settings.theme) === "auto") updateThemeColor();
    });
  }

  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  $("#manualStart").value = now.toISOString().slice(0, 16);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state.timer.status === "running") flushSave();
  });
  window.addEventListener("pagehide", () => {
    if (state.timer.status === "running") flushSave();
  });

  startTicker();
  save();
}

document.addEventListener("DOMContentLoaded", init);
