import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronLeft, Eye, EyeOff } from "lucide-react-native";
import { supabase } from "../services/supabase";
import {
  PRIMARY,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  DIVIDER,
  ERROR,
  WHITE,
} from "../theme/colors";

type Props = NativeStackScreenProps<any, "SignIn">;

export function SignInScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignIn() {
    setError(null);
    setLoading(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) {
        setError(signInError.message);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={12}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <ChevronLeft size={28} color={TEXT_PRIMARY} />
        </TouchableOpacity>

        <Text style={styles.title}>Sign in</Text>

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor={TEXT_SECONDARY}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoCorrect={false}
          editable={!loading}
        />

        <View style={styles.gap} />

        <View style={styles.passwordOuter}>
          <TextInput
            style={styles.passwordInput}
            placeholder="Password"
            placeholderTextColor={TEXT_SECONDARY}
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!passwordVisible}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!loading}
          />
          <TouchableOpacity
            style={styles.eyeBtn}
            onPress={() => setPasswordVisible((v) => !v)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={passwordVisible ? "Hide password" : "Show password"}
          >
            {passwordVisible ? (
              <EyeOff size={22} color={TEXT_SECONDARY} />
            ) : (
              <Eye size={22} color={TEXT_SECONDARY} />
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.gap} />

        <TouchableOpacity
          onPress={() => navigation.navigate("ForgotPassword")}
          style={styles.forgotRow}
          hitSlop={4}
        >
          <Text style={styles.forgotText}>Forgot password?</Text>
        </TouchableOpacity>

        <View style={styles.gap} />

        <TouchableOpacity
          style={[styles.primaryBtn, loading && styles.primaryBtnDisabled]}
          onPress={handleSignIn}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color={WHITE} />
          ) : (
            <Text style={styles.primaryBtnText}>Sign In</Text>
          )}
        </TouchableOpacity>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: WHITE,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 32,
  },
  backBtn: {
    alignSelf: "flex-start",
    marginLeft: -4,
  },
  title: {
    fontWeight: "700",
    fontSize: 28,
    color: TEXT_PRIMARY,
    marginTop: 8,
    marginBottom: 16,
  },
  input: {
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: DIVIDER,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: TEXT_PRIMARY,
  },
  gap: {
    height: 16,
  },
  passwordOuter: {
    position: "relative",
    borderWidth: 1,
    borderColor: DIVIDER,
    borderRadius: 10,
    backgroundColor: WHITE,
    flexDirection: "row",
    alignItems: "center",
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    paddingRight: 44,
    fontSize: 15,
    color: TEXT_PRIMARY,
  },
  eyeBtn: {
    position: "absolute",
    right: 10,
    top: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    width: 36,
  },
  forgotRow: {
    alignSelf: "flex-end",
  },
  forgotText: {
    color: PRIMARY,
    fontWeight: "600",
    fontSize: 14,
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
    opacity: 0.85,
  },
  primaryBtnText: {
    color: WHITE,
    fontWeight: "600",
    fontSize: 16,
  },
  errorText: {
    color: ERROR,
    fontSize: 13,
    marginTop: 16,
  },
});
