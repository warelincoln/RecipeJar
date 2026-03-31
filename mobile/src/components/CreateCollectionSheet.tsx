import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X } from "lucide-react-native";
import { getCollectionIcon } from "../features/collections/collectionIconRules";
import { LUCIDE } from "../theme/lucideSizes";
import { ApiError } from "../services/api";

export type CollectionSheetMode = "create" | "rename";

type Props = {
  visible: boolean;
  onClose: () => void;
  mode: CollectionSheetMode;
  /** Pre-filled when `mode === "rename"` */
  initialName?: string;
  onSubmit: (name: string) => void | Promise<void>;
};

export function CreateCollectionSheet({
  visible,
  onClose,
  mode,
  initialName = "",
  onSubmit,
}: Props) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (visible) {
      setName(mode === "rename" ? initialName : "");
      setSubmitting(false);
    }
  }, [visible, mode, initialName]);

  const trimmed = name.trim();
  const canSubmit = trimmed.length > 0 && !submitting;

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await onSubmit(trimmed);
      onClose();
    } catch (err) {
      let detail = "Something went wrong. Please try again.";
      if (err instanceof ApiError) {
        const m = err.message;
        if (
          err.status === 404 &&
          (/^Route\s+\w+:/i.test(m) || m.includes("Route PATCH"))
        ) {
          detail =
            "This phone is talking to an API that doesn’t support renaming folders yet. On your Mac, restart the RecipeJar server (npm run dev) so it loads the latest code. If you’re on a release build, the hosted API needs to be updated.";
        } else {
          detail = m || detail;
        }
      }
      Alert.alert(
        mode === "rename"
          ? "Could not rename folder"
          : "Could not create collection",
        detail,
      );
    } finally {
      setSubmitting(false);
    }
  }, [canSubmit, trimmed, onSubmit, onClose, mode]);

  const title = mode === "rename" ? "Rename folder" : "New collection";
  const subtitle =
    mode === "rename"
      ? "The folder icon updates based on keywords in the name—try “dessert,” “breakfast,” or anything that fits."
      : "Give it a name that fits how you think about recipes—maybe a cuisine, a cookbook, an author, a meal type, or a mood. There are no fixed rules; organize however you like.";
  const submitLabel = mode === "rename" ? "Save" : "Create collection";

  const preview = useMemo(() => {
    if (trimmed.length === 0) return null;
    const { Icon, color } = getCollectionIcon(trimmed);
    const label = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
    return { Icon, color, label };
  }, [trimmed]);

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
          accessibilityLabel={
            mode === "rename" ? "Dismiss rename folder sheet" : "Dismiss new collection sheet"
          }
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.keyboardWrap}
        >
          <View
            style={[
              styles.sheet,
              {
                paddingBottom: insets.bottom + 20,
                paddingHorizontal: 24,
              },
            ]}
          >
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={onClose}
              hitSlop={14}
              testID="create-collection-close"
              accessibilityRole="button"
              accessibilityLabel="Dismiss"
            >
              <X size={LUCIDE.lg} color="#6b7280" />
            </TouchableOpacity>

            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>{subtitle}</Text>

            <TextInput
              style={styles.input}
              placeholder={
                mode === "rename"
                  ? "Folder name"
                  : "e.g. Thai nights, Baking, Mom's classics…"
              }
              placeholderTextColor="#9ca3af"
              value={name}
              onChangeText={setName}
              autoCapitalize="sentences"
              autoCorrect
              returnKeyType="done"
              onSubmitEditing={handleSubmit}
              editable={!submitting}
              testID="create-collection-input"
              accessibilityLabel="Collection name"
            />

            {preview ? (
              <View style={styles.previewRow}>
                <View style={styles.previewIconWrap}>
                  {React.createElement(preview.Icon, {
                    size: LUCIDE.row,
                    color: preview.color,
                  })}
                </View>
                <Text style={styles.previewLabel} numberOfLines={2}>
                  {preview.label}
                </Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={[styles.primaryBtn, !canSubmit && styles.primaryBtnMuted]}
              onPress={handleSubmit}
              disabled={!canSubmit}
              testID="create-collection-submit"
              accessibilityRole="button"
              accessibilityLabel={submitLabel}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>{submitLabel}</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  keyboardWrap: {
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
    marginBottom: 10,
    textAlign: "center",
    paddingHorizontal: 36,
  },
  subtitle: {
    fontSize: 15,
    color: "#4b5563",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 20,
    paddingHorizontal: 4,
  },
  input: {
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: "#111827",
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  previewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  previewIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: "#f9fafb",
    alignItems: "center",
    justifyContent: "center",
  },
  previewLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    paddingTop: 2,
  },
  primaryBtn: {
    backgroundColor: "#16a34a",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
  },
  primaryBtnMuted: {
    opacity: 0.45,
  },
  primaryBtnText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "600",
  },
});
