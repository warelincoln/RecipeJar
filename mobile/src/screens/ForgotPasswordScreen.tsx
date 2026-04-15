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
import { ChevronLeft } from "lucide-react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { supabase } from "../services/supabase";
import { AUTH_REDIRECT_URL } from "../services/authRedirect";
import {
  PRIMARY,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  DIVIDER,
  ERROR,
  WHITE,
} from "../theme/colors";

type Props = NativeStackScreenProps<any, "ForgotPassword">;

export function ForgotPasswordScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const onSubmit = useCallback(async () => {
    const trimmed = email.trim();
    if (!trimmed) {
      setError("Enter your email address.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        trimmed,
        { redirectTo: AUTH_REDIRECT_URL },
      );
      if (resetError) {
        setError(resetError.message);
      } else {
        setSent(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }, [email]);

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
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={styles.backBtn}
          >
            <ChevronLeft size={28} color={TEXT_PRIMARY} />
          </TouchableOpacity>

          {sent ? (
            <>
              <Text style={styles.successTitle}>Check your inbox</Text>
              <Text style={styles.successBody}>
                Follow the link in the email to reset your password.
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.title}>Reset password</Text>
              <Text style={styles.subtitle}>
                Enter your email and we&apos;ll send you a reset link.
              </Text>
            </>
          )}

          {!sent ? (
            <>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={(t) => {
                  setEmail(t);
                  if (error) setError(null);
                }}
                placeholder="Email"
                placeholderTextColor={TEXT_SECONDARY}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="emailAddress"
                autoComplete="email"
                editable={!loading}
              />
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <TouchableOpacity
                style={[styles.primaryBtn, loading && styles.primaryBtnDisabled]}
                onPress={onSubmit}
                disabled={loading}
                accessibilityRole="button"
                accessibilityLabel="Send reset link"
              >
                {loading ? (
                  <ActivityIndicator color={WHITE} />
                ) : (
                  <Text style={styles.primaryBtnText}>Send Reset Link</Text>
                )}
              </TouchableOpacity>
            </>
          ) : null}

          <TouchableOpacity
            onPress={() => navigation.navigate("Auth" as never)}
            style={styles.bottomLinkWrap}
            accessibilityRole="button"
            accessibilityLabel="Back to sign in"
          >
            <Text style={styles.bottomLink}>Back to sign in</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: WHITE },
  flex: { flex: 1 },
  scroll: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  backBtn: {
    alignSelf: "flex-start",
    marginBottom: 16,
    marginLeft: -4,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: TEXT_PRIMARY,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: TEXT_SECONDARY,
    marginBottom: 24,
  },
  input: {
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: DIVIDER,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
    color: TEXT_PRIMARY,
    marginBottom: 12,
  },
  error: {
    color: ERROR,
    fontSize: 14,
    marginBottom: 12,
  },
  primaryBtn: {
    backgroundColor: PRIMARY,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
  primaryBtnDisabled: {
    opacity: 0.7,
  },
  primaryBtnText: {
    color: WHITE,
    fontWeight: "600",
    fontSize: 16,
  },
  successTitle: {
    fontSize: 28,
    fontWeight: "700",
    color: TEXT_PRIMARY,
    marginBottom: 8,
  },
  successBody: {
    fontSize: 15,
    color: TEXT_SECONDARY,
    marginBottom: 24,
  },
  bottomLinkWrap: {
    marginTop: "auto",
    paddingTop: 24,
    alignItems: "center",
  },
  bottomLink: {
    color: PRIMARY,
    fontWeight: "600",
    fontSize: 14,
  },
});
