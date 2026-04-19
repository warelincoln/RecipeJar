import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { Plus, Clock, Check } from "lucide-react-native";
import { LUCIDE } from "../../theme/lucideSizes";
import FastImage from "react-native-fast-image";
import type {
  EditedRecipeCandidate,
  ParsedRecipeCandidate,
  ValidationResult,
  ValidationIssue,
} from "@orzo/shared";
import { formatMinutes, isoDurationToMinutes } from "../../utils/time";
import {
  blockIndexForField,
  sliceWordsToText,
  visibleWordCountForBlock,
} from "./recipeParseReveal";
import { useRecipeParseReveal } from "./useRecipeParseReveal";
import { displayMessageForIssue } from "./issueDisplayMessage";
import { isFractionalAmount } from "../../utils/fractions";
import { hasSeenFractionTip, markFractionTipSeen } from "../../utils/fractionTip";
import { ShimmerPlaceholder } from "../../components/ShimmerPlaceholder";
import { RecipeImagePlaceholder } from "../../components/RecipeImagePlaceholder";
import {
  PRIMARY,
  PRIMARY_LIGHT,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  TEXT_TERTIARY,
  DIVIDER,
  WARNING,
  ERROR,
  SUCCESS,
  WHITE,
  DEEP_TERRACOTTA,
  LIGHT_PEACH,
} from "../../theme/colors";

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
  if (isDismissed) return TEXT_SECONDARY;
  if (issue.severity === "BLOCK") return ERROR;
  if (issue.severity === "RETAKE") return WARNING;
  return TEXT_SECONDARY;
}

interface PreviewEditViewProps {
  candidate: EditedRecipeCandidate;
  /** Parsed metadata from the original parse — used by the times review
   *  banner to show estimated prep/cook/total so the user can confirm
   *  inferred values. Null/undefined when no metadata is available. */
  parsedMetadata?: ParsedRecipeCandidate["metadata"] | null;
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
  parsedMetadata = null,
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

