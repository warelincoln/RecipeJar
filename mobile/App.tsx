import React, { useEffect } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  Linking,
  StyleSheet,
} from "react-native";
import {
  NavigationContainer,
  createNavigationContainerRef,
} from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { HomeScreen } from "./src/screens/HomeScreen";
import { RecipeDetailScreen } from "./src/screens/RecipeDetailScreen";
import { RecipeEditScreen } from "./src/screens/RecipeEditScreen";
import { CollectionScreen } from "./src/screens/CollectionScreen";
import { ImportFlowScreen } from "./src/screens/ImportFlowScreen";
import { WebRecipeImportScreen } from "./src/screens/WebRecipeImportScreen";
import { ImportHubScreen } from "./src/screens/ImportHubScreen";
import { AccountScreen } from "./src/screens/AccountScreen";
import { OnboardingScreen } from "./src/screens/OnboardingScreen";
import { AuthScreen } from "./src/screens/AuthScreen";
import { SignInScreen } from "./src/screens/SignInScreen";
import { SignUpScreen } from "./src/screens/SignUpScreen";
import { ForgotPasswordScreen } from "./src/screens/ForgotPasswordScreen";
import { EmailConfirmationScreen } from "./src/screens/EmailConfirmationScreen";
import { ResetPasswordScreen } from "./src/screens/ResetPasswordScreen";
import { MfaChallengeScreen } from "./src/screens/MfaChallengeScreen";
import { PendingImportsBanner } from "./src/components/PendingImportsBanner";
import { useImportQueuePoller } from "./src/features/import/importQueuePoller";
import { useAuthStore } from "./src/stores/auth.store";
import { reconcileQueue } from "./src/stores/importQueue.store";
import { supabase } from "./src/services/supabase";
import type { RootStackParamList, AuthStackParamList } from "./src/navigation/types";

const AppStack = createNativeStackNavigator<RootStackParamList>();
const AuthStackNav = createNativeStackNavigator<AuthStackParamList>();

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

function parseSupabaseHashParams(url: string): Record<string, string> {
  const hashIndex = url.indexOf("#");
  if (hashIndex === -1) return {};
  const fragment = url.substring(hashIndex + 1);
  return Object.fromEntries(new URLSearchParams(fragment));
}

function AppPoller() {
  useImportQueuePoller();
  return null;
}

function AuthStackScreens({ showOnboarding }: { showOnboarding: boolean }) {
  return (
    <AuthStackNav.Navigator
      initialRouteName={showOnboarding ? "Onboarding" : "Auth"}
      screenOptions={{ headerShown: false }}
    >
      <AuthStackNav.Screen name="Onboarding" component={OnboardingScreen} />
      <AuthStackNav.Screen name="Auth" component={AuthScreen} />
      <AuthStackNav.Screen name="SignIn" component={SignInScreen} />
      <AuthStackNav.Screen name="SignUp" component={SignUpScreen} />
      <AuthStackNav.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
      <AuthStackNav.Screen name="EmailConfirmation" component={EmailConfirmationScreen} />
    </AuthStackNav.Navigator>
  );
}

function AppStackScreens() {
  return (
    <>
      <AppStack.Navigator
        initialRouteName="Home"
        screenOptions={{ headerShown: false }}
      >
        <AppStack.Screen name="Home" component={HomeScreen} />
        <AppStack.Screen
          name="RecipeDetail"
          component={RecipeDetailScreen}
          options={{ headerShown: true, title: "Recipe" }}
        />
        <AppStack.Screen name="RecipeEdit" component={RecipeEditScreen} />
        <AppStack.Screen name="Collection" component={CollectionScreen} />
        <AppStack.Screen
          name="ImportFlow"
          component={ImportFlowScreen}
          options={{ presentation: "fullScreenModal" }}
        />
        <AppStack.Screen
          name="WebRecipeImport"
          component={WebRecipeImportScreen}
          options={{ presentation: "fullScreenModal", headerShown: false }}
        />
        <AppStack.Screen
          name="ImportHub"
          component={ImportHubScreen}
          options={{ presentation: "fullScreenModal", headerShown: false }}
        />
        <AppStack.Screen name="Account" component={AccountScreen} />
      </AppStack.Navigator>
      <PendingImportsBanner navigationRef={navigationRef} />
      <AppPoller />
    </>
  );
}

export default function App() {
  const { isLoading, isAuthenticated, pendingPasswordReset, needsMfaVerify, initialize } =
    useAuthStore();
  const [showOnboarding, setShowOnboarding] = React.useState(false);
  const [checkingOnboarding, setCheckingOnboarding] = React.useState(true);

  useEffect(() => {
    initialize();
  }, []);

  useEffect(() => {
    AsyncStorage.getItem("@orzo/onboarding-complete").then((value) => {
      setShowOnboarding(value !== "true");
      setCheckingOnboarding(false);
    });
  }, []);

  useEffect(() => {
    const handleDeepLink = async (event: { url: string }) => {
      const params = parseSupabaseHashParams(event.url);
      const { access_token, refresh_token, type } = params;
      if (!access_token) return;

      await supabase.auth.setSession({ access_token, refresh_token });

      if (type === "recovery") {
        useAuthStore.getState().setPendingPasswordReset(true);
      }
    };

    const sub = Linking.addEventListener("url", handleDeepLink);
    Linking.getInitialURL().then((url) => {
      if (url) handleDeepLink({ url });
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (isAuthenticated && !pendingPasswordReset) {
      reconcileQueue();
    }
  }, [isAuthenticated, pendingPasswordReset]);

  if (isLoading || checkingOnboarding) {
    return (
      <View style={splashStyles.container}>
        <Text style={splashStyles.logo}>Orzo</Text>
        <ActivityIndicator size="large" color="#2563eb" style={{ marginTop: 24 }} />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <NavigationContainer ref={navigationRef}>
          {!isAuthenticated ? (
            <AuthStackScreens showOnboarding={showOnboarding} />
          ) : needsMfaVerify ? (
            <MfaChallengeScreen />
          ) : pendingPasswordReset ? (
            <ResetPasswordScreen />
          ) : (
            <AppStackScreens />
          )}
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const splashStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  logo: {
    fontSize: 36,
    fontWeight: "700",
    fontStyle: "italic",
    color: "#111827",
  },
});
