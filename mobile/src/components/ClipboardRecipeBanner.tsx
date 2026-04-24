import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { X, Link2 } from "lucide-react-native";
import {
  PRIMARY,
  PRIMARY_LIGHT,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  WHITE,
} from "../theme/colors";

/** Compact-banner icons — smaller than the LUCIDE scale (min: 24) which is
 *  sized for tappable actions. These sit inside a 28px chip / X tap target. */
const BANNER_ICON_SIZE = 16;

interface Props {
  /** Fired when the user taps the row or the Paste pill. The parent reads
   *  the clipboard at THIS moment (not earlier on focus) so iOS's paste
   *  permission prompt only appears after the user explicitly confirms
   *  they want to paste. Keeping the read out of this component is the
   *  whole point of the design — we never want to trigger the iOS dialog
   *  just to render UI. */
  onPasteTap: () => void;
  /** Fired on X tap. Parent marks this foreground-session as "already
   *  acted on" so the banner won't reappear until the app backgrounds
   *  and returns. */
  onDismiss: () => void;
}

/**
 * Compact inline banner that appears on Home when the clipboard holds a URL.
 * Pure presentation — NO clipboard access of any kind. iOS's paste
 * permission prompt fires on read; we want it to fire only when the user
 * actively taps to paste, not just because the banner rendered.
 *
 * Presence detection (hasURL / hasString) happens in HomeScreen and does
 * NOT trigger the prompt. Reading the actual URL happens in HomeScreen's
 * paste handler, only AFTER the user taps. That handler is passed in here
 * as `onPasteTap`.
 *
 * Because we can't read the URL before the user taps, we can't show a
 * hostname preview — the banner copy is intentionally generic ("Paste
 * recipe link from clipboard"). The trade-off vs. showing the host:
 *   win: no iOS paste prompt on every Home focus
 *   lose: user doesn't see the domain until after they tap
 * Users strongly preferred the former after the first cut shipped — the
 * iOS "{App} pasted from …" dialog on every focus was noisier than
 * having a less-informative banner.
 */
export function ClipboardRecipeBanner({ onPasteTap, onDismiss }: Props) {
  return (
    <View style={styles.container} testID="clipboard-recipe-banner">
      <TouchableOpacity
        style={styles.row}
        onPress={onPasteTap}
        accessibilityRole="button"
        accessibilityLabel="Paste recipe link from clipboard"
        testID="clipboard-recipe-banner-row"
      >
        <View style={styles.iconWrap}>
          <Link2 size={BANNER_ICON_SIZE} color={PRIMARY} strokeWidth={2} />
        </View>
        <View style={styles.textWrap}>
          <Text style={styles.title} numberOfLines={1}>
            Paste recipe link
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            From your clipboard
          </Text>
        </View>
        <View style={styles.pasteButton} pointerEvents="none">
          <Text style={styles.pasteButtonText}>Paste</Text>
        </View>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.dismissButton}
        onPress={onDismiss}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Dismiss paste suggestion"
        testID="clipboard-recipe-banner-dismiss"
      >
        <X size={BANNER_ICON_SIZE} color={TEXT_SECONDARY} strokeWidth={2} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: PRIMARY_LIGHT,
    borderRadius: 10,
    paddingVertical: 8,
    paddingLeft: 10,
    paddingRight: 6,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 10,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: WHITE,
  },
  textWrap: {
    flex: 1,
    flexDirection: "column",
  },
  title: {
    fontSize: 13,
    fontWeight: "600",
    color: TEXT_PRIMARY,
  },
  subtitle: {
    fontSize: 11,
    color: TEXT_SECONDARY,
    marginTop: 1,
  },
  pasteButton: {
    backgroundColor: PRIMARY,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  pasteButtonText: {
    color: WHITE,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  dismissButton: {
    marginLeft: 4,
    padding: 6,
  },
});
