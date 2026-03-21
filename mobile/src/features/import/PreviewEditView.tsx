import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import type {
  EditedRecipeCandidate,
  ValidationResult,
  ValidationIssue,
} from "@recipejar/shared";

interface PreviewEditViewProps {
  candidate: EditedRecipeCandidate;
  validationResult: ValidationResult | null;
  dismissedIssueIds: Set<string>;
  onEdit: (candidate: EditedRecipeCandidate) => void;
  onSave: () => void;
  onEnterCorrection: () => void;
  onDismissWarning: (issueId: string) => void;
  onUndismissWarning: (issueId: string) => void;
  onCancel: () => void;
}

export function PreviewEditView({
  candidate,
  validationResult,
  dismissedIssueIds,
  onEdit,
  onSave,
  onEnterCorrection,
  onDismissWarning,
  onUndismissWarning,
  onCancel,
}: PreviewEditViewProps) {
  const [title, setTitle] = useState(candidate.title);
  const [ingredients, setIngredients] = useState(candidate.ingredients);
  const [steps, setSteps] = useState(candidate.steps);

  const issuesByField = useCallback(
    (fieldPath: string): ValidationIssue[] =>
      validationResult?.issues.filter((i) => i.fieldPath === fieldPath) ?? [],
    [validationResult],
  );

  const handleTitleChange = (text: string) => {
    setTitle(text);
    onEdit({ ...candidate, title: text });
  };

  const handleIngredientChange = (index: number, text: string) => {
    const updated = [...ingredients];
    updated[index] = { ...updated[index], text };
    setIngredients(updated);
    onEdit({ ...candidate, ingredients: updated });
  };

  const handleStepChange = (index: number, text: string) => {
    const updated = [...steps];
    updated[index] = { ...updated[index], text };
    setSteps(updated);
    onEdit({ ...candidate, steps: updated });
  };

  const hasBlockers =
    validationResult?.hasBlockingIssues ||
    validationResult?.hasCorrectionRequiredIssues;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
        <Text style={styles.cancelText}>Cancel</Text>
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>Title</Text>
      <TextInput
        style={[
          styles.input,
          issuesByField("title").length > 0 && styles.inputError,
        ]}
        value={title}
        onChangeText={handleTitleChange}
        placeholder="Recipe title"
      />
      {issuesByField("title").map((issue) => (
        <Text key={issue.issueId} style={styles.issueText}>
          {issue.message}
        </Text>
      ))}

      <Text style={styles.sectionTitle}>
        Ingredients ({ingredients.length})
      </Text>
      {ingredients.map((ing, i) => (
        <View key={ing.id}>
          {ing.isHeader ? (
            <Text style={styles.ingredientHeader}>{ing.text}</Text>
          ) : (
            <TextInput
              style={[
                styles.input,
                issuesByField(`ingredients[${i}]`).length > 0 &&
                  styles.inputError,
              ]}
              value={ing.text}
              onChangeText={(t) => handleIngredientChange(i, t)}
            />
          )}
          {issuesByField(`ingredients[${i}]`).map((issue) => (
            <Text key={issue.issueId} style={styles.issueText}>
              {issue.message}
            </Text>
          ))}
        </View>
      ))}

      <Text style={styles.sectionTitle}>Steps ({steps.length})</Text>
      {steps.map((step, i) => (
        <View key={step.id}>
          <View style={styles.stepRow}>
            <Text style={styles.stepNumber}>{i + 1}.</Text>
            <TextInput
              style={[
                styles.stepInput,
                issuesByField(`steps[${i}]`).length > 0 && styles.inputError,
              ]}
              value={step.text}
              onChangeText={(t) => handleStepChange(i, t)}
              multiline
            />
          </View>
          {issuesByField(`steps[${i}]`).map((issue) => (
            <Text key={issue.issueId} style={styles.issueText}>
              {issue.message}
            </Text>
          ))}
        </View>
      ))}

      {validationResult && validationResult.issues.length > 0 && (
        <View style={styles.issuesSummary}>
          <Text style={styles.issuesSummaryTitle}>
            {hasBlockers ? "Issues to resolve" : "Warnings"}
          </Text>
          {validationResult.issues
            .filter((i) => i.severity !== "PASS")
            .map((issue) => {
              const isDismissed = dismissedIssueIds.has(issue.issueId);
              return (
                <View key={issue.issueId} style={[styles.issueBadge, isDismissed && styles.issueDismissed]}>
                  <View style={styles.issueContent}>
                    <Text
                      style={[
                        styles.issueSeverity,
                        issue.severity === "BLOCK" && { color: "#dc2626" },
                        issue.severity === "CORRECTION_REQUIRED" && { color: "#ea580c" },
                        issue.severity === "FLAG" && { color: "#ca8a04" },
                        isDismissed && { color: "#9ca3af" },
                      ]}
                    >
                      {isDismissed ? "ACKNOWLEDGED" : issue.severity}
                    </Text>
                    <Text style={[styles.issueMessage, isDismissed && styles.issueMessageDismissed]}>
                      {issue.message}
                    </Text>
                  </View>
                  {issue.severity === "FLAG" && issue.userDismissible && (
                    <TouchableOpacity
                      style={[styles.dismissButton, isDismissed && styles.undismissButton]}
                      onPress={() =>
                        isDismissed
                          ? onUndismissWarning(issue.issueId)
                          : onDismissWarning(issue.issueId)
                      }
                    >
                      <Text style={[styles.dismissText, isDismissed && styles.undismissText]}>
                        {isDismissed ? "Undo" : "OK, include"}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
        </View>
      )}

      <View style={styles.buttonRow}>
        {hasBlockers && (
          <TouchableOpacity
            style={styles.correctionButton}
            onPress={onEnterCorrection}
          >
            <Text style={styles.correctionText}>Fix Issues</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.saveButton, hasBlockers && styles.saveButtonDisabled]}
          onPress={onSave}
          disabled={!!hasBlockers}
        >
          <Text style={styles.saveText}>Save Recipe</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 16, paddingBottom: 40 },
  cancelButton: { alignSelf: "flex-start", paddingVertical: 8 },
  cancelText: { fontSize: 16, color: "#6b7280" },
  sectionTitle: { fontSize: 18, fontWeight: "700", marginTop: 20, marginBottom: 8 },
  input: {
    borderWidth: 1, borderColor: "#d1d5db", borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, marginBottom: 4,
  },
  inputError: { borderColor: "#ef4444" },
  issueText: { color: "#ef4444", fontSize: 12, marginBottom: 4, marginLeft: 4 },
  ingredientHeader: {
    fontSize: 15, fontWeight: "600", fontStyle: "italic",
    color: "#374151", paddingVertical: 6,
  },
  stepRow: { flexDirection: "row", alignItems: "flex-start" },
  stepNumber: { fontSize: 15, fontWeight: "600", marginRight: 8, marginTop: 10 },
  stepInput: {
    flex: 1, borderWidth: 1, borderColor: "#d1d5db", borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 15,
    marginBottom: 4, minHeight: 60, textAlignVertical: "top",
  },
  issuesSummary: {
    marginTop: 24, padding: 16, backgroundColor: "#fef3c7", borderRadius: 12,
  },
  issuesSummaryTitle: { fontSize: 16, fontWeight: "700", marginBottom: 8 },
  issueBadge: { flexDirection: "row", alignItems: "center", marginBottom: 10, paddingVertical: 4 },
  issueDismissed: { opacity: 0.7 },
  issueContent: { flex: 1 },
  issueSeverity: { fontSize: 11, fontWeight: "700", marginBottom: 2 },
  issueMessage: { fontSize: 13, color: "#374151" },
  issueMessageDismissed: { textDecorationLine: "line-through", color: "#9ca3af" },
  dismissButton: {
    backgroundColor: "#f59e0b", paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 6, marginLeft: 8,
  },
  undismissButton: { backgroundColor: "#e5e7eb" },
  dismissText: { fontSize: 12, fontWeight: "600", color: "#fff" },
  undismissText: { color: "#6b7280" },
  buttonRow: {
    flexDirection: "row", justifyContent: "center",
    gap: 12, marginTop: 24,
  },
  correctionButton: {
    flex: 1, backgroundColor: "#ea580c",
    paddingVertical: 14, borderRadius: 12, alignItems: "center",
  },
  correctionText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  saveButton: {
    flex: 1, backgroundColor: "#16a34a",
    paddingVertical: 14, borderRadius: 12, alignItems: "center",
  },
  saveButtonDisabled: { backgroundColor: "#9ca3af" },
  saveText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
