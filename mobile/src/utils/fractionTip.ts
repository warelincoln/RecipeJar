import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * First-parse-with-fractions UX nudge. We show a single banner on the
 * preview screen the first time a user sees a parsed recipe that contains
 * any fractional ingredient amount, reminding them to double-check
 * fractions before cooking. Then we never show it again.
 *
 * Version the key so a future UX change (e.g. replacing the inline banner
 * with a first-run onboarding step) can force the tip to re-trigger
 * without colliding with users who already dismissed v1.
 */
const FRACTION_TIP_KEY = "fraction_verification_tip_seen_v1";

export async function hasSeenFractionTip(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(FRACTION_TIP_KEY);
    return value === "true";
  } catch {
    // Storage read failed — fall back to "seen" so we don't repeatedly
    // show the tip to a user whose device storage is wonky.
    return true;
  }
}

export async function markFractionTipSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(FRACTION_TIP_KEY, "true");
  } catch {
    // Storage write failed — user may see the tip again on next parse.
    // Acceptable degradation; the tip itself isn't harmful to see twice.
  }
}
