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
    urlHtml?: string;
    urlAcquisitionMethod?: "webview-html" | "server-fetch" | "server-fetch-fallback";
    urlCaptureFailureReason?:
      | "injection_failed"
      | "capture_timeout"
      | "page_not_ready"
      | "payload_too_large"
      | "message_transport_failed";
    resumeDraftId?: string;
    photoUri?: string;
    photoMimeType?: string;
    photoFileName?: string;
  };
  WebRecipeImport: { initialUrl?: string };
};
