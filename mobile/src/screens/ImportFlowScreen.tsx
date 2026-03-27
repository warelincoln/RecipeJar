import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, StyleSheet, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMachine } from "@xstate/react";
import { importMachine } from "../features/import/machine";
import { CaptureView } from "../features/import/CaptureView";
import { ReorderView } from "../features/import/ReorderView";
import { ParsingView } from "../features/import/ParsingView";
import { PreviewEditView } from "../features/import/PreviewEditView";
import { RetakeRequiredView } from "../features/import/RetakeRequiredView";
import { SavedView } from "../features/import/SavedView";
import { UrlInputView } from "../features/import/UrlInputView";
import { api } from "../services/api";
import type { EditedRecipeCandidate } from "@recipejar/shared";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "ImportFlow">;

export function ImportFlowScreen({ route, navigation }: Props) {
  const {
    mode,
    url,
    urlHtml,
    urlAcquisitionMethod,
    urlCaptureFailureReason,
    resumeDraftId,
    photoUri,
    photoMimeType,
    photoFileName,
  } = route.params ?? {
    mode: "image" as const,
  };
  const insets = useSafeAreaInsets();
  const [state, send] = useMachine(importMachine);
  const [awaitingUrl, setAwaitingUrl] = useState(mode === "url" && !url);
  /** Avoid duplicate bootstraps; also avoids retry loops when URL draft creation errors back to idle. */
  const lastBootKeyRef = useRef<string | null>(null);
  const bootKey = [
    mode,
    url ?? "",
    resumeDraftId ?? "",
    photoUri ?? "",
    urlAcquisitionMethod ?? "",
    urlCaptureFailureReason ?? "",
    urlHtml ? String(urlHtml.length) : "",
  ].join("|");

  useEffect(() => {
    if (awaitingUrl) return;
    if (!state.matches("idle")) return;
    if (lastBootKeyRef.current === bootKey) return;

    if (resumeDraftId) {
      lastBootKeyRef.current = bootKey;
      send({ type: "RESUME_DRAFT", draftId: resumeDraftId });
      return;
    }
    if (mode === "url" && url) {
      lastBootKeyRef.current = bootKey;
      send({
        type: "NEW_URL_IMPORT",
        url,
        urlHtml,
        urlAcquisitionMethod,
        urlCaptureFailureReason,
      });
      return;
    }
    if (mode === "image" && photoUri) {
      lastBootKeyRef.current = bootKey;
      send({
        type: "PHOTOS_SELECTED",
        imageUris: [{ uri: photoUri, type: photoMimeType, fileName: photoFileName }],
      });
      return;
    }
    if (mode === "image") {
      lastBootKeyRef.current = bootKey;
      send({ type: "NEW_IMAGE_IMPORT" });
    }
  }, [
    awaitingUrl,
    bootKey,
    mode,
    url,
    urlHtml,
    urlAcquisitionMethod,
    urlCaptureFailureReason,
    resumeDraftId,
    photoUri,
    photoMimeType,
    photoFileName,
    state.value,
    send,
  ]);

  const idleErrorAlertedRef = useRef<string | null>(null);
  useEffect(() => {
    idleErrorAlertedRef.current = null;
  }, [bootKey]);

  useEffect(() => {
    if (!state.matches("idle") || !state.context.error) return;
    if (idleErrorAlertedRef.current === state.context.error) return;
    idleErrorAlertedRef.current = state.context.error;
    Alert.alert(
      "Import didn't finish",
      state.context.error,
      [{ text: "OK", onPress: () => navigation.navigate("Home") }],
    );
  }, [state.value, state.context.error, navigation]);

  React.useEffect(() => {
    if (state.matches("timedOut")) {
      Alert.alert(
        "Oops!",
        "That took a little too long. Don\u2019t worry \u2014 go ahead and try again!",
        [{ text: "OK", onPress: () => navigation.navigate("Home") }],
      );
    }
  }, [state.value]);

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
    if (awaitingUrl) {
      return (
        <UrlInputView
          onSubmit={(submittedUrl) => {
            setAwaitingUrl(false);
            send({ type: "NEW_URL_IMPORT", url: submittedUrl });
          }}
          onCancel={() => navigation.navigate("Home")}
        />
      );
    }

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
          onRetake={() => send({ type: "RETAKE_PAGE" })}
          isPhotosEntry={state.context.imageEntry === "photos"}
          onGoHome={() => navigation.navigate("Home")}
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
          onAddMore={() => {
            if (state.context.imageEntry === "photos" || mode === "url") {
              navigation.navigate("Home");
            } else {
              navigation.replace("ImportFlow", { mode: "image" });
            }
          }}
          addMoreLabel={state.context.imageEntry === "photos" ? "Import Another" : "Add More"}
          onDone={() => navigation.navigate("Home")}
        />
      );
    }

    return <ParsingView />;
  };

  const isFullBleed = state.matches("capture") || awaitingUrl;
  return (
    <View
      style={[
        styles.container,
        !isFullBleed && {
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
          backgroundColor: "#fff",
        },
      ]}
    >
      {renderContent()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
