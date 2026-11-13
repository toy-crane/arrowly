/** shortcuts 도메인 공개 API — 외부에서는 이 배럴로만 import한다. */
export { acceleratorSymbols, buildAccelerator, matchesAccelerator } from "./accelerator";
export {
  anyGestureModifierHeld,
  colorKeyPressed,
  controlSymbols,
  DEFAULT_CONTROLS,
  isGestureModifier,
  isGestureModifierKey,
  isModifierName,
  modifierSymbol,
  roleKeysOf,
  sizeStepOf,
  updateControls,
} from "./controls";
export type {
  ControlError,
  ControlId,
  Controls,
  GestureModifier,
  ModifierName,
  RoleKeys,
} from "./controls";
export { LockIcon, SettingsGroup, SettingsRow, ShortcutEditor, styles } from "./shortcut-editor";
