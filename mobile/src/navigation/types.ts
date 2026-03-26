export type RootStackParamList = {
  Home: undefined;
  RecipeDetail: { recipeId: string };
  RecipeEdit: { recipeId: string };
  Collection: {
    collectionId: string;
    collectionName: string;
    isAllRecipes?: boolean;
  };
  ImportFlow: {
    mode: "image" | "url";
    url?: string;
    resumeDraftId?: string;
    photoUri?: string;
    photoMimeType?: string;
    photoFileName?: string;
  };
  WebRecipeImport: { initialUrl?: string };
};
