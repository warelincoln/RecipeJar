import { Alert } from "react-native";
import { api } from "../../services/api";
import { useImportQueueStore } from "../../stores/importQueue.store";

interface EnqueueInput {
  pages: { uri: string; mimeType?: string; fileName?: string }[];
}

function generateLocalId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const MAX_UPLOAD_RETRIES = 2;

export async function enqueueImport(input: EnqueueInput): Promise<string> {
  const { addEntry, updateEntry, removeEntry } =
    useImportQueueStore.getState();

  const localId = generateLocalId();
  const thumbnailUri = input.pages[0]?.uri ?? "";

  addEntry({
    localId,
    draftId: null,
    status: "uploading",
    thumbnailUri,
    addedAt: Date.now(),
  });

  let draftId: string | null = null;
  let attempt = 0;

  while (attempt <= MAX_UPLOAD_RETRIES) {
    try {
      const draft = await api.drafts.create();
      draftId = draft.id;
      updateEntry(localId, { draftId });

      for (const page of input.pages) {
        await api.drafts.addPage(draftId, page.uri, page.mimeType, page.fileName);
      }

      break;
    } catch (err) {
      attempt++;
      if (attempt > MAX_UPLOAD_RETRIES) {
        if (draftId) {
          try {
            await api.drafts.cancel(draftId);
          } catch {
            // best-effort cleanup
          }
        }
        removeEntry(localId);
        Alert.alert(
          "Upload Failed",
          "Couldn't upload your recipe photo. Please try again.",
        );
        throw err;
      }
      await new Promise((r) => setTimeout(r, 1000 * attempt));
      if (draftId) {
        try {
          await api.drafts.cancel(draftId);
        } catch {
          // best-effort cleanup before retry
        }
        draftId = null;
        updateEntry(localId, { draftId: null });
      }
    }
  }

  updateEntry(localId, { status: "parsing" });

  try {
    await api.drafts.parse(draftId!);
  } catch {
    // Parse trigger failed — the entry stays in "parsing" and the poller
    // will eventually pick up the server-side status
  }

  return localId;
}
