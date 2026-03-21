import React, { useCallback, useState } from "react";
import { View, StyleSheet, Alert } from "react-native";
import { useMachine } from "@xstate/react";
import { importMachine } from "../features/import/machine";
import { CaptureView } from "../features/import/CaptureView";
import { ReorderView } from "../features/import/ReorderView";
import { ParsingView } from "../features/import/ParsingView";
import { PreviewEditView } from "../features/import/PreviewEditView";
import { RetakeRequiredView } from "../features/import/RetakeRequiredView";
import { GuidedCorrectionView } from "../features/import/GuidedCorrectionView";
import { WarningGateView } from "../features/import/WarningGateView";
import { SavedView } from "../features/import/SavedView";
import { api } from "../services/api";
import type { EditedRecipeCandidate } from "@recipejar/shared";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "ImportFlow">;

export function ImportFlowScreen({ route, navigation }: Props) {
  const { mode, url, resumeDraftId } = route.params ?? {
    mode: "image" as const,
  };
  const [state, send] = useMachine(importMachine);

  React.useEffect(() => {
    if (state.matches("idle")) {
      if (resumeDraftId) {
        send({ type: "RESUME_DRAFT", draftId: resumeDraftId });
      } else if (mode === "url" && url) {
        send({ type: "NEW_URL_IMPORT", url });
      } else {
        send({ type: "NEW_IMAGE_IMPORT" });
      }
    }
  }, []);

  const [dismissedIssueIds, setDismissedIssueIds] = useState<Set<string>>(
    new Set(),
  );

  const handleCancel = useCallback(() => {
    Alert.alert("Cancel Import", "Are you sure you want to cancel this import?", [
      { text: "Keep Going", style: "cancel" },
      { text: "Cancel Import", style: "destructive", onPress: () => navigation.navigate("Home") },
    ]);
  }, [navigation]);

  const handleEdit = useCallback(
    async (candidate: EditedRecipeCandidate) => {
      if (!state.context.draftId) return;
      await api.drafts.updateCandidate(
        state.context.draftId,
        candidate,
      );
      send({ type: "EDIT_CANDIDATE", candidate });
    },
    [state.context.draftId, send],
  );

  const handleDismissWarning = useCallback(
    async (issueId: string) => {
      if (!state.context.draftId) return;
      await api.drafts.dismissWarning(state.context.draftId, issueId);
      setDismissedIssueIds((prev) => new Set(prev).add(issueId));
    },
    [state.context.draftId],
  );

  const handleUndismissWarning = useCallback(
    async (issueId: string) => {
      if (!state.context.draftId) return;
      await api.drafts.undismissWarning(state.context.draftId, issueId);
      setDismissedIssueIds((prev) => {
        const next = new Set(prev);
        next.delete(issueId);
        return next;
      });
    },
    [state.context.draftId],
  );

  const renderContent = () => {
    if (state.matches("capture")) {
      return (
        <CaptureView
          pages={state.context.capturedPages}
          onCapture={(uri) => send({ type: "PAGE_CAPTURED", imageUri: uri })}
          onDone={() => send({ type: "DONE_CAPTURING" })}
          onCancel={handleCancel}
        />
      );
    }

    if (state.matches("reorder")) {
      return (
        <ReorderView
          pages={state.context.capturedPages}
          onReorder={(order) => send({ type: "REORDER", pageOrder: order })}
          onConfirm={() => send({ type: "CONFIRM_ORDER" })}
          onCancel={handleCancel}
        />
      );
    }

    if (
      state.matches("parsing") ||
      state.matches("resuming") ||
      state.matches("uploading") ||
      state.matches("creatingUrlDraft")
    ) {
      return <ParsingView />;
    }

    if (state.matches("previewEdit") && state.context.editedCandidate) {
      return (
        <PreviewEditView
          candidate={state.context.editedCandidate}
          validationResult={state.context.validationResult}
          dismissedIssueIds={dismissedIssueIds}
          onEdit={handleEdit}
          onSave={() => send({ type: "ATTEMPT_SAVE" })}
          onEnterCorrection={() => send({ type: "ENTER_CORRECTION" })}
          onDismissWarning={handleDismissWarning}
          onUndismissWarning={handleUndismissWarning}
          onCancel={handleCancel}
        />
      );
    }

    if (state.matches("retakeRequired")) {
      return (
        <RetakeRequiredView
          pages={state.context.capturedPages.map((p) => ({
            ...p,
            retakeCount: 0,
          }))}
          issues={state.context.validationResult?.issues ?? []}
          onRetake={(pageId) =>
            send({ type: "RETAKE_SUBMITTED", imageUri: "" })
          }
          onEnterCorrection={() => send({ type: "ENTER_CORRECTION" })}
        />
      );
    }

    if (
      state.matches("guidedCorrection") &&
      state.context.editedCandidate
    ) {
      return (
        <GuidedCorrectionView
          candidate={state.context.editedCandidate}
          validationResult={state.context.validationResult}
          sourceImageUris={state.context.capturedPages.map((p) => p.imageUri)}
          onEdit={handleEdit}
          onComplete={(candidate) =>
            send({ type: "CORRECTION_COMPLETE", candidate })
          }
        />
      );
    }

    if (state.matches("finalWarningGate")) {
      const warnings =
        state.context.validationResult?.issues.filter(
          (i) => i.severity === "FLAG",
        ) ?? [];
      return (
        <WarningGateView
          warnings={warnings}
          onReview={() => send({ type: "REVIEW_REQUESTED" })}
          onSaveAnyway={() => send({ type: "SAVE_ANYWAY" })}
          onCancel={handleCancel}
        />
      );
    }

    if (state.matches("saved")) {
      return (
        <SavedView
          recipeId={state.context.savedRecipeId}
          onViewRecipe={(id) =>
            navigation.replace("RecipeDetail", { recipeId: id })
          }
          onDone={() => navigation.navigate("Home")}
        />
      );
    }

    return <ParsingView />;
  };

  return <View style={styles.container}>{renderContent()}</View>;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
