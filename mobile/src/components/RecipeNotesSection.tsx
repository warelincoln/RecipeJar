import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Modal,
  Pressable,
  Alert,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { NOTE_MAX_LENGTH } from "@orzo/shared";
import type { RecipeNote } from "@orzo/shared";
import {
  PRIMARY,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  DIVIDER,
  ERROR,
  SURFACE,
  WHITE,
} from "../theme/colors";

interface RecipeNotesSectionProps {
  notes: RecipeNote[];
  onAdd: (text: string) => Promise<void>;
  onEdit: (noteId: string, text: string) => Promise<void>;
  onDelete: (noteId: string) => Promise<void>;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function isEdited(note: RecipeNote): boolean {
  const created = new Date(note.createdAt).getTime();
  const updated = new Date(note.updatedAt).getTime();
  return updated - created > 1000;
}

export function RecipeNotesSection({
  notes,
  onAdd,
  onEdit,
  onDelete,
}: RecipeNotesSectionProps) {
  const [modalVisible, setModalVisible] = useState(false);
  const [editingNote, setEditingNote] = useState<RecipeNote | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const trimmed = draft.trim();
  const canSave =
    trimmed.length > 0 && trimmed.length <= NOTE_MAX_LENGTH && !saving;

  function openAdd() {
    setEditingNote(null);
    setDraft("");
    setModalVisible(true);
  }

  function openEdit(note: RecipeNote) {
    setEditingNote(note);
    setDraft(note.text);
    setModalVisible(true);
  }

  function close() {
    setModalVisible(false);
    setEditingNote(null);
    setDraft("");
  }

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    try {
      if (editingNote) {
        await onEdit(editingNote.id, trimmed);
      } else {
        await onAdd(trimmed);
      }
      close();
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete(noteId: string) {
    Alert.alert(
      "Delete Note",
      "Are you sure you want to delete this note?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => onDelete(noteId),
        },
      ],
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>Notes</Text>
        <TouchableOpacity
          onPress={openAdd}
          style={styles.addButton}
          testID="notes-add"
          accessibilityRole="button"
          accessibilityLabel="Add note"
        >
          <Text style={styles.addButtonText}>+ Add Note</Text>
        </TouchableOpacity>
      </View>

      {notes.length === 0 && (
        <Text style={styles.emptyText}>No notes yet.</Text>
      )}

      {notes.map((note) => (
        <TouchableOpacity
          key={note.id}
          style={styles.noteCard}
          onPress={() => openEdit(note)}
          onLongPress={() => confirmDelete(note.id)}
          activeOpacity={0.7}
          testID={`note-${note.id}`}
        >
          <Text style={styles.noteText}>{note.text}</Text>
          <View style={styles.noteMeta}>
            <Text style={styles.noteDate}>{formatDate(note.createdAt)}</Text>
            {isEdited(note) && (
              <Text style={styles.editedLabel}>Edited</Text>
            )}
          </View>
        </TouchableOpacity>
      ))}

      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={close}
      >
        <KeyboardAvoidingView
          style={styles.modalKeyboardView}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <Pressable style={styles.modalBackdrop} onPress={close}>
            <Pressable style={styles.modalCard} onPress={() => {}}>
              <Text style={styles.modalTitle}>
                {editingNote ? "Edit Note" : "Add Note"}
              </Text>
              <TextInput
                style={styles.modalInput}
                value={draft}
                onChangeText={setDraft}
                placeholder="Write a note..."
                placeholderTextColor={TEXT_SECONDARY}
                multiline
                maxLength={NOTE_MAX_LENGTH}
                autoFocus
                testID="note-input"
              />
              <Text
                style={[
                  styles.charCounter,
                  trimmed.length > NOTE_MAX_LENGTH && styles.charCounterOver,
                ]}
              >
                {trimmed.length} / {NOTE_MAX_LENGTH}
              </Text>
              <View style={styles.modalActions}>
                <TouchableOpacity onPress={close} style={styles.cancelBtn}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleSave}
                  style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}
                  disabled={!canSave}
                  testID="note-save"
                >
                  <Text style={styles.saveBtnText}>
                    {saving ? "Saving..." : "Save"}
                  </Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 24,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "700",
  },
  addButton: {
    backgroundColor: PRIMARY,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  addButtonText: {
    color: WHITE,
    fontSize: 13,
    fontWeight: "600",
  },
  emptyText: {
    fontSize: 14,
    color: TEXT_SECONDARY,
    fontStyle: "italic",
  },
  noteCard: {
    backgroundColor: SURFACE,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  noteText: {
    fontSize: 14,
    lineHeight: 20,
    color: TEXT_PRIMARY,
  },
  noteMeta: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
    gap: 8,
  },
  noteDate: {
    fontSize: 11,
    color: TEXT_SECONDARY,
  },
  editedLabel: {
    fontSize: 11,
    color: TEXT_SECONDARY,
    fontStyle: "italic",
  },
  modalKeyboardView: {
    flex: 1,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalCard: {
    backgroundColor: WHITE,
    borderRadius: 16,
    padding: 20,
    width: "100%",
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 12,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: DIVIDER,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    lineHeight: 22,
    minHeight: 100,
    textAlignVertical: "top",
    color: TEXT_PRIMARY,
  },
  charCounter: {
    fontSize: 12,
    color: TEXT_SECONDARY,
    textAlign: "right",
    marginTop: 4,
  },
  charCounterOver: {
    color: ERROR,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    marginTop: 16,
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  cancelBtnText: {
    fontSize: 15,
    color: TEXT_SECONDARY,
    fontWeight: "600",
  },
  saveBtn: {
    backgroundColor: PRIMARY,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  saveBtnDisabled: {
    opacity: 0.4,
  },
  saveBtnText: {
    color: WHITE,
    fontSize: 15,
    fontWeight: "600",
  },
});
