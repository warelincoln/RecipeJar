import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Link } from "lucide-react-native";
import { LUCIDE } from "../../theme/lucideSizes";

interface UrlInputViewProps {
  onSubmit: (url: string) => void;
  onCancel: () => void;
}

export function UrlInputView({ onSubmit, onCancel }: UrlInputViewProps) {
  const insets = useSafeAreaInsets();
  const [url, setUrl] = useState("");

  const isValid = url.trim().length > 0 && url.trim().startsWith("http");

  const handleSubmit = () => {
    Keyboard.dismiss();
    onSubmit(url.trim());
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top + 8 }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      testID="url-input-screen"
    >
      <TouchableOpacity
        style={styles.cancelButton}
        onPress={onCancel}
        testID="url-input-cancel"
        accessibilityRole="button"
        accessibilityLabel="url-input-cancel"
      >
        <Text style={styles.cancelText}>Cancel</Text>
      </TouchableOpacity>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        bounces={false}
      >
        <Link size={LUCIDE.landing} color="#7c3aed" style={styles.icon} />
        <Text style={styles.title}>Import from URL</Text>
        <Text style={styles.subtitle}>
          Paste a recipe URL below. Works best with sites that use structured
          recipe data (e.g. BBC Good Food, WordPress recipe blogs).
        </Text>

        <TextInput
          style={[styles.input, !isValid && url.length > 0 && styles.inputError]}
          value={url}
          onChangeText={setUrl}
          placeholder="https://www.example.com/recipe"
          placeholderTextColor="#9ca3af"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="go"
          onSubmitEditing={isValid ? handleSubmit : undefined}
          testID="url-input-field"
        />

        {!isValid && url.length > 0 && (
          <Text style={styles.hint}>Enter a valid URL starting with http:// or https://</Text>
        )}

        <TouchableOpacity
          style={[styles.submitButton, !isValid && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={!isValid}
          testID="url-input-submit"
          accessibilityRole="button"
          accessibilityLabel="url-input-submit"
        >
          <Text style={styles.submitText}>Import Recipe</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", paddingHorizontal: 24 },
  cancelButton: { alignSelf: "flex-start", paddingVertical: 8 },
  cancelText: { fontSize: 16, color: "#6b7280" },
  content: { flexGrow: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 16, paddingBottom: 24 },
  icon: { marginBottom: 20 },
  title: { fontSize: 24, fontWeight: "700", marginBottom: 8, marginTop: 2 },
  subtitle: {
    fontSize: 14, color: "#6b7280",
    textAlign: "center", lineHeight: 20, marginBottom: 24,
  },
  input: {
    width: "100%", borderWidth: 1, borderColor: "#d1d5db", borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 14, fontSize: 16,
    backgroundColor: "#f9fafb",
  },
  inputError: { borderColor: "#ef4444" },
  hint: { color: "#ef4444", fontSize: 12, marginTop: 6, alignSelf: "flex-start" },
  submitButton: {
    width: "100%", backgroundColor: "#7c3aed",
    paddingVertical: 14, borderRadius: 12, alignItems: "center", marginTop: 20,
  },
  submitButtonDisabled: { backgroundColor: "#9ca3af" },
  submitText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
