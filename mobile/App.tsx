import React from "react";
import {
  NavigationContainer,
  createNavigationContainerRef,
} from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { HomeScreen } from "./src/screens/HomeScreen";
import { RecipeDetailScreen } from "./src/screens/RecipeDetailScreen";
import { RecipeEditScreen } from "./src/screens/RecipeEditScreen";
import { CollectionScreen } from "./src/screens/CollectionScreen";
import { ImportFlowScreen } from "./src/screens/ImportFlowScreen";
import { WebRecipeImportScreen } from "./src/screens/WebRecipeImportScreen";
import { ImportHubScreen } from "./src/screens/ImportHubScreen";
import { PendingImportsBanner } from "./src/components/PendingImportsBanner";
import { useImportQueuePoller } from "./src/features/import/importQueuePoller";
import type { RootStackParamList } from "./src/navigation/types";

const Stack = createNativeStackNavigator<RootStackParamList>();

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

function AppPoller() {
  useImportQueuePoller();
  return null;
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
      <NavigationContainer ref={navigationRef}>
        <Stack.Navigator
          initialRouteName="Home"
          screenOptions={{
            headerShown: false,
          }}
        >
          <Stack.Screen name="Home" component={HomeScreen} />
          <Stack.Screen
            name="RecipeDetail"
            component={RecipeDetailScreen}
            options={{ headerShown: true, title: "Recipe" }}
          />
          <Stack.Screen
            name="RecipeEdit"
            component={RecipeEditScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Collection"
            component={CollectionScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="ImportFlow"
            component={ImportFlowScreen}
            options={{ presentation: "fullScreenModal" }}
          />
          <Stack.Screen
            name="WebRecipeImport"
            component={WebRecipeImportScreen}
            options={{ presentation: "fullScreenModal", headerShown: false }}
          />
          <Stack.Screen
            name="ImportHub"
            component={ImportHubScreen}
            options={{ presentation: "fullScreenModal", headerShown: false }}
          />
        </Stack.Navigator>
        <PendingImportsBanner navigationRef={navigationRef} />
        <AppPoller />
      </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
