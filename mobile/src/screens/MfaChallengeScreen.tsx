import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Shield } from "lucide-react-native";
import { supabase } from "../services/supabase";
import { useAuthStore } from "../stores/auth.store";

export function MfaChallengeScreen() {
  const insets = useSafeAreaInsets();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { signOut } = useAuthStore();

  async function handleVerify() {
    if (code.trim().length !== 6) {
      setError("Please enter a 6-digit code");
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const totp = factors?.totp?.[0];
      if (!totp) {
        setError("No TOTP factor found. Please sign out and try again.");
        setLoading(false);
        return;
      }

      const { data: challenge, error: challengeErr } =
        await supabase.auth.mfa.challenge({ factorId: totp.id });
      if (challengeErr || !challenge) {
        setError(challengeErr?.message ?? "Failed to create MFA challenge");
        setLoading(false);
        return;
      }

      const { error: verifyErr } = await supabase.auth.mfa.verify({
        factorId: totp.id,
        challengeId: challenge.id,
        code: code.trim(),
      });

      if (verifyErr) {
        setError(verifyErr.message);
      }
    } catch {
      setError("Verification failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Shield size={48} color="#2563eb" />
        </View>

        <Text style={styles.title}>Two-Factor Authentication</Text>
        <Text style={styles.subtitle}>
          Enter the 6-digit code from your authenticator app
        </Text>

        <TextInput
          style={styles.codeInput}
          value={code}
          onChangeText={(text) => setCode(text.replace(/\D/g, "").slice(0, 6))}
          placeholder="000000"
          placeholderTextColor="#d1d5db"
          keyboardType="number-pad"
          maxLength={6}
          autoFocus
          textAlign="center"
        />

        {error && <Text style={styles.error}>{error}</Text>}

        <TouchableOpacity
          style={[styles.verifyBtn, loading && styles.verifyBtnDisabled]}
          onPress={handleVerify}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.verifyBtnText}>Verify</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.cancelBtn} onPress={() => signOut()}>
          <Text style={styles.cancelText}>Sign out instead</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#fff",
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#eff6ff",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: "#6b7280",
    textAlign: "center",
    marginBottom: 32,
  },
  codeInput: {
    width: "100%",
    borderWidth: 2,
    borderColor: "#d1d5db",
    borderRadius: 12,
    paddingVertical: 16,
    fontSize: 32,
    fontWeight: "700",
    color: "#111827",
    letterSpacing: 12,
  },
  error: {
    color: "#dc2626",
    fontSize: 13,
    marginTop: 12,
  },
  verifyBtn: {
    backgroundColor: "#2563eb",
    borderRadius: 12,
    paddingVertical: 16,
    width: "100%",
    alignItems: "center",
    marginTop: 24,
  },
  verifyBtnDisabled: {
    opacity: 0.85,
  },
  verifyBtnText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 16,
  },
  cancelBtn: {
    marginTop: 16,
    paddingVertical: 8,
  },
  cancelText: {
    color: "#6b7280",
    fontSize: 14,
    fontWeight: "600",
  },
});
