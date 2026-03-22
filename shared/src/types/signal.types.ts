export interface SourcePage {
  id: string;
  orderIndex: number;
  sourceType: "image" | "url";
  retakeCount?: number;
  imageUri?: string | null;
  extractedText?: string | null;
}

export interface IngredientSignal {
  index: number;
  text: string;
  mergedWhenSeparable: boolean;
  missingName: boolean;
  missingQuantityOrUnit: boolean;
  minorOcrArtifact: boolean;
  majorOcrArtifact: boolean;
}

export interface StepSignal {
  index: number;
  text: string;
  minorOcrArtifact: boolean;
  majorOcrArtifact: boolean;
}
