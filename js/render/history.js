import { $, esc, pad, formatDuration, toInputDateTime, readQuizInputs, syncQuizFields } from "../utils.js";
import { state, save, getSubject, subjectName, subjectColor, sumSec } from "../storage.js";
import { dayKey, relDayLabel } from "../dates.js";
import { toast, openDialog, closeDialog } from "../ui.js";
import { subjectOptionsHtml } from "./subjects.js";

let editingSessionId = null;

export function openSessionEdit(id) {
  const s = state.sessions.find((x) => x.id === id);
  if (!s) return;
  editingSessionId = id;
  const sel = $("#sessionEditSubject");
  sel.innerHTML = subjectOptionsHtml();
  if (s.subjectId && !getSubject(s.subjectId)) {
    const opt = document.createElement("option");
    opt.value = s.subjectId;
    opt.textContent = "Matéria removida";
    sel.appendChild(opt);
  }
  sel.value = s.subjectId;
  $("#sessionEditStart").value = toInputDateTime(s.start);
  $("#sessionEditMinutes").value = Math.max(1, Math.round(s.seconds / 60));
  $("#sessionEditNote").value = s.note || "";
  $("#sessionEditQuestions").value = s.questions != null ? s.questions : "";
  $("#sessionEditCorrect").value = s.correct != null ? s.correct : "";
  syncQuizFields($("#sessionEditQuestions"), $("#sessionEditCorrect"));
  openDialog($("#sessionModal"), $("#sessionEditStart"));
}

export function closeSessionModal() {
  editingSessionId = null;
  closeDialog($("#sessionModal"));
}

export function saveSessionEdit() {
  const s = state.sessions.find((x) => x.id === editingSessionId);
  if (!s) return false;
  const start = new Date($("#sessionEditStart").value).getTime();
  const minutes = Number($("#sessionEditMinutes").value);
  const subjectId = $("#sessionEditSubject").value;
  if (!start || !minutes || minutes < 1 || !subjectId) { toast("Preencha todos os campos."); return false; }
  const quiz = readQuizInputs($("#sessionEditQuestions"), $("#sessionEditCorrect"));
  s.start = start;
  s.seconds = Math.max(1, Math.round(minutes * 60));
  s.subjectId = subjectId;
  s.note = $("#sessionEditNote").value.trim().slice(0, 120);
  s.questions = quiz.questions;
  s.correct = quiz.correct;
  save();
  return true;
}

export function renderHistory() {
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
      "<h4>" + relDayLabel(sessions[0].start) + " · " + formatDuration(dayTotal) + "</h4>";
    const rows = sessions.map((s) => {
      const d = new Date(s.start);
      const quiz = s.questions != null
        ? '<span class="session-quiz">' + s.questions + " questão" + (s.questions === 1 ? "" : "s") +
          (s.correct != null ? " · " + Math.round((s.correct / s.questions) * 100) + "% acerto" : "") + "</span>"
        : "";
      return (
        '<div class="session-row">' +
          '<span class="time-val">' + pad(d.getHours()) + ":" + pad(d.getMinutes()) + "</span>" +
          '<span class="dot" style="background:' + esc(subjectColor(s.subjectId)) + '"></span>' +
          "<span>" + esc(subjectName(s.subjectId)) + "</span>" +
          '<span class="session-note">' + esc(s.note || (s.type === "pomodoro" ? "Pomodoro" : s.type === "manual" ? "Manual" : "")) + "</span>" +
          quiz +
          '<span class="spacer"></span>' +
          '<span class="time-val">' + formatDuration(s.seconds) + "</span>" +
          '<button class="btn small" data-editsession="' + s.id + '">Editar</button>' +
          '<button class="btn small danger" data-delsession="' + s.id + '">Excluir</button>' +
        "</div>"
      );
    }).join("");
    return '<div class="day-group" data-day="' + key + '">' + header + rows + "</div>";
  }).join("");
}
