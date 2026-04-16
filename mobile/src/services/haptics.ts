import ReactNativeHapticFeedback, {
  HapticFeedbackTypes,
} from "react-native-haptic-feedback";

/**
 * Thin wrapper around react-native-haptic-feedback so the rest of the app
 * can call `haptics.tap()` / `haptics.toggle()` without each call site
 * having to remember the right method + options.
 *
 * Options `ignoreAndroidSystemSettings: false` means Android users who
 * disable haptics in system settings won't feel taps. iOS honors its own
 * haptic settings regardless.
 *
 * All methods are fire-and-forget — if the native module is unavailable
 * (e.g. Metro is running but the native binary hasn't rebuilt yet), we
 * swallow the error silently rather than crash the UI.
 */

const DEFAULT_OPTIONS = {
  enableVibrateFallback: false,
  ignoreAndroidSystemSettings: false,
};

function safeTrigger(type: HapticFeedbackTypes) {
  try {
    ReactNativeHapticFeedback.trigger(type, DEFAULT_OPTIONS);
  } catch {
    // Haptics are polish, not functional. Never propagate.
  }
}

export const haptics = {
  /** Light tap — used for bulk-mode entry. */
  tap(): void {
    safeTrigger(HapticFeedbackTypes.impactLight);
  },
  /** Medium tap — used for selection toggle in bulk mode. */
  toggle(): void {
    safeTrigger(HapticFeedbackTypes.selection);
  },
};
