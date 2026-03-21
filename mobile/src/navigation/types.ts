export type RootStackParamList = {
  Home: undefined;
  RecipeDetail: { recipeId: string };
  ImportFlow: { mode: "image" | "url"; url?: string; resumeDraftId?: string };
};
