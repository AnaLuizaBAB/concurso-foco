import { $, $$ } from "./utils.js";

let toastTimer = null;
export function toast(msg) {
  const el = $("#toast");
  el.hidden = false;
  el.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2800);
}

export function beep() {
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

export function notify(title, body) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  if (!document.hidden) return;
  try { new Notification(title, { body }); } catch (e) { /* ignora */ }
}

export function requestNotifyPermission() {
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission().catch(() => {});
  }
}

let confirmResolve = null;
let confirmPrevFocus = null;

export function askConfirm(msg, opts = {}) {
  return new Promise((resolve) => {
    if (confirmResolve) { confirmResolve(false); confirmResolve = null; }
    confirmResolve = resolve;
    confirmPrevFocus = document.activeElement;
    $("#confirmTitle").textContent = opts.title || "Confirmar";
    $("#confirmMessage").textContent = msg;
    $("#confirmOk").textContent = opts.confirmLabel || "Confirmar";
    $("#confirmCancel").textContent = opts.cancelLabel || "Cancelar";
    $("#confirmModal").hidden = false;
    $("#confirmOk").focus();
  });
}

export function closeConfirm(result) {
  const modal = $("#confirmModal");
  if (modal.hidden && !confirmResolve) return;
  modal.hidden = true;
  const resolve = confirmResolve;
  confirmResolve = null;
  if (confirmPrevFocus && typeof confirmPrevFocus.focus === "function") confirmPrevFocus.focus();
  confirmPrevFocus = null;
  if (resolve) resolve(result);
}

let dialogPrevFocus = null;

export function openDialog(modal, focusEl) {
  dialogPrevFocus = document.activeElement;
  modal.hidden = false;
  (focusEl || modal).focus();
}

export function closeDialog(modal) {
  modal.hidden = true;
  if (dialogPrevFocus && typeof dialogPrevFocus.focus === "function") dialogPrevFocus.focus();
  dialogPrevFocus = null;
}

function modalFocusables(modal) {
  return $$("button, [href], input, select, textarea, [tabindex]", modal).filter(
    (el) => !el.disabled && el.tabIndex !== -1 && (el.offsetParent !== null || el === document.activeElement)
  );
}

const modalCloseHandlers = new Map();

export function registerModalClose(modalId, handler) {
  modalCloseHandlers.set(modalId, handler);
}

export function modalKeydown(e) {
  const modal = $$(".modal").find((m) => !m.hidden);
  if (!modal) return;
  if (e.key === "Escape") {
    const close = modalCloseHandlers.get(modal.id);
    if (!close) return;
    e.preventDefault();
    close();
    return;
  }
  if (e.key === "Enter" && modal.id === "confirmModal") {
    if (document.activeElement === $("#confirmCancel")) return;
    e.preventDefault();
    closeConfirm(true);
    return;
  }
  if (e.key === "Tab") {
    const items = modalFocusables(modal);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
}
