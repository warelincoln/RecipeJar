import React from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X } from "lucide-react-native";
import { LUCIDE } from "../theme/lucideSizes";
import Clipboard from "@react-native-clipboard/clipboard";
import { parseClipboardForHttpsUrl } from "../features/import/webImportUrl";

type Props = {
  visible: boolean;
  onClose: () => void;
  onPasteUrl: (url: string) => void;
};

export function ClipboardRecipePrompt({
  visible,
  onClose,
  onPasteUrl,
}: Props) {
  const insets = useSafeAreaInsets();

  const handlePaste = async () => {
    try {
      const text = await Clipboard.getString();
      const url = parseClipboardForHttpsUrl(text);
      if (!url) {
        Alert.alert(
          "No recipe link found",
          "Copy a recipe URL (https://…) to the clipboard, then tap Paste.",
        );
        return;
      }
      onPasteUrl(url);
      onClose();
    } catch {
      Alert.alert("Clipboard", "Could not read the clipboard.");
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalRoot}>
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={onClose}
          accessibilityLabel="Dismiss clipboard prompt backdrop"
        />
        <View
          style={[
            styles.sheet,
            { paddingBottom: insets.bottom + 20, paddingHorizontal: 24 },
          ]}
        >
        <TouchableOpacity
          style={styles.closeBtn}
          onPress={onClose}
          hitSlop={14}
          testID="clipboard-recipe-prompt-close"
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
        >
          <X size={LUCIDE.lg} color="#6b7280" />
        </TouchableOpacity>
        <Text style={styles.title}>Save your recipe</Text>
        <Text style={styles.subtitle}>
          Have a recipe link copied? Paste it to open it in the in-app browser.
        </Text>
        <TouchableOpacity
          style={styles.pasteBtn}
          onPress={handlePaste}
          testID="clipboard-recipe-prompt-paste"
          accessibilityRole="button"
          accessibilityLabel="Paste recipe link"
        >
          <Text style={styles.pasteBtnText}>Paste</Text>
        </TouchableOpacity>
        {Platform.OS === "ios" ? (
          <Text style={styles.hint}>
            Paste reads the clipboard after you confirm here (iOS may ask for
            permission).
          </Text>
        ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  sheet: {
    backgroundColor: "#eff6ff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 36,
    alignItems: "center",
    maxHeight: "55%",
  },
  closeBtn: {
    position: "absolute",
    right: 12,
    top: 12,
    zIndex: 2,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    color: "#6b7280",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 20,
    paddingHorizontal: 8,
  },
  pasteBtn: {
    backgroundColor: "#7c3aed",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 48,
    minWidth: 200,
    alignItems: "center",
  },
  pasteBtnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  hint: {
    marginTop: 14,
    fontSize: 12,
    color: "#9ca3af",
    textAlign: "center",
    paddingHorizontal: 16,
  },
});
