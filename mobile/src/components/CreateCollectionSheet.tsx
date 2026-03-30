import React, { useEffect, useState, useCallback } from "react";
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

type Props = {
  visible: boolean;
  onClose: () => void;
  onCreate: (name: string) => void | Promise<void>;
};

export function CreateCollectionSheet({
  visible,
  onClose,
  onCreate,
}: Props) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (visible) {
      setName("");
      setSubmitting(false);
    }
  }, [visible]);

  const trimmed = name.trim();
  const canSubmit = trimmed.length > 0 && !submitting;

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await onCreate(trimmed);
      onClose();
    } catch {
      Alert.alert(
        "Could not create collection",
        "Something went wrong. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }, [canSubmit, trimmed, onCreate, onClose]);

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
          accessibilityLabel="Dismiss new collection sheet"
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
            <X size={24} color="#6b7280" />
          </TouchableOpacity>

          <Text style={styles.title}>New collection</Text>
          <Text style={styles.subtitle}>
            Give it a name that fits how you think about recipes—maybe a
            cuisine, a cookbook, an author, a meal type, or a mood. There are
            no fixed rules; organize however you like.
          </Text>

          <TextInput
            style={styles.input}
            placeholder="e.g. Thai nights, Baking, Mom's classics…"
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

          <TouchableOpacity
            style={[styles.primaryBtn, !canSubmit && styles.primaryBtnMuted]}
            onPress={handleSubmit}
            disabled={!canSubmit}
            testID="create-collection-submit"
            accessibilityRole="button"
            accessibilityLabel="Create collection"
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>Create collection</Text>
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
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
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
