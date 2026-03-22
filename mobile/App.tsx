import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { HomeScreen } from "./src/screens/HomeScreen";
import { RecipeDetailScreen } from "./src/screens/RecipeDetailScreen";
import { RecipeEditScreen } from "./src/screens/RecipeEditScreen";
import { CollectionScreen } from "./src/screens/CollectionScreen";
import { ImportFlowScreen } from "./src/screens/ImportFlowScreen";
import type { RootStackParamList } from "./src/navigation/types";

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <NavigationContainer>
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
        </Stack.Navigator>
      </NavigationContainer>
    </GestureHandlerRootView>
  );
}
