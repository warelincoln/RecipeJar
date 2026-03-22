import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronUp, ChevronDown, X, Plus } from "lucide-react-native";
import { api } from "../services/api";
import { useCollectionsStore } from "../stores/collections.store";
import type { Recipe } from "@recipejar/shared";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "RecipeEdit">;

interface EditableIngredient {
  text: string;
  isHeader: boolean;
}

interface EditableStep {
  text: string;
  isHeader: boolean;
}

export function RecipeEditScreen({ route, navigation }: Props) {
  const { recipeId } = route.params;
  const insets = useSafeAreaInsets();
  const { collections, fetchCollections } = useCollectionsStore();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [ingredients, setIngredients] = useState<EditableIngredient[]>([]);
  const [steps, setSteps] = useState<EditableStep[]>([]);
  const [collectionId, setCollectionId] = useState<string | null>(null);

  useEffect(() => {
    fetchCollections();
    api.recipes.get(recipeId).then((recipe: Recipe) => {
      setTitle(recipe.title);
      setDescription(recipe.description ?? "");
      setIngredients(
        (recipe.ingredients ?? []).map((i) => ({
          text: i.text,
          isHeader: i.isHeader,
        })),
      );
      setSteps((recipe.steps ?? []).map((s) => ({ text: s.text, isHeader: s.isHeader })));
      setCollectionId(recipe.collections?.[0]?.id ?? null);
      setLoading(false);
    });
  }, [recipeId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.recipes.update(recipeId, {
        title,
        description: description || null,
        collectionId,
        ingredients: ingredients.map((ing, i) => ({
          text: ing.text,
          orderIndex: i,
          isHeader: ing.isHeader,
        })),
        steps: steps.map((s, i) => ({
          text: s.text,
          orderIndex: i,
          isHeader: s.isHeader,
        })),
      });
      navigation.goBack();
    } catch {
      Alert.alert("Save Failed", "Could not save changes. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const updateIngredient = (index: number, text: string) => {
    const updated = [...ingredients];
    updated[index] = { ...updated[index], text };
    setIngredients(updated);
  };

  const removeIngredient = (index: number) => {
    setIngredients(ingredients.filter((_, i) => i !== index));
  };

  const addIngredient = () => {
    setIngredients([...ingredients, { text: "", isHeader: false }]);
  };

  const moveIngredient = (index: number, direction: -1 | 1) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= ingredients.length) return;
    const updated = [...ingredients];
    [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
    setIngredients(updated);
  };

  const updateStep = (index: number, text: string) => {
    const updated = [...steps];
    updated[index] = { ...updated[index], text };
    setSteps(updated);
  };

  const removeStep = (index: number) => {
    setSteps(steps.filter((_, i) => i !== index));
  };

  const addStep = () => {
    setSteps([...steps, { text: "", isHeader: false }]);
  };

  const moveStep = (index: number, direction: -1 | 1) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= steps.length) return;
    const updated = [...steps];
    [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
    setSteps(updated);
  };

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
      testID="recipe-edit-screen"
    >
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          testID="edit-cancel"
          accessibilityRole="button"
          accessibilityLabel="edit-cancel"
        >
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleSave}
          disabled={saving}
          testID="edit-save"
          accessibilityRole="button"
          accessibilityLabel="edit-save"
        >
          <Text style={[styles.saveText, saving && styles.saveTextDisabled]}>
            {saving ? "Saving..." : "Save"}
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>Title</Text>
      <TextInput
        style={styles.input}
        value={title}
        onChangeText={setTitle}
        placeholder="Recipe title"
        testID="edit-title-input"
      />

      <Text style={styles.sectionTitle}>Description</Text>
      <TextInput
        style={[styles.input, styles.multilineInput]}
        value={description}
        onChangeText={setDescription}
        placeholder="Optional description"
        multiline
        testID="edit-description-input"
      />

      {collections.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Collection</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.collectionPicker}>
            <TouchableOpacity
              style={[styles.collectionChip, !collectionId && styles.collectionChipActive]}
              onPress={() => setCollectionId(null)}
              testID="edit-collection-none"
            >
              <Text style={[styles.collectionChipText, !collectionId && styles.collectionChipTextActive]}>
                None
              </Text>
            </TouchableOpacity>
            {collections.map((c) => (
              <TouchableOpacity
                key={c.id}
                style={[styles.collectionChip, collectionId === c.id && styles.collectionChipActive]}
                onPress={() => setCollectionId(c.id)}
                testID={`edit-collection-${c.id}`}
              >
                <Text style={[styles.collectionChipText, collectionId === c.id && styles.collectionChipTextActive]}>
                  {c.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </>
      )}

      <Text style={styles.sectionTitle}>Ingredients ({ingredients.length})</Text>
      {ingredients.map((ing, i) => (
        <View key={i} style={styles.listItemRow}>
          <View style={styles.reorderButtons}>
            <TouchableOpacity
              onPress={() => moveIngredient(i, -1)}
              disabled={i === 0}
              testID={`edit-ingredient-up-${i}`}
            >
              <ChevronUp size={18} color={i === 0 ? "#d1d5db" : "#9ca3af"} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => moveIngredient(i, 1)}
              disabled={i === ingredients.length - 1}
              testID={`edit-ingredient-down-${i}`}
            >
              <ChevronDown size={18} color={i === ingredients.length - 1 ? "#d1d5db" : "#9ca3af"} />
            </TouchableOpacity>
          </View>
          <TextInput
            style={[styles.input, styles.listItemInput]}
            value={ing.text}
            onChangeText={(t) => updateIngredient(i, t)}
            testID={`edit-ingredient-${i}`}
          />
          <TouchableOpacity
            onPress={() => removeIngredient(i)}
            testID={`edit-ingredient-remove-${i}`}
            accessibilityRole="button"
          >
            <X size={18} color="#ef4444" />
          </TouchableOpacity>
        </View>
      ))}
      <TouchableOpacity
        style={styles.addButton}
        onPress={addIngredient}
        testID="edit-add-ingredient"
        accessibilityRole="button"
        accessibilityLabel="edit-add-ingredient"
      >
        <View style={styles.addButtonContent}>
          <Plus size={16} color="#2563eb" />
          <Text style={styles.addButtonText}>Add Ingredient</Text>
        </View>
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>Steps ({steps.filter((s) => !s.isHeader).length})</Text>
      {steps.map((step, i) =>
        step.isHeader ? (
          <View key={i} style={styles.listItemRow}>
            <View style={styles.reorderButtons}>
              <TouchableOpacity onPress={() => moveStep(i, -1)} disabled={i === 0} testID={`edit-step-up-${i}`}>
                <ChevronUp size={18} color={i === 0 ? "#d1d5db" : "#9ca3af"} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => moveStep(i, 1)} disabled={i === steps.length - 1} testID={`edit-step-down-${i}`}>
                <ChevronDown size={18} color={i === steps.length - 1 ? "#d1d5db" : "#9ca3af"} />
              </TouchableOpacity>
            </View>
            <Text style={styles.stepHeaderText}>{step.text}</Text>
            <TouchableOpacity onPress={() => removeStep(i)} testID={`edit-step-remove-${i}`} accessibilityRole="button">
              <X size={18} color="#ef4444" />
            </TouchableOpacity>
          </View>
        ) : (
          <View key={i} style={styles.listItemRow}>
            <View style={styles.reorderButtons}>
              <TouchableOpacity onPress={() => moveStep(i, -1)} disabled={i === 0} testID={`edit-step-up-${i}`}>
                <ChevronUp size={18} color={i === 0 ? "#d1d5db" : "#9ca3af"} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => moveStep(i, 1)} disabled={i === steps.length - 1} testID={`edit-step-down-${i}`}>
                <ChevronDown size={18} color={i === steps.length - 1 ? "#d1d5db" : "#9ca3af"} />
              </TouchableOpacity>
            </View>
            <TextInput
              style={[styles.input, styles.listItemInput, styles.multilineInput]}
              value={step.text}
              onChangeText={(t) => updateStep(i, t)}
              multiline
              testID={`edit-step-${i}`}
            />
            <TouchableOpacity onPress={() => removeStep(i)} testID={`edit-step-remove-${i}`} accessibilityRole="button">
              <X size={18} color="#ef4444" />
            </TouchableOpacity>
          </View>
        ),
      )}
      <TouchableOpacity
        style={styles.addButton}
        onPress={addStep}
        testID="edit-add-step"
        accessibilityRole="button"
        accessibilityLabel="edit-add-step"
      >
        <View style={styles.addButtonContent}>
          <Plus size={16} color="#2563eb" />
          <Text style={styles.addButtonText}>Add Step</Text>
        </View>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  content: { paddingHorizontal: 24 },
  loader: { flex: 1, justifyContent: "center", alignItems: "center" },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 12,
  },
  cancelText: { fontSize: 16, color: "#6b7280" },
  saveText: { fontSize: 16, fontWeight: "700", color: "#2563eb" },
  saveTextDisabled: { color: "#9ca3af" },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginTop: 20,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 4,
  },
  multilineInput: { minHeight: 60, textAlignVertical: "top" },
  collectionPicker: { flexGrow: 0, marginBottom: 8 },
  collectionChip: {
    backgroundColor: "#f3f4f6",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
  },
  collectionChipActive: { backgroundColor: "#2563eb" },
  collectionChipText: { fontSize: 14, fontWeight: "500", color: "#374151" },
  collectionChipTextActive: { color: "#fff" },
  listItemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  reorderButtons: { gap: 2 },
  listItemInput: { flex: 1, marginBottom: 0 },
  stepHeaderText: {
    flex: 1, fontSize: 15, fontWeight: "600", fontStyle: "italic",
    color: "#374151", paddingVertical: 10,
  },
  addButton: {
    paddingVertical: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    borderStyle: "dashed",
    marginTop: 4,
  },
  addButtonContent: { flexDirection: "row", alignItems: "center", gap: 6 },
  addButtonText: { fontSize: 14, color: "#2563eb", fontWeight: "600" },
});
