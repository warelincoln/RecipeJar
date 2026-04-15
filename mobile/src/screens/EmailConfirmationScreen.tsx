import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Mail } from "lucide-react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { supabase } from "../services/supabase";
import { AUTH_REDIRECT_URL } from "../services/authRedirect";
import {
  PRIMARY,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  ERROR,
  WHITE,
} from "../theme/colors";

type Props = NativeStackScreenProps<any, "EmailConfirmation">;

export function EmailConfirmationScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const email = route.params?.email ?? "";
  const [resendLoading, setResendLoading] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);

  const onResend = useCallback(async () => {
    const trimmed = email.trim();
    if (!trimmed) {
      setResendError("Missing email address.");
      return;
    }
    setResendError(null);
    setResendLoading(true);
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: trimmed,
        options: { emailRedirectTo: AUTH_REDIRECT_URL },
      });
      if (error) throw error;
    } catch (e) {
      setResendError(e instanceof Error ? e.message : "Could not resend email.");
    } finally {
      setResendLoading(false);
    }
  }, [email]);

  return (
    <View
      style={[
        styles.root,
        {
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
          paddingHorizontal: 24,
        },
      ]}
    >
      <View style={styles.center}>
        <Mail size={64} color={PRIMARY} style={styles.icon} />
        <Text style={styles.title}>Check your inbox</Text>
        <Text style={styles.subtitle}>
          We sent a confirmation link to{" "}
          <Text style={styles.emailBold}>{email || "your email"}</Text>
        </Text>

        {resendError ? <Text style={styles.error}>{resendError}</Text> : null}

        <TouchableOpacity
          style={[styles.outlineBtn, resendLoading && styles.outlineBtnDisabled]}
          onPress={onResend}
          disabled={resendLoading}
          accessibilityRole="button"
          accessibilityLabel="Resend email"
        >
          {resendLoading ? (
            <ActivityIndicator color={PRIMARY} />
          ) : (
            <Text style={styles.outlineBtnText}>Resend email</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => navigation.navigate("Auth" as never)}
          style={styles.secondaryWrap}
          accessibilityRole="button"
          accessibilityLabel="Back to sign in"
        >
          <Text style={styles.secondaryText}>Back to sign in</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: WHITE,
    justifyContent: "center",
  },
  center: {
    alignItems: "center",
    width: "100%",
  },
  icon: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: TEXT_PRIMARY,
    textAlign: "center",
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 15,
    color: TEXT_SECONDARY,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 28,
    paddingHorizontal: 8,
  },
  emailBold: {
    fontWeight: "700",
    color: TEXT_PRIMARY,
  },
  error: {
    color: ERROR,
    fontSize: 14,
    textAlign: "center",
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  outlineBtn: {
    width: "100%",
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: PRIMARY,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  outlineBtnDisabled: {
    opacity: 0.7,
  },
  outlineBtnText: {
    color: PRIMARY,
    fontWeight: "600",
    fontSize: 16,
  },
  secondaryWrap: {
    marginTop: 20,
    paddingVertical: 8,
  },
  secondaryText: {
    color: TEXT_SECONDARY,
    fontWeight: "600",
    fontSize: 15,
  },
});
