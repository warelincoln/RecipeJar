export type RootStackParamList = {
  Home: undefined;
  RecipeDetail: { recipeId: string };
  RecipeEdit: { recipeId: string };
  Collection: { collectionId: string; collectionName: string };
  ImportFlow: { mode: "image" | "url"; url?: string; resumeDraftId?: string };
};
