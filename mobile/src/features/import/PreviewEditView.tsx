import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { Plus } from "lucide-react-native";
import { LUCIDE } from "../../theme/lucideSizes";
import FastImage from "react-native-fast-image";
import type {
  EditedRecipeCandidate,
  ValidationResult,
  ValidationIssue,
} from "@recipejar/shared";
import {
  blockIndexForField,
  sliceWordsToText,
  visibleWordCountForBlock,
} from "./recipeParseReveal";
import { useRecipeParseReveal } from "./useRecipeParseReveal";
import { displayMessageForIssue } from "./issueDisplayMessage";
import { ShimmerPlaceholder } from "../../components/ShimmerPlaceholder";
import { RecipeImagePlaceholder } from "../../components/RecipeImagePlaceholder";

/** No badge for FLAG. BLOCK/RETAKE use softer labels than raw severity codes. */
function issueSummaryBadgeLabel(
  issue: ValidationIssue,
  isDismissed: boolean,
): string | null {
  if (issue.severity === "FLAG") return null;
  if (isDismissed) return "Noted";
  if (issue.severity === "BLOCK") return "Needs attention";
  if (issue.severity === "RETAKE") return "Photo could be clearer";
  return null;
}

function issueSummaryBadgeColor(
  issue: ValidationIssue,
  isDismissed: boolean,
): string {
  if (isDismissed) return "#9ca3af";
  if (issue.severity === "BLOCK") return "#b45309";
  if (issue.severity === "RETAKE") return "#0369a1";
  return "#6b7280";
}

interface PreviewEditViewProps {
  candidate: EditedRecipeCandidate;
  validationResult: ValidationResult | null;
  dismissedIssueIds: Set<string>;
  heroImageUrl?: string | null;
  /** >0 after a fresh parse triggers a fast word-by-word reveal (~6000 WPM); 0 skips (e.g. resume draft). */
  parseRevealToken?: number;
  onEdit: (candidate: EditedRecipeCandidate) => void;
  onSave: () => void;
  onDismissWarning: (issueId: string) => void;
  onUndismissWarning: (issueId: string) => void;
  onCancel: () => void;
  otherReadyCount?: number;
  /** True while PATCH /drafts/:id/candidate is in flight (avoid save with stale validation). */
  candidateSyncPending?: boolean;
}

