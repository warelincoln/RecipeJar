import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Image,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import type {
  EditedRecipeCandidate,
  ValidationResult,
  ValidationIssue,
} from "@recipejar/shared";

interface GuidedCorrectionViewProps {
  candidate: EditedRecipeCandidate;
  validationResult: ValidationResult | null;
  sourceImageUris: string[];
  onEdit: (candidate: EditedRecipeCandidate) => void;
  onComplete: (candidate: EditedRecipeCandidate) => void;
}

export function GuidedCorrectionView({
  candidate,
  validationResult,
  sourceImageUris,
  onEdit,
  onComplete,
}: GuidedCorrectionViewProps) {
  const [title, setTitle] = useState(candidate.title);
  const [ingredients, setIngredients] = useState(candidate.ingredients);
  const [steps, setSteps] = useState(candidate.steps);

  const issuesByField = useCallback(
    (fieldPath: string): ValidationIssue[] =>
      validationResult?.issues.filter((i) => i.fieldPath === fieldPath) ?? [],
    [validationResult],
  );

  const allIssues = validationResult?.issues.filter(
    (i) => i.severity === "CORRECTION_REQUIRED" || i.severity === "BLOCK",
  ) ?? [];

  const handleTitleChange = (text: string) => {
    setTitle(text);
    onEdit({ ...candidate, title: text, ingredients, steps });
  };

  const handleIngredientChange = (index: number, text: string) => {
    const updated = [...ingredients];
    updated[index] = { ...updated[index], text };
    setIngredients(updated);
    onEdit({ ...candidate, title, ingredients: updated, steps });
  };

  const handleStepChange = (index: number, text: string) => {
    const updated = [...steps];
    updated[index] = { ...updated[index], text };
    setSteps(updated);
    onEdit({ ...candidate, title, ingredients, steps: updated });
  };

  const canComplete =
    title.trim().length > 0 &&
    ingredients.filter((i) => !i.isHeader).length > 0 &&
    steps.length > 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Guided Correction</Text>
      <Text style={styles.subtitle}>
        Review the source and fix the issues below. The recipe will be
        revalidated as you edit.
      </Text>

      {sourceImageUris.length > 0 && (
        <ScrollView horizontal style={styles.sourceScroll}>
          {sourceImageUris.map((uri, i) => (
            <Image key={i} source={{ uri }} style={styles.sourceImage} />
          ))}
        </ScrollView>
      )}

      {allIssues.length > 0 && (
        <View style={styles.issuesList}>
          <Text style={styles.issuesHeader}>
            Issues ({allIssues.length})
          </Text>
          {allIssues.map((issue) => (
            <View key={issue.issueId} style={styles.issueRow}>
              <Text style={styles.issueSeverity}>{issue.severity}</Text>
              <Text style={styles.issueMessage}>{issue.message}</Text>
            </View>
          ))}
        </View>
      )}

      <Text style={styles.fieldLabel}>Title</Text>
      <TextInput
        style={[
          styles.input,
          issuesByField("title").length > 0 && styles.inputError,
        ]}
        value={title}
        onChangeText={handleTitleChange}
        placeholder="Recipe title"
      />

      <Text style={styles.fieldLabel}>Ingredients</Text>
      {ingredients.map((ing, i) =>
        ing.isHeader ? (
          <Text key={ing.id} style={styles.headerText}>{ing.text}</Text>
        ) : (
          <TextInput
            key={ing.id}
            style={[
              styles.input,
              issuesByField(`ingredients[${i}]`).length > 0 && styles.inputError,
            ]}
            value={ing.text}
            onChangeText={(t) => handleIngredientChange(i, t)}
          />
        ),
      )}

      <Text style={styles.fieldLabel}>Steps</Text>
      {steps.map((step, i) => (
        <TextInput
          key={step.id}
          style={[
            styles.input,
            styles.stepInput,
            issuesByField(`steps[${i}]`).length > 0 && styles.inputError,
          ]}
          value={step.text}
          onChangeText={(t) => handleStepChange(i, t)}
          multiline
        />
      ))}

      <TouchableOpacity
        style={[styles.completeButton, !canComplete && styles.buttonDisabled]}
        onPress={() =>
          onComplete({ title, ingredients, steps, description: candidate.description })
        }
        disabled={!canComplete}
      >
        <Text style={styles.completeText}>Done Correcting</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 16, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: "700", marginBottom: 4 },
  subtitle: { fontSize: 14, color: "#6b7280", marginBottom: 16, lineHeight: 20 },
  sourceScroll: { marginBottom: 16, maxHeight: 200 },
  sourceImage: { width: 140, height: 190, borderRadius: 8, marginRight: 8 },
  issuesList: {
    backgroundColor: "#fef2f2", padding: 12, borderRadius: 8, marginBottom: 16,
  },
  issuesHeader: { fontSize: 14, fontWeight: "700", color: "#dc2626", marginBottom: 8 },
  issueRow: { flexDirection: "row", marginBottom: 4 },
  issueSeverity: { fontSize: 11, fontWeight: "700", color: "#dc2626", width: 120 },
  issueMessage: { flex: 1, fontSize: 13, color: "#374151" },
  fieldLabel: { fontSize: 16, fontWeight: "600", marginTop: 16, marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: "#d1d5db", borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, marginBottom: 6,
  },
  inputError: { borderColor: "#ef4444" },
  headerText: { fontSize: 15, fontWeight: "600", fontStyle: "italic", paddingVertical: 4 },
  stepInput: { minHeight: 60, textAlignVertical: "top" },
  completeButton: {
    backgroundColor: "#2563eb", paddingVertical: 14,
    borderRadius: 12, alignItems: "center", marginTop: 24,
  },
  buttonDisabled: { backgroundColor: "#9ca3af" },
  completeText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
