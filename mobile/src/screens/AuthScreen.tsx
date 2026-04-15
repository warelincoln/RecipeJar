import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import appleAuth from "@invertase/react-native-apple-authentication";
import { GoogleSignin } from "@react-native-google-signin/google-signin";
import { sha256 } from "js-sha256";
import { jwtDecode } from "jwt-decode";
import { supabase } from "../services/supabase";
import {
  PRIMARY,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  TEXT_TERTIARY,
  DIVIDER,
  ERROR,
  SURFACE,
  BLACK,
  WHITE,
} from "../theme/colors";

type Props = NativeStackScreenProps<any, "Auth">;

export function AuthScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      GoogleSignin.configure({
        webClientId:
          "83323297401-si95k1e5tc2kv5e7nl2v7e1m6vmfdvrd.apps.googleusercontent.com",
        iosClientId:
          "83323297401-21dnmg840d3rmksb54ak7mam17479d2n.apps.googleusercontent.com",
      });
    } catch {
      // Native module not yet available -- will error on sign-in attempt instead
    }
  }, []);

  const runAuth = useCallback(async (fn: () => Promise<void>) => {
    setError(null);
    setLoading(true);
    try {
      await fn();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Something went wrong";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  const onApple = useCallback(() => {
    runAuth(async () => {
      const rawNonce = Array.from(crypto.getRandomValues(new Uint8Array(16)))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      const hashedNonce = sha256(rawNonce);

      const credential = await appleAuth.performRequest({
        requestedOperation: appleAuth.Operation.LOGIN,
        requestedScopes: [
          appleAuth.Scope.FULL_NAME,
          appleAuth.Scope.EMAIL,
        ],
        nonce: hashedNonce,
      });
      if (!credential.identityToken) {
        throw new Error("No identity token");
      }
      const { error: signError } = await supabase.auth.signInWithIdToken({
        provider: "apple",
        token: credential.identityToken,
        nonce: hashedNonce,
      });
      if (signError) {
        throw signError;
      }
      if (credential.fullName?.givenName) {
        const name = [
          credential.fullName.givenName,
          credential.fullName.familyName,
        ]
          .filter(Boolean)
          .join(" ");
        await supabase.auth.updateUser({ data: { display_name: name } });
      }
    });
  }, [runAuth]);

  const onGoogle = useCallback(() => {
    runAuth(async () => {
      await GoogleSignin.hasPlayServices();
      const response = await GoogleSignin.signIn();
      if (!response.data?.idToken) {
        throw new Error("No ID token");
      }
      const decoded = jwtDecode<{ nonce?: string }>(response.data.idToken);
      const { error: signError } = await supabase.auth.signInWithIdToken({
        provider: "google",
        token: response.data.idToken,
        nonce: decoded.nonce,
      });
      if (signError) {
        throw signError;
      }
    });
  }, [runAuth]);

  return (
    <View
      style={[
        styles.root,
        {
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
        },
      ]}
    >
      <View style={styles.header}>
        <Text style={styles.logo}>Orzo</Text>
        <Text style={styles.subtitle}>Save, Plan, Cook.</Text>
      </View>

      <View style={styles.bottomBlock}>
        {appleAuth.isSupported ? (
          <>
            <TouchableOpacity
              style={styles.appleButton}
              onPress={onApple}
              activeOpacity={0.85}
              disabled={loading}
            >
              <Text style={styles.appleGlyph}>{"\uF8FF"}</Text>
              <Text style={styles.appleLabel}>Continue with Apple</Text>
            </TouchableOpacity>
            <View style={styles.gap12} />
          </>
        ) : null}

        <TouchableOpacity
          style={styles.googleButton}
          onPress={onGoogle}
          activeOpacity={0.85}
          disabled={loading}
        >
          <Text style={styles.googleG}>G</Text>
          <Text style={styles.googleLabel}>Continue with Google</Text>
        </TouchableOpacity>

        {loading ? (
          <ActivityIndicator
            color={PRIMARY}
            style={styles.loader}
          />
        ) : null}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerOr}>or</Text>
          <View style={styles.dividerLine} />
        </View>

        <TouchableOpacity
          onPress={() => navigation.navigate("SignIn")}
          activeOpacity={0.7}
          disabled={loading}
        >
          <Text style={styles.linkText}>Sign in with email</Text>
        </TouchableOpacity>

        <View style={styles.gap16} />

        <TouchableOpacity
          onPress={() => navigation.navigate("SignUp")}
          activeOpacity={0.7}
          disabled={loading}
        >
          <Text style={styles.linkText}>Create an account</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: WHITE,
    paddingHorizontal: 24,
  },
  header: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  logo: {
    fontSize: 36,
    fontWeight: "700",
    fontStyle: "italic",
    color: TEXT_PRIMARY,
  },
  subtitle: {
    marginTop: 8,
    fontSize: 16,
    color: TEXT_SECONDARY,
  },
  bottomBlock: {
    paddingBottom: 8,
  },
  appleButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: BLACK,
    borderRadius: 12,
    paddingVertical: 16,
  },
  appleGlyph: {
    fontSize: 22,
    color: WHITE,
    marginRight: 8,
    fontWeight: "600",
  },
  appleLabel: {
    color: WHITE,
    fontSize: 16,
    fontWeight: "600",
  },
  googleButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: TEXT_TERTIARY,
    borderRadius: 12,
    paddingVertical: 16,
  },
  googleG: {
    fontSize: 18,
    fontWeight: "700",
    color: TEXT_PRIMARY,
    marginRight: 8,
  },
  googleLabel: {
    color: TEXT_PRIMARY,
    fontSize: 16,
    fontWeight: "600",
  },
  gap12: {
    height: 12,
  },
  gap16: {
    height: 16,
  },
  loader: {
    marginTop: 16,
  },
  errorText: {
    marginTop: 12,
    color: ERROR,
    fontSize: 14,
    textAlign: "center",
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: DIVIDER,
  },
  dividerOr: {
    marginHorizontal: 12,
    fontSize: 14,
    color: TEXT_SECONDARY,
  },
  linkText: {
    fontSize: 14,
    fontWeight: "600",
    color: PRIMARY,
    textAlign: "center",
  },
});