export function PreviewEditView({
  candidate,
  validationResult,
  dismissedIssueIds,
  heroImageUrl = null,
  parseRevealToken = 0,
  onEdit,
  onSave,
  onDismissWarning,
  onUndismissWarning,
  onCancel,
  otherReadyCount = 0,
  candidateSyncPending = false,
}: PreviewEditViewProps) {
  const [title, setTitle] = useState(candidate.title);
  const [servingsText, setServingsText] = useState(
    candidate.servings != null ? String(candidate.servings) : "",
  );
  const [ingredients, setIngredients] = useState(candidate.ingredients);
  const [steps, setSteps] = useState(candidate.steps);
  const [heroLoaded, setHeroLoaded] = useState(false);

  useEffect(() => {
    setHeroLoaded(false);
  }, [heroImageUrl]);

  const { plan, revealedWordCount, isRevealing } = useRecipeParseReveal(
    candidate,
    parseRevealToken,
  );

  const titleBlockIdx = 0;
  const titleRevealText = sliceWordsToText(
    plan.blocks[titleBlockIdx]?.words ?? [],
    visibleWordCountForBlock(plan, titleBlockIdx, revealedWordCount),
  );

  const ingredientRevealText = useCallback(
    (i: number) => {
      const bi = blockIndexForField(plan, "ingredient", i);
      if (bi < 0) return candidate.ingredients[i]?.text ?? "";
      return sliceWordsToText(
        plan.blocks[bi].words,
        visibleWordCountForBlock(plan, bi, revealedWordCount),
      );
    },
    [plan, candidate.ingredients, revealedWordCount],
  );

  const stepRevealText = useCallback(
    (i: number) => {
      const bi = blockIndexForField(plan, "step", i);
      if (bi < 0) return candidate.steps[i]?.text ?? "";
      return sliceWordsToText(
        plan.blocks[bi].words,
        visibleWordCountForBlock(plan, bi, revealedWordCount),
      );
    },
    [plan, candidate.steps, revealedWordCount],
  );

  const issuesByField = useCallback(
    (fieldPath: string): ValidationIssue[] =>
      validationResult?.issues.filter((i) => i.fieldPath === fieldPath) ?? [],
    [validationResult],
  );

  const isFieldDismissed = useCallback(
    (fieldPath: string): boolean => {
      const fieldIssues = issuesByField(fieldPath);
      return fieldIssues.length > 0 && fieldIssues.every((i) => dismissedIssueIds.has(i.issueId));
    },
    [issuesByField, dismissedIssueIds],
  );

  const handleServingsChange = (text: string) => {
    setServingsText(text);
    const parsed = parseFloat(text);
    const servings = !isNaN(parsed) && parsed > 0 ? parsed : null;
    onEdit({ ...candidate, servings });
  };

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

  const handleAddIngredient = () => {
    const newIngredient = {
      id: `new-ing-${Date.now()}`,
      text: "",
      orderIndex: ingredients.length,
      isHeader: false,
      amount: null,
      amountMax: null,
      unit: null,
      name: null,
      raw: null,
      isScalable: false,
    };
    const updated = [...ingredients, newIngredient];
    setIngredients(updated);
    onEdit({ ...candidate, ingredients: updated });
  };

  const handleAddStep = () => {
    const newStep = {
      id: `new-step-${Date.now()}`,
      text: "",
      orderIndex: steps.length,
      isHeader: false,
    };
    const updated = [...steps, newStep];
    setSteps(updated);
    onEdit({ ...candidate, steps: updated });
  };

  const hasBlockers = validationResult?.hasBlockingIssues;
  const saveDisabled =
    !!hasBlockers || isRevealing || candidateSyncPending;

  return (
    <View style={styles.outer}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        testID="preview-edit-screen"
      >
      {heroImageUrl ? (
        <View style={styles.heroWrap}>
          {!heroLoaded && (
            <ShimmerPlaceholder
              style={StyleSheet.absoluteFillObject}
              borderRadius={12}
            />
          )}
          <FastImage
            source={{ uri: heroImageUrl }}
            style={[styles.heroImage, !heroLoaded && styles.heroImageHidden]}
            resizeMode={FastImage.resizeMode.cover}
            onLoadEnd={() => setHeroLoaded(true)}
          />
        </View>
      ) : (
        <RecipeImagePlaceholder style={styles.heroWrap} />
      )}
      {otherReadyCount > 0 && (
        <View style={styles.otherReadyBar}>
          <Text style={styles.otherReadyText}>
            {otherReadyCount === 1
              ? "1 more recipe ready"
              : `${otherReadyCount} more recipes ready`}
          </Text>
        </View>
      )}
      <TouchableOpacity style={styles.cancelButton} onPress={onCancel} testID="preview-cancel" accessibilityRole="button" accessibilityLabel="preview-cancel">
        <Text style={styles.cancelText}>Cancel</Text>
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>Title</Text>
      {isRevealing ? (
        <Text
          style={[
            styles.input,
            styles.inputLikeText,
            issuesByField("title").length > 0 && !isFieldDismissed("title") && styles.inputError,
          ]}
          testID="preview-title-input"
        >
          {titleRevealText}
        </Text>
      ) : (
        <TextInput
          style={[
            styles.input,
            issuesByField("title").length > 0 && !isFieldDismissed("title") && styles.inputError,
          ]}
          value={title}
          onChangeText={handleTitleChange}
          placeholder="Recipe title"
          testID="preview-title-input"
        />
      )}
      {issuesByField("title").map((issue) => (
        <Text key={issue.issueId} style={styles.issueText}>
          {displayMessageForIssue(issue)}
        </Text>
      ))}

      <Text style={styles.sectionTitle}>Servings</Text>
      <TextInput
        style={[
          styles.input,
          styles.servingsInput,
          issuesByField("servings").length > 0 &&
            !isFieldDismissed("servings") &&
            styles.inputError,
        ]}
        value={servingsText}
        onChangeText={handleServingsChange}
        placeholder="e.g. 4"
        keyboardType="numeric"
        testID="preview-servings-input"
      />
      {issuesByField("servings").map((issue) => (
        <Text key={issue.issueId} style={styles.issueText}>
          {displayMessageForIssue(issue)}
        </Text>
      ))}

      <Text style={styles.sectionTitle}>
        Ingredients ({ingredients.length})
      </Text>
      {ingredients.map((ing, i) => (
        <View key={ing.id}>
          {ing.isHeader ? (
            <Text style={styles.ingredientHeader}>
              {isRevealing ? ingredientRevealText(i) : ing.text}
            </Text>
          ) : isRevealing ? (
            <Text
              style={[
                styles.input,
                styles.inputLikeText,
                issuesByField(`ingredients[${i}]`).length > 0 &&
                  !isFieldDismissed(`ingredients[${i}]`) &&
                  styles.inputError,
              ]}
            >
              {ingredientRevealText(i)}
            </Text>
          ) : (
            <TextInput
              style={[
                styles.input,
                issuesByField(`ingredients[${i}]`).length > 0 &&
                  !isFieldDismissed(`ingredients[${i}]`) &&
                  styles.inputError,
              ]}
              value={ing.text}
              onChangeText={(t) => handleIngredientChange(i, t)}
            />
          )}
          {issuesByField(`ingredients[${i}]`).map((issue) => (
            <Text key={issue.issueId} style={styles.issueText}>
              {displayMessageForIssue(issue)}
            </Text>
          ))}
        </View>
      ))}
      <TouchableOpacity
        style={[styles.addButton, isRevealing && styles.addButtonDisabled]}
        onPress={handleAddIngredient}
        disabled={isRevealing}
        testID="preview-add-ingredient"
        accessibilityRole="button"
        accessibilityLabel="preview-add-ingredient"
      >
        <View style={styles.addButtonContent}>
          <Plus size={LUCIDE.sm} color="#2563eb" />
          <Text style={styles.addButtonText}>Add Ingredient</Text>
        </View>
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>Steps ({steps.filter((s) => !s.isHeader).length})</Text>
      {(() => {
        let stepNum = 0;
        return steps.map((step, i) => {
          if (step.isHeader) {
            return (
              <Text key={step.id} style={styles.stepHeader}>
                {isRevealing ? stepRevealText(i) : step.text}
              </Text>
            );
          }
          stepNum++;
          return (
            <View key={step.id}>
              <View style={styles.stepRow}>
                <Text style={styles.stepNumber}>{stepNum}.</Text>
                {isRevealing ? (
                  <Text
                    style={[
                      styles.stepInput,
                      styles.inputLikeText,
                      issuesByField(`steps[${i}]`).length > 0 &&
                        !isFieldDismissed(`steps[${i}]`) &&
                        styles.inputError,
                    ]}
                  >
                    {stepRevealText(i)}
                  </Text>
                ) : (
                  <TextInput
                    style={[
                      styles.stepInput,
                      issuesByField(`steps[${i}]`).length > 0 &&
                        !isFieldDismissed(`steps[${i}]`) &&
                        styles.inputError,
                    ]}
                    value={step.text}
                    onChangeText={(t) => handleStepChange(i, t)}
                    multiline
                  />
                )}
              </View>
              {issuesByField(`steps[${i}]`).map((issue) => (
                <Text key={issue.issueId} style={styles.issueText}>
                  {displayMessageForIssue(issue)}
                </Text>
              ))}
            </View>
          );
        });
      })()}
      <TouchableOpacity
        style={[styles.addButton, isRevealing && styles.addButtonDisabled]}
        onPress={handleAddStep}
        disabled={isRevealing}
        testID="preview-add-step"
        accessibilityRole="button"
        accessibilityLabel="preview-add-step"
      >
        <View style={styles.addButtonContent}>
          <Plus size={LUCIDE.sm} color="#2563eb" />
          <Text style={styles.addButtonText}>Add Step</Text>
        </View>
      </TouchableOpacity>

      {validationResult && validationResult.issues.length > 0 && (
        <View style={styles.issuesSummary}>
          <Text style={styles.issuesSummaryTitle}>
            {hasBlockers ? "Before you save" : "Give these a look"}
          </Text>
          {validationResult.issues
            .filter((i) => i.severity !== "PASS")
            .map((issue) => {
              const isDismissed = dismissedIssueIds.has(issue.issueId);
              const badgeLabel = issueSummaryBadgeLabel(issue, isDismissed);
              return (
                <View
                  key={issue.issueId}
                  style={[
                    styles.issueBadge,
                    isDismissed && styles.issueDismissed,
                  ]}
                >
                  <View style={styles.issueContent}>
                    {badgeLabel != null ? (
                      <Text
                        style={[
                          styles.issueBadgeLabel,
                          { color: issueSummaryBadgeColor(issue, isDismissed) },
                        ]}
                      >
                        {badgeLabel}
                      </Text>
                    ) : null}
                    <Text
                      style={[
                        styles.issueMessage,
                        isDismissed && styles.issueMessageDismissed,
                      ]}
                    >
                      {displayMessageForIssue(issue)}
                    </Text>
                  </View>
                  {issue.severity === "FLAG" && issue.userDismissible && (
                    <TouchableOpacity
                      style={[
                        styles.dismissButton,
                        isDismissed && styles.undismissButton,
                      ]}
                      onPress={() =>
                        isDismissed
                          ? onUndismissWarning(issue.issueId)
                          : onDismissWarning(issue.issueId)
                      }
                      testID={`preview-confirm-${issue.issueId}`}
                    >
                      <Text
                        style={[
                          styles.dismissText,
                          isDismissed && styles.undismissText,
                        ]}
                      >
                        {isDismissed ? "Undo" : "Looks good"}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
        </View>
      )}

      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={[styles.saveButton, saveDisabled && styles.saveButtonDisabled]}
          onPress={onSave}
          disabled={saveDisabled}
          testID="preview-save"
          accessibilityRole="button"
          accessibilityLabel="preview-save"
        >
          <Text style={styles.saveText}>Save Recipe</Text>
        </TouchableOpacity>
      </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { flex: 1, backgroundColor: "#fff" },
  scroll: { flex: 1, backgroundColor: "#fff" },
  content: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 40 },
  heroWrap: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 10,
    backgroundColor: "#e5e7eb",
  },
  heroImage: {
    ...StyleSheet.absoluteFillObject,
  },
  heroImageHidden: {
    opacity: 0,
  },
  otherReadyBar: {
    backgroundColor: "#eff6ff",
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignItems: "center",
    marginBottom: 4,
  },
  otherReadyText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#2563eb",
  },
  cancelButton: { alignSelf: "flex-start", paddingVertical: 8 },
  cancelText: { fontSize: 16, color: "#6b7280" },
  sectionTitle: { fontSize: 18, fontWeight: "700", marginTop: 20, marginBottom: 8 },
  input: {
    borderWidth: 1, borderColor: "#d1d5db", borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, marginBottom: 4,
  },
  servingsInput: {
    width: 100,
  },
  inputLikeText: {
    color: "#111827",
    minHeight: 44,
  },
  inputError: { borderColor: "#f59e0b" },
  issueText: { color: "#9a3412", fontSize: 13, marginBottom: 4, marginLeft: 4, lineHeight: 18 },
  ingredientHeader: {
    fontSize: 15, fontWeight: "600", fontStyle: "italic",
    color: "#374151", paddingVertical: 6,
  },
  stepHeader: {
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
  addButton: {
    paddingVertical: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    borderStyle: "dashed",
    marginTop: 4,
    marginBottom: 4,
  },
  addButtonDisabled: { opacity: 0.45 },
  addButtonContent: { flexDirection: "row", alignItems: "center", gap: 6 },
  addButtonText: { fontSize: 14, color: "#2563eb", fontWeight: "600" },
  issuesSummary: {
    marginTop: 24,
    padding: 16,
    backgroundColor: "#fffbeb",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#fde68a",
  },
  issuesSummaryTitle: { fontSize: 16, fontWeight: "700", marginBottom: 8 },
  issueBadge: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 10,
    paddingVertical: 4,
  },
  issueDismissed: { opacity: 0.7 },
  issueContent: { flex: 1 },
  issueBadgeLabel: { fontSize: 11, fontWeight: "700", marginBottom: 4, letterSpacing: 0.2 },
  issueMessage: { fontSize: 13, color: "#374151", lineHeight: 19 },
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
  saveButton: {
    flex: 1, backgroundColor: "#16a34a",
    paddingVertical: 14, borderRadius: 12, alignItems: "center",
  },
  saveButtonDisabled: { backgroundColor: "#9ca3af" },
  saveText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
