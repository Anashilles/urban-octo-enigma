/**
 * Shared, mutable input state for the 3D world. Written by DOM listeners and
 * the touch controls, read every frame by the player controller. Deliberately
 * outside React so movement never triggers re-renders.
 */
export interface InputState {
  keys: Set<string>;
  /** Accumulated look delta in pixels since the last frame. */
  lookX: number;
  lookY: number;
  /** Virtual joystick vector, x = strafe (right +), y = forward (+). Range −1…1. */
  joyX: number;
  joyY: number;
  sprintToggle: boolean;
  /** False while dialogs, panels or text fields have focus. */
  enabled: boolean;
  pointerLocked: boolean;
  /** One-shot actions consumed by the scene. */
  interactRequested: boolean;
}

export const input: InputState = {
  keys: new Set(),
  lookX: 0,
  lookY: 0,
  joyX: 0,
  joyY: 0,
  sprintToggle: false,
  enabled: true,
  pointerLocked: false,
  interactRequested: false,
};

export const MOVEMENT_CODES = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ShiftLeft",
  "ShiftRight",
]);

/** True when keyboard focus is in something that consumes typing. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") {
    const type = (target as HTMLInputElement).type;
    return !["button", "checkbox", "radio", "range", "submit", "reset"].includes(type);
  }
  return target.getAttribute("role") === "textbox";
}

/** Clears held keys and joystick (e.g. when a dialog opens) so the player stops. */
export function resetMovementInput() {
  input.keys.clear();
  input.joyX = 0;
  input.joyY = 0;
  input.lookX = 0;
  input.lookY = 0;
}

export function setInputEnabled(enabled: boolean) {
  if (input.enabled === enabled) return;
  input.enabled = enabled;
  if (!enabled) resetMovementInput();
}
