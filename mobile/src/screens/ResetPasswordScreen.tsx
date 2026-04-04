import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Eye, EyeOff } from "lucide-react-native";
import { supabase } from "../services/supabase";
import { useAuthStore } from "../stores/auth.store";

export function ResetPasswordScreen() {
  const insets = useSafeAreaInsets();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = useCallback(async () => {
    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (updateError) throw updateError;
      useAuthStore.getState().setPendingPasswordReset(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }, [newPassword, confirmPassword]);

  return (
    <View
      style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.title}>Set new password</Text>
          <Text style={styles.subtitle}>Enter your new password below.</Text>

          <View style={styles.fieldWrap}>
            <TextInput
              style={[styles.input, styles.inputWithIcon]}
              value={newPassword}
              onChangeText={(t) => {
                setNewPassword(t);
                if (error) setError(null);
              }}
              placeholder="New password"
              placeholderTextColor="#9ca3af"
              secureTextEntry={!showNew}
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="newPassword"
              autoComplete="password-new"
              editable={!loading}
            />
            <TouchableOpacity
              style={styles.eyeBtn}
              onPress={() => setShowNew((s) => !s)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={showNew ? "Hide password" : "Show password"}
            >
              {showNew ? (
                <EyeOff size={22} color="#6b7280" />
              ) : (
                <Eye size={22} color="#6b7280" />
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.fieldWrap}>
            <TextInput
              style={[styles.input, styles.inputWithIcon]}
              value={confirmPassword}
              onChangeText={(t) => {
                setConfirmPassword(t);
                if (error) setError(null);
              }}
              placeholder="Confirm password"
              placeholderTextColor="#9ca3af"
              secureTextEntry={!showConfirm}
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="newPassword"
              autoComplete="password-new"
              editable={!loading}
            />
            <TouchableOpacity
              style={styles.eyeBtn}
              onPress={() => setShowConfirm((s) => !s)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={showConfirm ? "Hide password" : "Show password"}
            >
              {showConfirm ? (
                <EyeOff size={22} color="#6b7280" />
              ) : (
                <Eye size={22} color="#6b7280" />
              )}
            </TouchableOpacity>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.primaryBtn, loading && styles.primaryBtnDisabled]}
            onPress={onSubmit}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel="Update password"
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>Update Password</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fff" },
  flex: { flex: 1 },
  scroll: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#111827",
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: "#6b7280",
    textAlign: "center",
    marginBottom: 24,
  },
  fieldWrap: {
    position: "relative",
    marginBottom: 12,
  },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
    color: "#111827",
  },
  inputWithIcon: {
    paddingRight: 48,
  },
  eyeBtn: {
    position: "absolute",
    right: 12,
    top: 0,
    bottom: 0,
    justifyContent: "center",
  },
  error: {
    color: "#dc2626",
    fontSize: 14,
    marginBottom: 12,
  },
  primaryBtn: {
    backgroundColor: "#2563eb",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    marginTop: 8,
  },
  primaryBtnDisabled: {
    opacity: 0.7,
  },
  primaryBtnText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 16,
  },
});
