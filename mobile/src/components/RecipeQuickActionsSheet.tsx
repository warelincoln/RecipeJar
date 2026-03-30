import { useEffect, useState, type ReactNode } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X } from "lucide-react-native";

export type RecipeQuickAction = {
  key: string;
  label: string;
  destructive?: boolean;
  icon?: ReactNode;
  onPress: () => void | Promise<void>;
  testID?: string;
};

type QuickActionsProps = {
  visible: boolean;
  onClose: () => void;
  recipeTitle: string;
  title?: string;
  subtitle?: string;
  actions: RecipeQuickAction[];
};

export function RecipeQuickActionsSheet({
  visible,
  onClose,
  recipeTitle,
  title = "Recipe",
  subtitle = "Choose an action for this recipe.",
  actions,
}: QuickActionsProps) {
  const insets = useSafeAreaInsets();
  const primary = actions.filter((a) => !a.destructive);
  const danger = actions.filter((a) => a.destructive);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalRoot}>
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={onClose}
          accessibilityLabel="Dismiss recipe actions backdrop"
        />
        <View
          style={[
            styles.sheet,
            {
              paddingBottom: insets.bottom + 20,
              paddingHorizontal: 20,
            },
          ]}
        >
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={onClose}
            hitSlop={14}
            testID="recipe-quick-actions-close"
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
          >
            <X size={24} color="#6b7280" />
          </TouchableOpacity>
          <Text style={styles.sheetTitle}>{title}</Text>
          <Text style={styles.recipeName} numberOfLines={2}>
            {recipeTitle}
          </Text>
          <Text style={styles.subtitle}>{subtitle}</Text>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bounces={actions.length > 4}
          >
            <View style={styles.actionStack}>
              {primary.map((a, i) => (
                <View key={a.key}>
                  {i > 0 ? <View style={styles.rowSep} /> : null}
                  <TouchableOpacity
                    style={styles.row}
                    onPress={() => void a.onPress()}
                    testID={a.testID}
                    accessibilityRole="button"
                    accessibilityLabel={a.label}
                  >
                    {a.icon ? (
                      <View style={styles.rowIconWrap}>{a.icon}</View>
                    ) : null}
                    <Text style={styles.rowLabel} numberOfLines={2}>
                      {a.label}
                    </Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>

            {danger.length > 0 ? (
              <View style={styles.dangerBlock}>
                {danger.map((a, i) => (
                  <View key={a.key}>
                    {i > 0 ? <View style={styles.dangerSep} /> : null}
                    <TouchableOpacity
                      style={styles.dangerRow}
                      onPress={() => void a.onPress()}
                      testID={a.testID}
                      accessibilityRole="button"
                      accessibilityLabel={a.label}
                    >
                      {a.icon ? (
                        <View style={styles.dangerIconWrap}>{a.icon}</View>
                      ) : null}
                      <Text style={styles.dangerLabel} numberOfLines={2}>
                        {a.label}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

type DeleteConfirmProps = {
  visible: boolean;
  onClose: () => void;
  recipeTitle: string;
  onConfirm: () => void | Promise<void>;
};

export function RecipeDeleteConfirmSheet({
  visible,
  onClose,
  recipeTitle,
  onConfirm,
}: DeleteConfirmProps) {
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) setBusy(false);
  }, [visible]);

  const handleConfirm = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={() => {
        if (!busy) onClose();
      }}
    >
      <View style={styles.modalRoot}>
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={() => {
            if (!busy) onClose();
          }}
          accessibilityLabel="Dismiss delete confirmation backdrop"
        />
        <View
          style={[
            styles.sheet,
            {
              paddingBottom: insets.bottom + 20,
              paddingHorizontal: 20,
            },
          ]}
        >
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={busy ? undefined : onClose}
            disabled={busy}
            hitSlop={14}
            testID="recipe-delete-confirm-close"
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
          >
            <X size={24} color="#6b7280" />
          </TouchableOpacity>
          <Text style={styles.sheetTitle}>Delete recipe?</Text>
          <Text style={styles.confirmLead} numberOfLines={3}>
            &ldquo;{recipeTitle}&rdquo; will be permanently removed.
          </Text>
          <Text style={styles.confirmHint}>This cannot be undone.</Text>

          <TouchableOpacity
            style={[styles.cancelBtn, busy && styles.btnDisabled]}
            onPress={onClose}
            disabled={busy}
            testID="recipe-delete-confirm-cancel"
            accessibilityRole="button"
          >
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.deleteBtn, busy && styles.btnDisabled]}
            onPress={() => void handleConfirm()}
            disabled={busy}
            testID="recipe-delete-confirm-delete"
            accessibilityRole="button"
          >
            {busy ? (
              <ActivityIndicator color="#dc2626" />
            ) : (
              <Text style={styles.deleteBtnText}>Delete recipe</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  sheet: {
    backgroundColor: "#eff6ff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 36,
    maxHeight: "78%",
  },
  closeBtn: {
    position: "absolute",
    right: 12,
    top: 12,
    zIndex: 2,
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 8,
    textAlign: "center",
    paddingHorizontal: 40,
  },
  recipeName: {
    fontSize: 17,
    fontWeight: "600",
    color: "#1e40af",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 6,
    paddingHorizontal: 16,
  },
  subtitle: {
    fontSize: 14,
    color: "#6b7280",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  confirmLead: {
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 8,
    paddingHorizontal: 8,
  },
  confirmHint: {
    fontSize: 14,
    color: "#6b7280",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 22,
    paddingHorizontal: 8,
  },
  actionStack: {
    marginBottom: 4,
  },
  rowSep: {
    height: 10,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  rowIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#f9fafb",
    alignItems: "center",
    justifyContent: "center",
  },
  rowLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  dangerBlock: {
    marginTop: 10,
  },
  dangerSep: {
    height: 10,
  },
  dangerRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fef2f2",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  dangerIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#fee2e2",
    alignItems: "center",
    justifyContent: "center",
  },
  dangerLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    color: "#dc2626",
  },
  cancelBtn: {
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  cancelBtnText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
  },
  deleteBtn: {
    backgroundColor: "#fef2f2",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#fecaca",
    minHeight: 50,
    justifyContent: "center",
  },
  deleteBtnText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#dc2626",
  },
  btnDisabled: {
    opacity: 0.55,
  },
});
