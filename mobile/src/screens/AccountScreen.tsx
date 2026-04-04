import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ChevronLeft,
  User,
  LogOut,
  Mail,
  Check,
} from "lucide-react-native";
import FastImage from "react-native-fast-image";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useAuthStore } from "../stores/auth.store";

type Props = NativeStackScreenProps<any, "Account">;

export function AccountScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuthStore();
  const [signingOut, setSigningOut] = React.useState(false);

  const avatarUrl = user?.user_metadata?.avatar_url;
  const displayName =
    user?.user_metadata?.display_name ||
    user?.user_metadata?.full_name ||
    "RecipeJar User";
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
          <LinkedRow label="Email" connected={providers.includes("email")} />
          <View style={styles.divider} />
          <LinkedRow label="Apple" connected={providers.includes("apple")} />
          <View style={styles.divider} />
          <LinkedRow label="Google" connected={providers.includes("google")} />
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

        <Text style={styles.version}>RecipeJar v{version}</Text>
      </ScrollView>
    </View>
  );
}

function LinkedRow({
  label,
  connected,
}: {
  label: string;
  connected: boolean;
}) {
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
      {connected && <Check size={18} color="#16a34a" />}
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
  version: {
    fontSize: 12,
    color: "#9ca3af",
    textAlign: "center",
    marginTop: 24,
  },
});
