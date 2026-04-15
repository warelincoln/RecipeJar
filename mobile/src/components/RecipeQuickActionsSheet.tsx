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
import { LUCIDE } from "../theme/lucideSizes";
import {
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  TEXT_TERTIARY,
  DIVIDER,
  SURFACE,
  PRIMARY_LIGHT,
  TINT_RED,
  ERROR,
  WHITE,
  BLACK,
  DEEP_TERRACOTTA,
} from "../theme/colors";

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
  /** Shown in accent color when `emphasisLabel` is not set (e.g. recipe title). */
  recipeTitle?: string;
  /** Overrides `recipeTitle` for the accent line (e.g. folder name). */
  emphasisLabel?: string;
  title?: string;
  subtitle?: string;
  actions: RecipeQuickAction[];
};

export function RecipeQuickActionsSheet({
  visible,
  onClose,
  recipeTitle = "",
  emphasisLabel,
  title = "Recipe",
  subtitle = "Choose an action for this recipe.",
  actions,
}: QuickActionsProps) {
  const insets = useSafeAreaInsets();
  const primary = actions.filter((a) => !a.destructive);
  const danger = actions.filter((a) => a.destructive);
  const accentLine = emphasisLabel ?? recipeTitle;

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
            <X size={LUCIDE.lg} color={TEXT_SECONDARY} />
          </TouchableOpacity>
          <Text style={styles.sheetTitle}>{title}</Text>
          {accentLine.length > 0 ? (
            <Text style={styles.recipeName} numberOfLines={2}>
              {accentLine}
            </Text>
          ) : null}
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
            <X size={LUCIDE.lg} color={TEXT_SECONDARY} />
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
              <ActivityIndicator color={ERROR} />
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
    backgroundColor: PRIMARY_LIGHT,
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
    color: TEXT_PRIMARY,
    marginBottom: 8,
    textAlign: "center",
    paddingHorizontal: 40,
  },
  recipeName: {
    fontSize: 17,
    fontWeight: "600",
    color: DEEP_TERRACOTTA,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 6,
    paddingHorizontal: 16,
  },
  subtitle: {
    fontSize: 14,
    color: TEXT_SECONDARY,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  confirmLead: {
    fontSize: 16,
    fontWeight: "600",
    color: TEXT_TERTIARY,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 8,
    paddingHorizontal: 8,
  },
  confirmHint: {
    fontSize: 14,
    color: TEXT_SECONDARY,
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
    backgroundColor: WHITE,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 12,
    shadowColor: BLACK,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  rowIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: SURFACE,
    alignItems: "center",
    justifyContent: "center",
  },
  rowLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    color: TEXT_PRIMARY,
    paddingTop: 2,
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
    backgroundColor: TINT_RED,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: TINT_RED,
  },
  dangerIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: TINT_RED,
    alignItems: "center",
    justifyContent: "center",
  },
  dangerLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    color: ERROR,
    paddingTop: 2,
  },
  cancelBtn: {
    backgroundColor: WHITE,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: DIVIDER,
    marginBottom: 10,
    shadowColor: BLACK,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  cancelBtnText: {
    fontSize: 16,
    fontWeight: "600",
    color: TEXT_TERTIARY,
  },
  deleteBtn: {
    backgroundColor: TINT_RED,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: TINT_RED,
    minHeight: 50,
    justifyContent: "center",
  },
  deleteBtnText: {
    fontSize: 16,
    fontWeight: "600",
    color: ERROR,
  },
  btnDisabled: {
    opacity: 0.55,
  },
});

type DeleteCollectionConfirmProps = {
  visible: boolean;
  onClose: () => void;
  collectionName: string;
  recipeCount: number;
  onConfirm: () => void | Promise<void>;
};

export function DeleteCollectionConfirmSheet({
  visible,
  onClose,
  collectionName,
  recipeCount,
  onConfirm,
}: DeleteCollectionConfirmProps) {
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

  const countLine =
    recipeCount === 0
      ? "There are no recipes in this folder."
      : recipeCount === 1
        ? "1 recipe will move to your home screen (uncategorized)."
        : `${recipeCount} recipes will move to your home screen (uncategorized).`;

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
          accessibilityLabel="Dismiss delete folder confirmation backdrop"
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
            testID="collection-delete-confirm-close"
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
          >
            <X size={LUCIDE.lg} color={TEXT_SECONDARY} />
          </TouchableOpacity>
          <Text style={styles.sheetTitle}>Delete folder?</Text>
          <Text style={styles.confirmLead} numberOfLines={3}>
            &ldquo;{collectionName}&rdquo; will be removed.
          </Text>
          <Text style={styles.confirmLead}>{countLine}</Text>
          <Text style={styles.confirmHint}>
            Your recipes stay in your library—they are not deleted.
          </Text>

          <TouchableOpacity
            style={[styles.cancelBtn, busy && styles.btnDisabled]}
            onPress={onClose}
            disabled={busy}
            testID="collection-delete-confirm-cancel"
            accessibilityRole="button"
          >
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.deleteBtn, busy && styles.btnDisabled]}
            onPress={() => void handleConfirm()}
            disabled={busy}
            testID="collection-delete-confirm-delete"
            accessibilityRole="button"
          >
            {busy ? (
              <ActivityIndicator color={ERROR} />
            ) : (
              <Text style={styles.deleteBtnText}>Delete folder</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