  // First-run fraction-verification tip. Shown once, ever — the first time
  // a user lands on a preview that contains any fractional ingredient. The
  // tip nudges them to double-check fractions (½ vs ⅓ etc.) before cooking,
  // which is the known residual failure mode of LLM vision on similar
  // glyphs even at temperature=0. Dismissed state persists in AsyncStorage.
  const hasAnyFractionalIngredient = ingredients.some(
    (ing) => !ing.isHeader && isFractionalAmount(ing.amount),
  );
  const [showFractionTip, setShowFractionTip] = useState(false);
  useEffect(() => {
    if (!hasAnyFractionalIngredient) return;
    let cancelled = false;
    (async () => {
      const seen = await hasSeenFractionTip();
      if (!cancelled && !seen) setShowFractionTip(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [hasAnyFractionalIngredient]);

  const dismissFractionTip = useCallback(() => {
    setShowFractionTip(false);
    void markFractionTipSeen();
  }, []);

  // Times review banner state --------------------------------------------
  // Derive the banner's "seed" values from the candidate's user overrides
  // first (set by the banner on previous interactions — persisted to the
  // draft via PATCH /drafts/:id/candidate), falling back to the parsed
  // metadata ISO values if no override exists.
  const parsedPrepMin = isoDurationToMinutes(parsedMetadata?.prepTime);
  const parsedCookMin = isoDurationToMinutes(parsedMetadata?.cookTime);
  const parsedTotalMin = isoDurationToMinutes(parsedMetadata?.totalTime);

  const prepInferred = parsedMetadata?.prepTimeSource === "inferred";
  const cookInferred = parsedMetadata?.cookTimeSource === "inferred";
  const totalInferred = parsedMetadata?.totalTimeSource === "inferred";

  // Show the banner whenever at least one time was AI-inferred, so the
  // user has the chance to review before saving. Explicit-only or null-only
  // parses skip the banner entirely.
  const showTimesBanner = prepInferred || cookInferred || totalInferred;

  const seedPrep =
    candidate.prepTimeMinutes != null
      ? String(candidate.prepTimeMinutes)
      : parsedPrepMin != null
        ? String(parsedPrepMin)
        : "";
  const seedCook =
    candidate.cookTimeMinutes != null
      ? String(candidate.cookTimeMinutes)
      : parsedCookMin != null
        ? String(parsedCookMin)
        : "";
  const seedTotal =
    candidate.totalTimeMinutes != null
      ? String(candidate.totalTimeMinutes)
      : parsedTotalMin != null
        ? String(parsedTotalMin)
        : "";

  const [prepInput, setPrepInput] = useState(seedPrep);
  const [cookInput, setCookInput] = useState(seedCook);
  const [totalInput, setTotalInput] = useState(seedTotal);

  // Any inferred field is "unconfirmed" until the user either taps Accept
  // (sets candidate.prepTimeMinutes explicitly) or edits the field.
  const unconfirmedCount =
    (prepInferred && candidate.prepTimeMinutes == null ? 1 : 0) +
    (cookInferred && candidate.cookTimeMinutes == null ? 1 : 0) +
    (totalInferred && candidate.totalTimeMinutes == null ? 1 : 0);
  const allTimesConfirmed = unconfirmedCount === 0;

  const parsePositiveIntLocal = (text: string): number | null => {
    const trimmed = text.trim();
    if (trimmed.length === 0) return null;
    const n = parseInt(trimmed, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  const handleTimeFieldChange = (
    field: "prepTimeMinutes" | "cookTimeMinutes" | "totalTimeMinutes",
    text: string,
  ) => {
    if (field === "prepTimeMinutes") setPrepInput(text);
    else if (field === "cookTimeMinutes") setCookInput(text);
    else setTotalInput(text);
    onEdit({ ...candidate, [field]: parsePositiveIntLocal(text) });
  };

  const handleAcceptTimes = () => {
    onEdit({
      ...candidate,
      prepTimeMinutes: parsePositiveIntLocal(prepInput),
      cookTimeMinutes: parsePositiveIntLocal(cookInput),
      totalTimeMinutes: parsePositiveIntLocal(totalInput),
    });
  };
  // ----------------------------------------------------------------------

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

      {showTimesBanner && (
        <View
          style={[
            styles.timesBanner,
            allTimesConfirmed && styles.timesBannerConfirmed,
          ]}
          testID="preview-times-banner"
        >
          <View style={styles.timesBannerHeader}>
            <Clock
              size={LUCIDE.sm}
              color={allTimesConfirmed ? SUCCESS : PRIMARY}
              strokeWidth={2}
            />
            <Text style={styles.timesBannerTitle}>
              {allTimesConfirmed
                ? "Times confirmed"
                : "We estimated these times"}
            </Text>
          </View>
          <Text style={styles.timesBannerSubtitle}>
            {allTimesConfirmed
              ? "Edit any field to adjust before saving."
              : "The recipe didn't state all times, so we estimated from the content. Tap a field to edit, or accept to save as-is."}
          </Text>
          <View style={styles.timesBannerRow}>
            <View style={styles.timesBannerField}>
              <Text style={styles.timesBannerLabel}>Prep</Text>
              <TextInput
                style={styles.timesBannerInput}
                value={prepInput}
                onChangeText={(t) =>
                  handleTimeFieldChange("prepTimeMinutes", t)
                }
                placeholder="—"
                keyboardType="number-pad"
                testID="preview-prep-time-input"
              />
              <Text style={styles.timesBannerUnit}>min</Text>
            </View>
            <View style={styles.timesBannerField}>
              <Text style={styles.timesBannerLabel}>Cook</Text>
              <TextInput
                style={styles.timesBannerInput}
                value={cookInput}
                onChangeText={(t) =>
                  handleTimeFieldChange("cookTimeMinutes", t)
                }
                placeholder="—"
                keyboardType="number-pad"
                testID="preview-cook-time-input"
              />
              <Text style={styles.timesBannerUnit}>min</Text>
            </View>
            <View style={styles.timesBannerField}>
              <Text style={styles.timesBannerLabel}>Total</Text>
              <TextInput
                style={styles.timesBannerInput}
                value={totalInput}
                onChangeText={(t) =>
                  handleTimeFieldChange("totalTimeMinutes", t)
                }
                placeholder="—"
                keyboardType="number-pad"
                testID="preview-total-time-input"
              />
              <Text style={styles.timesBannerUnit}>min</Text>
            </View>
          </View>
          {!allTimesConfirmed && (
            <TouchableOpacity
              style={styles.timesBannerAcceptButton}
              onPress={handleAcceptTimes}
              testID="preview-times-accept"
              accessibilityRole="button"
              accessibilityLabel="preview-times-accept"
            >
              <Check size={16} color={WHITE} strokeWidth={2.5} />
              <Text style={styles.timesBannerAcceptText}>Accept estimates</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

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
      {showFractionTip && (
        <View style={styles.fractionTipBanner}>
          <Text style={styles.fractionTipText}>
            Double-check fractions before cooking — AI isn&apos;t always perfect
            on ½ vs ⅓. Flagged amounts have a peach tint below.
          </Text>
          <TouchableOpacity
            style={styles.fractionTipDismiss}
            onPress={dismissFractionTip}
            accessibilityRole="button"
            accessibilityLabel="dismiss-fraction-tip"
          >
            <Text style={styles.fractionTipDismissText}>Got it</Text>
          </TouchableOpacity>
        </View>
      )}
      {ingredients.map((ing, i) => {
        const isFractional =
          !ing.isHeader && isFractionalAmount(ing.amount);
        return (
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
                  isFractional && styles.inputFractional,
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
                  isFractional && styles.inputFractional,
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
        );
      })}
      <TouchableOpacity
        style={[styles.addButton, isRevealing && styles.addButtonDisabled]}
        onPress={handleAddIngredient}
        disabled={isRevealing}
        testID="preview-add-ingredient"
        accessibilityRole="button"
        accessibilityLabel="preview-add-ingredient"
      >
        <View style={styles.addButtonContent}>
          <Plus size={LUCIDE.sm} color={PRIMARY} />
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
          <Plus size={LUCIDE.sm} color={PRIMARY} />
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
  outer: { flex: 1, backgroundColor: WHITE },
  scroll: { flex: 1, backgroundColor: WHITE },
  content: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 40 },
  heroWrap: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 10,
    backgroundColor: DIVIDER,
  },
  heroImage: {
    ...StyleSheet.absoluteFillObject,
  },
  heroImageHidden: {
    opacity: 0,
  },
  otherReadyBar: {
    backgroundColor: PRIMARY_LIGHT,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignItems: "center",
    marginBottom: 4,
  },
  otherReadyText: {
    fontSize: 13,
    fontWeight: "500",
    color: PRIMARY,
  },
  cancelButton: { alignSelf: "flex-start", paddingVertical: 8 },
  cancelText: { fontSize: 16, color: TEXT_SECONDARY },
  timesBanner: {
    backgroundColor: LIGHT_PEACH,
    borderWidth: 1,
    borderColor: PRIMARY_LIGHT,
    borderRadius: 12,
    padding: 14,
    marginTop: 8,
    marginBottom: 8,
  },
  timesBannerConfirmed: {
    backgroundColor: WHITE,
    borderColor: SUCCESS,
  },
  timesBannerHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  timesBannerTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: TEXT_PRIMARY,
  },
  timesBannerSubtitle: {
    fontSize: 13,
    color: TEXT_SECONDARY,
    lineHeight: 18,
    marginBottom: 12,
  },
  timesBannerRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
  },
  timesBannerField: {
    flex: 1,
    flexDirection: "column",
    alignItems: "flex-start",
  },
  timesBannerLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: TEXT_TERTIARY,
    marginBottom: 4,
  },
  timesBannerInput: {
    width: "100%",
    borderWidth: 1,
    borderColor: DIVIDER,
    borderRadius: 8,
    backgroundColor: WHITE,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 15,
    textAlign: "center",
  },
  timesBannerUnit: {
    fontSize: 11,
    color: TEXT_SECONDARY,
    marginTop: 4,
    alignSelf: "center",
  },
  timesBannerAcceptButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: PRIMARY,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  timesBannerAcceptText: {
    color: WHITE,
    fontSize: 14,
    fontWeight: "600",
  },
  sectionTitle: { fontSize: 18, fontWeight: "700", marginTop: 20, marginBottom: 8 },
  input: {
    borderWidth: 1, borderColor: DIVIDER, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, marginBottom: 4,
  },
  // Subtle peach tint signals "this line has a fractional amount — give
  // it a glance before cooking." Matches the existing tinted-surface
  // language used for feature cards / selected states. Intentionally
  // softer than inputError (used for validation failures).
  inputFractional: {
    backgroundColor: LIGHT_PEACH,
    borderColor: LIGHT_PEACH,
  },
  fractionTipBanner: {
    backgroundColor: LIGHT_PEACH,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  fractionTipText: {
    flex: 1,
    fontSize: 13,
    color: TEXT_PRIMARY,
    lineHeight: 18,
  },
  fractionTipDismiss: {
    backgroundColor: PRIMARY,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  fractionTipDismissText: {
    color: WHITE,
    fontSize: 12,
    fontWeight: "600",
  },
  servingsInput: {
    width: 100,
  },
  inputLikeText: {
    color: TEXT_PRIMARY,
    minHeight: 44,
  },
  inputError: { borderColor: WARNING },
  issueText: { color: DEEP_TERRACOTTA, fontSize: 13, marginBottom: 4, marginLeft: 4, lineHeight: 18 },
  ingredientHeader: {
    fontSize: 15, fontWeight: "600", fontStyle: "italic",
    color: TEXT_TERTIARY, paddingVertical: 6,
  },
  stepHeader: {
    fontSize: 15, fontWeight: "600", fontStyle: "italic",
    color: TEXT_TERTIARY, paddingVertical: 6,
  },
  stepRow: { flexDirection: "row", alignItems: "flex-start" },
  stepNumber: { fontSize: 15, fontWeight: "600", marginRight: 8, marginTop: 10 },
  stepInput: {
    flex: 1, borderWidth: 1, borderColor: DIVIDER, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 15,
    marginBottom: 4, minHeight: 60, textAlignVertical: "top",
  },
  addButton: {
    paddingVertical: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: DIVIDER,
    borderRadius: 8,
    borderStyle: "dashed",
    marginTop: 4,
    marginBottom: 4,
  },
  addButtonDisabled: { opacity: 0.45 },
  addButtonContent: { flexDirection: "row", alignItems: "center", gap: 6 },
  addButtonText: { fontSize: 14, color: PRIMARY, fontWeight: "600" },
  issuesSummary: {
    marginTop: 24,
    padding: 16,
    backgroundColor: LIGHT_PEACH,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: WARNING,
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
  issueMessage: { fontSize: 13, color: TEXT_TERTIARY, lineHeight: 19 },
  issueMessageDismissed: { textDecorationLine: "line-through", color: TEXT_SECONDARY },
  dismissButton: {
    backgroundColor: WARNING, paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 6, marginLeft: 8,
  },
  undismissButton: { backgroundColor: DIVIDER },
  dismissText: { fontSize: 12, fontWeight: "600", color: WHITE },
  undismissText: { color: TEXT_SECONDARY },
  buttonRow: {
    flexDirection: "row", justifyContent: "center",
    gap: 12, marginTop: 24,
  },
  saveButton: {
    flex: 1, backgroundColor: SUCCESS,
    paddingVertical: 14, borderRadius: 12, alignItems: "center",
  },
  saveButtonDisabled: { backgroundColor: TEXT_SECONDARY },
  saveText: { color: WHITE, fontSize: 16, fontWeight: "600" },
});
