import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ChevronLeft,
  User,
  LogOut,
  Mail,
  Check,
  Trash2,
  Shield,
  ShieldOff,
} from "lucide-react-native";
import FastImage from "react-native-fast-image";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useAuthStore } from "../stores/auth.store";
import { supabase } from "../services/supabase";
import { api } from "../services/api";

type Props = NativeStackScreenProps<any, "Account">;

export function AccountScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { user, signOut, signOutAll } = useAuthStore();
  const [signingOut, setSigningOut] = React.useState(false);
  const [signingOutAll, setSigningOutAll] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [mfaEnrolling, setMfaEnrolling] = React.useState(false);
  const [mfaQrUri, setMfaQrUri] = React.useState<string | null>(null);
  const [mfaFactorId, setMfaFactorId] = React.useState<string | null>(null);
  const [mfaCode, setMfaCode] = React.useState("");
  const [mfaVerifying, setMfaVerifying] = React.useState(false);
  const [mfaUnenrolling, setMfaUnenrolling] = React.useState(false);
  const [mfaError, setMfaError] = React.useState<string | null>(null);

  const mfaFactors = user?.factors ?? [];
  const hasVerifiedTotp = mfaFactors.some(
    (f: any) => f.factor_type === "totp" && f.status === "verified",
  );

  const avatarUrl = user?.user_metadata?.avatar_url;
  const displayName =
    user?.user_metadata?.display_name ||
    user?.user_metadata?.full_name ||
    "Orzo User";
  const email = user?.email ?? "";
  const initial = displayName[0]?.toUpperCase();

  const providers = (user?.identities ?? []).map((id) => id.provider);

  const handleSignOut = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          setSigningOut(true);
          try {
            await signOut();
          } catch {
            setSigningOut(false);
          }
        },
      },
    ]);
  };

  const handleMfaEnroll = async () => {
    setMfaEnrolling(true);
    setMfaError(null);
    try {
      const { data: factorsData } = await supabase.auth.mfa.listFactors();
      const staleFactors = (factorsData?.totp ?? []).filter(
        (f) => f.status === "unverified",
      );
      for (const f of staleFactors) {
        await supabase.auth.mfa.unenroll({ factorId: f.id });
      }

      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        issuer: "Orzo",
        friendlyName: "Orzo Authenticator",
      });
      if (error) {
        Alert.alert("MFA Error", error.message);
        setMfaEnrolling(false);
        return;
      }
      setMfaQrUri(data.totp.uri);
      setMfaFactorId(data.id);
    } catch (e: any) {
      Alert.alert("MFA Error", e?.message ?? "Failed to start MFA enrollment.");
      setMfaEnrolling(false);
    }
  };

  const handleMfaVerify = async () => {
    if (!mfaFactorId || mfaCode.trim().length !== 6) {
      setMfaError("Please enter a 6-digit code");
      return;
    }
    setMfaVerifying(true);
    setMfaError(null);
    try {
      const { data: challenge, error: challengeErr } =
        await supabase.auth.mfa.challenge({ factorId: mfaFactorId });
      if (challengeErr || !challenge) {
        setMfaError(challengeErr?.message ?? "Failed to create challenge");
        setMfaVerifying(false);
        return;
      }
      const { error: verifyErr } = await supabase.auth.mfa.verify({
        factorId: mfaFactorId,
        challengeId: challenge.id,
        code: mfaCode.trim(),
      });
      if (verifyErr) {
        setMfaError(verifyErr.message);
      } else {
        Alert.alert("Success", "Two-factor authentication is now enabled.");
        setMfaEnrolling(false);
        setMfaQrUri(null);
        setMfaFactorId(null);
        setMfaCode("");
      }
    } catch {
      setMfaError("Verification failed.");
    } finally {
      setMfaVerifying(false);
    }
  };

  const handleMfaUnenroll = () => {
    const totpFactor = mfaFactors.find(
      (f: any) => f.factor_type === "totp" && f.status === "verified",
    );
    if (!totpFactor) return;

    Alert.alert(
      "Disable Two-Factor Authentication",
      "Are you sure you want to disable two-factor authentication?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Disable",
          style: "destructive",
          onPress: async () => {
            setMfaUnenrolling(true);
            try {
              const { error } = await supabase.auth.mfa.unenroll({
                factorId: totpFactor.id,
              });
              if (error) {
                Alert.alert("Error", error.message);
              } else {
                await supabase.auth.refreshSession();
                Alert.alert("Disabled", "Two-factor authentication has been disabled.");
              }
            } catch {
              Alert.alert("Error", "Failed to disable two-factor authentication.");
            } finally {
              setMfaUnenrolling(false);
            }
          },
        },
      ],
    );
  };

  const handleSignOutAll = () => {
    Alert.alert(
      "Sign Out All Devices",
      "This will sign you out on all devices. You will need to sign in again everywhere.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign Out All",
          style: "destructive",
          onPress: async () => {
            setSigningOutAll(true);
            try {
              await signOutAll();
            } catch {
              setSigningOutAll(false);
            }
          },
        },
      ],
    );
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      "Delete Account",
      "This will permanently delete your account and all your data. This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete Account",
          style: "destructive",
          onPress: () => {
            Alert.alert(
              "Are you absolutely sure?",
              "All your recipes, collections, and notes will be permanently deleted.",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Yes, Delete My Account",
                  style: "destructive",
                  onPress: async () => {
                    setDeleting(true);
                    try {
                      await api.account.deleteAccount();
                      await signOut();
                    } catch {
                      Alert.alert("Error", "Failed to delete account. Please try again.");
                      setDeleting(false);
                    }
                  },
                },
              ],
            );
          },
        },
      ],
    );
  };

  const version = require("../../package.json").version;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12}>
          <ChevronLeft size={28} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Account</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.profileCard}>
          {avatarUrl ? (
            <FastImage source={{ uri: avatarUrl }} style={styles.avatarLarge} />
          ) : (
            <View
              style={[
                styles.avatarCircleLarge,
                { backgroundColor: initial ? "#2563eb" : "#e5e7eb" },
              ]}
            >
              {initial ? (
                <Text style={styles.avatarInitialLarge}>{initial}</Text>
              ) : (
                <User size={28} color="#6b7280" />
              )}
            </View>
          )}
          <Text style={styles.displayName}>{displayName}</Text>
          <Text style={styles.email}>{email}</Text>
        </View>

        <Text style={styles.sectionLabel}>Linked accounts</Text>
        <View style={styles.linkedCard}>
          <LinkedRow
            label="Email"
            connected={providers.includes("email")}
            provider="email"
            identities={user?.identities ?? []}
            providerCount={providers.length}
          />
          <View style={styles.divider} />
          <LinkedRow
            label="Apple"
            connected={providers.includes("apple")}
            provider="apple"
            identities={user?.identities ?? []}
            providerCount={providers.length}
          />
          <View style={styles.divider} />
          <LinkedRow
            label="Google"
            connected={providers.includes("google")}
            provider="google"
            identities={user?.identities ?? []}
            providerCount={providers.length}
          />
        </View>

        <Text style={styles.sectionLabel}>Security</Text>
        <View style={styles.mfaCard}>
          {hasVerifiedTotp ? (
            <View style={styles.mfaRow}>
              <Shield size={20} color="#16a34a" />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.mfaStatusText}>Two-factor authentication is enabled</Text>
              </View>
              <TouchableOpacity
                onPress={handleMfaUnenroll}
                disabled={mfaUnenrolling}
              >
                {mfaUnenrolling ? (
                  <ActivityIndicator color="#dc2626" size="small" />
                ) : (
                  <ShieldOff size={20} color="#dc2626" />
                )}
              </TouchableOpacity>
            </View>
          ) : mfaEnrolling && mfaQrUri ? (
            <View>
              <Text style={styles.mfaInstructionText}>
                Tap the button below to add Orzo to your authenticator app, then enter the 6-digit code:
              </Text>
              <TouchableOpacity
                style={styles.mfaOpenAuthBtn}
                onPress={() => {
                  Linking.openURL(mfaQrUri!).catch(() => {
                    Alert.alert(
                      "No Authenticator App",
                      "Install an authenticator app like Google Authenticator or 1Password, then try again.",
                    );
                  });
                }}
              >
                <Shield size={20} color="#fff" />
                <Text style={styles.mfaOpenAuthText}>Open in Authenticator App</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.mfaCopyFallback}
                onPress={() => {
                  import("@react-native-clipboard/clipboard").then(({ default: Clipboard }) => {
                    Clipboard.setString(mfaQrUri!);
                    Alert.alert("Copied", "Secret URI copied. Paste it into your authenticator app.");
                  });
                }}
              >
                <Text style={styles.mfaCopyFallbackText}>Or copy secret to clipboard</Text>
              </TouchableOpacity>
              <TextInput
                style={styles.mfaCodeInput}
                placeholder="000000"
                placeholderTextColor="#d1d5db"
                value={mfaCode}
                onChangeText={(t) => setMfaCode(t.replace(/\D/g, "").slice(0, 6))}
                keyboardType="number-pad"
                maxLength={6}
                textAlign="center"
              />
              {mfaError && <Text style={styles.mfaErrorText}>{mfaError}</Text>}
              <View style={styles.mfaActions}>
                <TouchableOpacity
                  onPress={() => {
                    setMfaEnrolling(false);
                    setMfaQrUri(null);
                    setMfaFactorId(null);
                    setMfaCode("");
                    setMfaError(null);
                  }}
                >
                  <Text style={styles.mfaCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.mfaVerifyBtn}
                  onPress={handleMfaVerify}
                  disabled={mfaVerifying}
                >
                  {mfaVerifying ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.mfaVerifyText}>Verify & Enable</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.mfaEnableRow}
              onPress={handleMfaEnroll}
              disabled={mfaEnrolling}
            >
              <Shield size={20} color="#2563eb" />
              <Text style={styles.mfaEnableText}>Enable Two-Factor Authentication</Text>
              {mfaEnrolling && <ActivityIndicator color="#2563eb" size="small" />}
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          style={styles.signOutButton}
          onPress={handleSignOut}
          disabled={signingOut}
          activeOpacity={0.7}
        >
          {signingOut ? (
            <ActivityIndicator color="#dc2626" />
          ) : (
            <>
              <LogOut size={18} color="#dc2626" />
              <Text style={styles.signOutText}>Sign Out</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.signOutAllButton}
          onPress={handleSignOutAll}
          disabled={signingOutAll}
          activeOpacity={0.7}
        >
          {signingOutAll ? (
            <ActivityIndicator color="#6b7280" />
          ) : (
            <>
              <LogOut size={18} color="#6b7280" />
              <Text style={styles.signOutAllText}>Sign Out All Devices</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.deleteButton}
          onPress={handleDeleteAccount}
          disabled={deleting}
          activeOpacity={0.7}
        >
          {deleting ? (
            <ActivityIndicator color="#991b1b" />
          ) : (
            <>
              <Trash2 size={18} color="#991b1b" />
              <Text style={styles.deleteText}>Delete Account</Text>
            </>
          )}
        </TouchableOpacity>

        <Text style={styles.version}>Orzo v{version}</Text>
      </ScrollView>
    </View>
  );
}

