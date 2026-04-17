import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, StyleSheet, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMachine } from "@xstate/react";
import { importMachine, buildImportEventProps } from "../features/import/machine";
import { CaptureView } from "../features/import/CaptureView";
import { ReorderView } from "../features/import/ReorderView";
import { ParsingView } from "../features/import/ParsingView";
import { PreviewEditView } from "../features/import/PreviewEditView";
import { RetakeRequiredView } from "../features/import/RetakeRequiredView";
import { SavedView } from "../features/import/SavedView";
import { UrlInputView } from "../features/import/UrlInputView";
import { enqueueImport } from "../features/import/enqueueImport";
import { api } from "../services/api";
import { analytics } from "../services/analytics";
import { useImportQueueStore } from "../stores/importQueue.store";
import { useRecipesStore } from "../stores/recipes.store";
import type { EditedRecipeCandidate } from "@orzo/shared";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";
import { WHITE } from "../theme/colors";

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
    fromHub,
  } = route.params ?? {
    mode: "image" as const,
  };
  const insets = useSafeAreaInsets();
  const [state, send] = useMachine(importMachine);
  const [awaitingUrl, setAwaitingUrl] = useState(mode === "url" && !url);
  const [parseRevealToken, setParseRevealToken] = useState(0);
  const wasParsingRef = useRef(false);
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

  /** Track the queue localId for this enqueued import, so we can show queue-aware ParsingView */
  const [enqueuedLocalId, setEnqueuedLocalId] = useState<string | null>(null);
  /** Whether this screen is in the concurrent flow (enqueue path, not XState) */
  const [isConcurrentFlow, setIsConcurrentFlow] = useState(false);

  const queueEntries = useImportQueueStore((s) => s.entries);
  const clearReviewing = useImportQueueStore((s) => s.clearReviewing);
  const removeEntry = useImportQueueStore((s) => s.removeEntry);
  const updateEntry = useImportQueueStore((s) => s.updateEntry);

  /** Find the queue entry by resumeDraftId if this is a hub review */
  const hubEntry = fromHub && resumeDraftId
    ? queueEntries.find((e) => e.draftId === resumeDraftId)
    : null;

  /** Clean up reviewing status on unmount if coming from hub */
  useEffect(() => {
    if (!fromHub || !hubEntry) return;
    return () => {
      const current = useImportQueueStore.getState().entries.find(
        (e) => e.draftId === resumeDraftId,
      );
      if (current?.status === "reviewing") {
        clearReviewing(current.localId);
      }
    };
  }, [fromHub, resumeDraftId]);

  useEffect(() => {
    const inParsing = state.matches("parsing");
    if (wasParsingRef.current && state.matches("previewEdit") && state.context.editedCandidate) {
      setParseRevealToken((n) => n + 1);
    }
    wasParsingRef.current = inParsing;
  }, [state, state.context.editedCandidate]);

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

    // Concurrent image flow: use enqueueImport instead of XState upload/parse
    if (mode === "image" && photoUri) {
      lastBootKeyRef.current = bootKey;
      setIsConcurrentFlow(true);
      analytics.track("import_started", { source: "photos" });
      enqueueImport({
        pages: [{ uri: photoUri, mimeType: photoMimeType, fileName: photoFileName }],
      })
        .then((localId) => setEnqueuedLocalId(localId))
        .catch(() => navigation.navigate("Home", {}));
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
      [{ text: "OK", onPress: () => fromHub ? navigation.navigate("ImportHub") : navigation.navigate("Home", {}) }],
    );
  }, [state.value, state.context.error, navigation, fromHub]);

  React.useEffect(() => {
    if (state.matches("timedOut")) {
      Alert.alert(
        "Oops!",
        "That took a little too long. Don\u2019t worry \u2014 go ahead and try again!",
        [{ text: "OK", onPress: () => fromHub ? navigation.navigate("ImportHub") : navigation.navigate("Home", {}) }],
      );
    }
  }, [state.value]);

  // Hub review: skip SavedView, navigate back to hub after save
  useEffect(() => {
    if (!fromHub) return;
    if (!state.matches("saved")) return;

    if (hubEntry) {
      removeEntry(hubEntry.localId);
    }
    useRecipesStore.getState().fetchRecipes();
    navigation.navigate("ImportHub");
  }, [state.value, fromHub, hubEntry, removeEntry, navigation]);

  const [dismissedIssueIds, setDismissedIssueIds] = useState<Set<string>>(
    new Set(),
  );
  const [candidateSyncPending, setCandidateSyncPending] = useState(false);

  const handleCancel = useCallback(() => {
    const cancelAction = async () => {
      analytics.track(
        "import_dismissed",
        buildImportEventProps(state.context, {
          dismissed_from: String(state.value),
        }),
      );
      if (fromHub && state.context.draftId) {
        try {
          await api.drafts.cancel(state.context.draftId);
        } catch { /* best-effort */ }
        if (hubEntry) {
          removeEntry(hubEntry.localId);
        }
        navigation.navigate("ImportHub");
      } else {
        navigation.navigate("Home", {});
      }
    };

    Alert.alert("Cancel Import", "Are you sure you want to cancel this import?", [
      { text: "Keep Going", style: "cancel" },
      { text: "Cancel Import", style: "destructive", onPress: cancelAction },
    ]);
  }, [navigation, fromHub, state.context, state.value, hubEntry, removeEntry]);

  const handleEdit = useCallback(
    async (candidate: EditedRecipeCandidate) => {
      if (!state.context.draftId) return;
      setCandidateSyncPending(true);
      try {
        const { validationResult } = await api.drafts.updateCandidate(
          state.context.draftId,
          candidate,
        );
        send({
          type: "EDIT_CANDIDATE",
          candidate,
          validationResult,
        });
      } catch {
        /* keep prior context; user can retry edit */
      } finally {
        setCandidateSyncPending(false);
      }
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

  const handleImportAnother = useCallback(() => {
    navigation.navigate("Home", { openFab: true });
  }, [navigation]);

  const handleReviewRecipes = useCallback(() => {
    navigation.navigate("ImportHub");
  }, [navigation]);

  // For the concurrent (enqueue) flow, handle capture → enqueue transition
  const handleConcurrentCaptureDone = useCallback(
    (pages: { uri: string; mimeType?: string; fileName?: string }[]) => {
      setIsConcurrentFlow(true);
      analytics.track("import_started", { source: "camera" });
      enqueueImport({ pages })
        .then((localId) => setEnqueuedLocalId(localId))
        .catch(() => navigation.navigate("Home", {}));
    },
    [navigation],
  );

  /** After retake camera: upload replacement page, then hub → goBack + queue parsing, or stay in flow → XState parsing. */
  const submitRetakeCapture = useCallback(
    async (input: {
      capturedPages: { imageUri: string }[];
      draftId: string;
      retakePageId: string;
    }) => {
      const { capturedPages, draftId, retakePageId } = input;
      if (capturedPages.length === 0) return;
      const imageUri = capturedPages[capturedPages.length - 1].imageUri;

      try {
        await api.drafts.retakePage(draftId, retakePageId, imageUri);

        if (fromHub) {
          const entry = useImportQueueStore
            .getState()
            .entries.find((e) => e.draftId === draftId);
          if (entry) {
            updateEntry(entry.localId, {
              status: "parsing",
              thumbnailUri: imageUri,
              preReviewStatus: undefined,
            });
          }
          try {
            await api.drafts.parse(draftId);
          } catch {
            // Poller will pick up server-side status
          }
          if (navigation.canGoBack()) {
            navigation.goBack();
          } else {
            navigation.navigate("ImportHub");
          }
          return;
        }

        send({ type: "RETAKE_SUBMITTED", imageUri });
      } catch {
        Alert.alert(
          "Retake failed",
          "Couldn\u2019t upload the photo. Please try again.",
        );
      }
    },
    [fromHub, navigation, send, updateEntry],
  );

  const renderContent = () => {
    if (awaitingUrl) {
      return (
        <UrlInputView
          onSubmit={(submittedUrl) => {
            setAwaitingUrl(false);
            send({ type: "NEW_URL_IMPORT", url: submittedUrl });
          }}
          onCancel={() => navigation.navigate("Home", {})}
        />
      );
    }

    // Concurrent flow: show ParsingView with queue context after enqueue
    // Never show this when reviewing from the hub (fromHub uses XState resume path)
    if (isConcurrentFlow && !fromHub) {
      return (
        <ParsingView
          queueEntries={queueEntries}
          onImportAnother={handleImportAnother}
          onReviewRecipes={handleReviewRecipes}
        />
      );
    }

    if (state.matches("capture")) {
      return (
        <CaptureView
          pages={state.context.capturedPages}
          onCapture={(uri) => send({ type: "PAGE_CAPTURED", imageUri: uri })}
          onDone={() => {
            const pages = state.context.capturedPages;
            const draftId = state.context.draftId;
            const retakePageId = state.context.retakePageId;
            if (pages.length === 0) return;

            if (draftId && retakePageId) {
              void submitRetakeCapture({
                capturedPages: pages,
                draftId,
                retakePageId,
              });
              return;
            }

            handleConcurrentCaptureDone(
              pages.map((p) => ({
                uri: p.imageUri,
                mimeType: p.mimeType,
                fileName: p.fileName,
              })),
            );
          }}
          onCancel={handleCancel}
        />
      );
    }

    if (state.matches("reorder")) {
      return (
        <ReorderView
          pages={state.context.capturedPages}
          onReorder={(order) => send({ type: "REORDER", pageOrder: order })}
          onConfirm={() => {
            const pages = state.context.capturedPages;
            const draftId = state.context.draftId;
            const retakePageId = state.context.retakePageId;
            if (pages.length === 0) return;

            if (draftId && retakePageId) {
              void submitRetakeCapture({
                capturedPages: pages,
                draftId,
                retakePageId,
              });
              return;
            }

            handleConcurrentCaptureDone(
              pages.map((p) => ({
                uri: p.imageUri,
                mimeType: p.mimeType,
                fileName: p.fileName,
              })),
            );
          }}
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
      const otherReadyCount = fromHub
        ? queueEntries.filter(
            (e) =>
              e.draftId !== resumeDraftId &&
              (e.status === "parsed" || e.status === "needs_retake"),
          ).length
        : 0;

      return (
        <PreviewEditView
          candidate={state.context.editedCandidate}
          parsedMetadata={state.context.parsedCandidate?.metadata ?? null}
          validationResult={state.context.validationResult}
          dismissedIssueIds={dismissedIssueIds}
          heroImageUrl={
            state.context.parsedCandidate?.metadata?.imageUrl ??
            state.context.capturedPages[0]?.imageUri ??
            null
          }
          parseRevealToken={parseRevealToken}
          onEdit={handleEdit}
          onSave={() => {
            analytics.track(
              "import_save_attempted",
              buildImportEventProps(state.context),
            );
            send({ type: "ATTEMPT_SAVE" });
          }}
          onDismissWarning={handleDismissWarning}
          onUndismissWarning={handleUndismissWarning}
          onCancel={handleCancel}
          otherReadyCount={otherReadyCount}
          candidateSyncPending={candidateSyncPending}
        />
      );
    }

    if (state.matches("retakeRequired")) {
      return (
        <RetakeRequiredView
          pages={state.context.capturedPages.map((p) => ({
            ...p,
            retakeCount: p.retakeCount ?? 0,
          }))}
          issues={state.context.validationResult?.issues ?? []}
          onRetake={(pageId) => send({ type: "RETAKE_PAGE", pageId })}
          isPhotosEntry={state.context.imageEntry === "photos"}
          onGoHome={() => fromHub ? navigation.navigate("ImportHub") : navigation.navigate("Home", {})}
        />
      );
    }

    if (state.matches("saved") && !fromHub) {
      return (
        <SavedView
          recipeId={state.context.savedRecipeId}
          onViewRecipe={(id) =>
            navigation.replace("RecipeDetail", { recipeId: id })
          }
          onAddMore={() => {
            if (state.context.imageEntry === "photos" || mode === "url") {
              navigation.navigate("Home", {});
            } else {
              navigation.replace("ImportFlow", { mode: "image" });
            }
          }}
          addMoreLabel={state.context.imageEntry === "photos" ? "Import Another" : "Add More"}
          onDone={() => navigation.navigate("Home", {})}
        />
      );
    }

    return <ParsingView />;
  };

  const isFullBleed = (state.matches("capture") && !isConcurrentFlow) || awaitingUrl;
  return (
    <View
      style={[
        styles.container,
        !isFullBleed && {
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
          backgroundColor: WHITE,
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
