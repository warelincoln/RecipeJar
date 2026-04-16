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
  /**
   * Strong tap for state-change moments — currently bulk-mode entry.
   * `impactMedium` is noticeably punchier than `impactLight` and is the
   * default haptic iOS itself uses when entering select/edit modes in
   * apps like Photos and Notes. Dropped from `impactLight` after user
   * feedback that the original was too subtle to feel on-device.
   */
  tap(): void {
    safeTrigger(HapticFeedbackTypes.impactMedium);
  },
  /**
   * Lighter tap for high-frequency actions — bulk selection toggle.
   * Bumped from `selection` (which is near-imperceptible in normal use)
   * to `impactLight` so each checkmark tap has clear physical feedback.
   */
  toggle(): void {
    safeTrigger(HapticFeedbackTypes.impactLight);
  },
};
