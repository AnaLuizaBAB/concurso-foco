import { $, esc, formatDuration, uid } from "../utils.js";
import { state, save, getSubject, sessionsInRange, sumSec } from "../storage.js";
import { startOfWeek } from "../dates.js";
import { toast } from "../ui.js";

let editingSubjectId = null;

export function subjectOptionsHtml() {
  return state.subjects.map((s) => '<option value="' + s.id + '">' + esc(s.name) + "</option>").join("") ||
    '<option value="">Nenhuma matéria</option>';
}

export function renderSubjectOptions() {
  const opts = subjectOptionsHtml();
  const timerSel = $("#timerSubject");
  const keepTimer = state.timer.subjectId || timerSel.value;
  timerSel.innerHTML = opts;
  if (keepTimer && getSubject(keepTimer)) timerSel.value = keepTimer;

  const manualSel = $("#manualSubject");
  const keepManual = manualSel.value;
  manualSel.innerHTML = opts;
  if (keepManual && getSubject(keepManual)) manualSel.value = keepManual;

  const filterSel = $("#historyFilter");
  const keepFilter = filterSel.value || "all";
  filterSel.innerHTML = '<option value="all">Todas as matérias</option>' +
    state.subjects.map((s) => '<option value="' + s.id + '">' + esc(s.name) + "</option>").join("");
  filterSel.value = getSubject(keepFilter) || keepFilter === "all" ? keepFilter : "all";
}

export function renderSubjects() {
  const wrap = $("#subjectsList");
  if (!state.subjects.length) {
    wrap.innerHTML = '<p class="empty-state">Nenhuma matéria cadastrada.</p>';
    return;
  }
  const weekStart = startOfWeek(Date.now());
  wrap.innerHTML = state.subjects.map((s) => {
    const weekSec = sumSec(sessionsInRange(weekStart, weekStart + 7 * 86400000).filter((x) => x.subjectId === s.id));
    const totalSec = sumSec(state.sessions.filter((x) => x.subjectId === s.id));
    const goalMeta = s.weeklyGoalMin ? "<span>Meta: " + formatDuration(s.weeklyGoalMin * 60) + "</span>" : "";
    return (
      '<div class="subject-item" style="border-left-color:' + esc(s.color) + '">' +
        '<div class="name"><span class="dot" style="background:' + esc(s.color) + '"></span>' + esc(s.name) + "</div>" +
        '<div class="meta"><span>Peso: ' + s.weight + "</span><span>Semana: " + formatDuration(weekSec) + "</span><span>Total: " + formatDuration(totalSec) + "</span>" + goalMeta + "</div>" +
        '<div class="actions">' +
          '<button class="btn small" data-edit="' + s.id + '">Editar</button>' +
          '<button class="btn small danger" data-del="' + s.id + '">Excluir</button>' +
        "</div>" +
      "</div>"
    );
  }).join("");
}

export function resetSubjectForm() {
  editingSubjectId = null;
  $("#subjectFormTitle").textContent = "Adicionar matéria";
  $("#subjectSubmit").textContent = "Adicionar";
  $("#subjectCancel").hidden = true;
  $("#subjectName").value = "";
  $("#subjectColor").value = "#4f8ef7";
  $("#subjectWeight").value = "1";
  $("#subjectGoal").value = "";
}

export function startEditSubject(id) {
  const s = getSubject(id);
  if (!s) return;
  editingSubjectId = id;
  $("#subjectFormTitle").textContent = "Editar matéria";
  $("#subjectSubmit").textContent = "Salvar alterações";
  $("#subjectCancel").hidden = false;
  $("#subjectName").value = s.name;
  $("#subjectColor").value = s.color;
  $("#subjectWeight").value = s.weight;
  $("#subjectGoal").value = s.weeklyGoalMin != null ? s.weeklyGoalMin : "";
  $("#subjectName").focus();
}

export function submitSubjectForm() {
  const name = $("#subjectName").value.trim();
  if (!name) return false;
  const color = $("#subjectColor").value;
  const weight = Math.max(0.5, Number($("#subjectWeight").value) || 1);
  const goalRaw = Number($("#subjectGoal").value);
  const weeklyGoalMin = Number.isFinite(goalRaw) && goalRaw > 0 ? Math.round(goalRaw) : null;
  if (editingSubjectId) {
    const s = getSubject(editingSubjectId);
    if (s) {
      s.name = name;
      s.color = color;
      s.weight = weight;
      s.weeklyGoalMin = weeklyGoalMin;
    }
    toast("Matéria atualizada.");
  } else {
    state.subjects.push({ id: uid(), name, color, weight, weeklyGoalMin });
    toast("Matéria adicionada.");
  }
  save();
  resetSubjectForm();
  return true;
}