function LinkedRow({
  label,
  connected,
  provider,
  identities,
  providerCount,
}: {
  label: string;
  connected: boolean;
  provider: string;
  identities: any[];
  providerCount: number;
}) {
  const [loading, setLoading] = React.useState(false);

  const handleLink = async () => {
    if (provider === "email") return;
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.linkIdentity({
        provider: provider as "apple" | "google",
        options: {
          skipBrowserRedirect: true,
          redirectTo: "app.orzo.ios://auth/callback",
        },
      });
      if (error) {
        Alert.alert("Error", error.message);
      } else if (data?.url) {
        await Linking.openURL(data.url);
      }
    } catch {
      Alert.alert("Error", `Failed to link ${label}`);
    } finally {
      setLoading(false);
    }
  };

  const handleUnlink = async () => {
    if (providerCount <= 1) {
      Alert.alert("Cannot Unlink", "You must have at least one login method.");
      return;
    }
    const identity = identities.find((id: any) => id.provider === provider);
    if (!identity) return;

    Alert.alert(`Unlink ${label}`, `Are you sure you want to unlink ${label}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Unlink",
        style: "destructive",
        onPress: async () => {
          setLoading(true);
          try {
            const { error } = await supabase.auth.unlinkIdentity(identity);
            if (error) {
              Alert.alert("Error", error.message);
            } else {
              await supabase.auth.refreshSession();
            }
          } catch {
            Alert.alert("Error", `Failed to unlink ${label}`);
          } finally {
            setLoading(false);
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.linkedRow}>
      <View style={styles.linkedIcon}>
        {label === "Email" ? (
          <Mail size={18} color="#111827" />
        ) : (
          <Text style={{ fontSize: 16, fontWeight: "600" }}>
            {label === "Apple" ? "\uF8FF" : "G"}
          </Text>
        )}
      </View>
      <Text style={styles.linkedLabel}>{label}</Text>
      {loading ? (
        <ActivityIndicator size="small" color="#6b7280" />
      ) : connected ? (
        <TouchableOpacity onPress={handleUnlink} hitSlop={8}>
          <Check size={18} color="#16a34a" />
        </TouchableOpacity>
      ) : provider !== "email" ? (
        <TouchableOpacity onPress={handleLink} hitSlop={8}>
          <Text style={{ fontSize: 13, color: "#2563eb", fontWeight: "600" }}>Link</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  content: {
    paddingHorizontal: 24,
    paddingBottom: 48,
  },
  profileCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 24,
    alignItems: "center",
    marginTop: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  avatarLarge: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  avatarCircleLarge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitialLarge: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "700",
  },
  displayName: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
    marginTop: 12,
  },
  email: {
    fontSize: 14,
    color: "#6b7280",
    marginTop: 4,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 28,
    marginBottom: 8,
  },
  linkedCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  linkedRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  linkedIcon: {
    width: 28,
    alignItems: "center",
  },
  linkedLabel: {
    flex: 1,
    fontSize: 15,
    color: "#111827",
    marginLeft: 10,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#e5e7eb",
    marginLeft: 54,
  },
  mfaCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  mfaRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  mfaStatusText: {
    fontSize: 15,
    color: "#111827",
    fontWeight: "500",
  },
  mfaEnableRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  mfaEnableText: {
    flex: 1,
    fontSize: 15,
    color: "#2563eb",
    fontWeight: "600",
  },
  mfaInstructionText: {
    fontSize: 14,
    color: "#6b7280",
    marginBottom: 12,
  },
  mfaOpenAuthBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2563eb",
    borderRadius: 10,
    paddingVertical: 14,
    gap: 10,
    marginBottom: 12,
  },
  mfaOpenAuthText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  mfaCopyFallback: {
    alignItems: "center",
    marginBottom: 16,
  },
  mfaCopyFallbackText: {
    fontSize: 13,
    color: "#6b7280",
    textDecorationLine: "underline",
  },
  mfaCodeInput: {
    borderWidth: 2,
    borderColor: "#d1d5db",
    borderRadius: 8,
    paddingVertical: 12,
    fontSize: 24,
    fontWeight: "700",
    color: "#111827",
    letterSpacing: 8,
  },
  mfaErrorText: {
    color: "#dc2626",
    fontSize: 13,
    marginTop: 8,
  },
  mfaActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 16,
  },
  mfaCancelText: {
    fontSize: 14,
    color: "#6b7280",
    fontWeight: "600",
  },
  mfaVerifyBtn: {
    backgroundColor: "#2563eb",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  mfaVerifyText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 14,
  },
  signOutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#dc2626",
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 32,
    gap: 8,
  },
  signOutText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#dc2626",
  },
  signOutAllButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 12,
    gap: 8,
  },
  signOutAllText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#6b7280",
  },
  deleteButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fef2f2",
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 12,
    gap: 8,
  },
  deleteText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#991b1b",
  },
  version: {
    fontSize: 12,
    color: "#9ca3af",
    textAlign: "center",
    marginTop: 24,
  },
});
