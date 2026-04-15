import React, { useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Image,
  StyleSheet,
  Animated,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Check, ChevronRight, X } from "lucide-react-native";
import { LUCIDE } from "../theme/lucideSizes";
import { ShimmerPlaceholder } from "../components/ShimmerPlaceholder";
import {
  useImportQueueStore,
  type QueueEntry,
} from "../stores/importQueue.store";
import { api } from "../services/api";
import { useRecipesStore } from "../stores/recipes.store";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";
import {
  PRIMARY,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  TEXT_TERTIARY,
  DIVIDER,
  SURFACE,
  SUCCESS,
  ERROR,
  WHITE,
  BLACK,
} from "../theme/colors";

type Props = NativeStackScreenProps<RootStackParamList, "ImportHub">;

function QueueCard({
  entry,
  onReview,
  onRetake,
  onCancelEntry,
}: {
  entry: QueueEntry;
  onReview: () => void;
  onRetake: () => void;
  onCancelEntry: () => void;
}) {
  const isParsing = entry.status === "uploading" || entry.status === "parsing";
  const isParsed = entry.status === "parsed";
  const isNeedsRetake = entry.status === "needs_retake";
  const isFailed = entry.status === "parse_failed";
  const isReviewing = entry.status === "reviewing";
  const isSaving = entry.status === "saving";
  const isTappable = isParsed || isNeedsRetake;

  const content = (
    <View style={[styles.card, (isReviewing || isSaving) && styles.cardMuted]}>
      <Image
        source={{ uri: entry.thumbnailUri }}
        style={styles.thumbnail}
        defaultSource={undefined}
      />
      <View style={styles.cardInfo}>
        {isParsing && (
          <>
            <Text style={styles.statusParsing}>Extracting recipe...</Text>
            <ShimmerPlaceholder
              style={styles.shimmerBar}
              borderRadius={4}
            />
          </>
        )}
        {isParsed && (
          <>
            <Text style={styles.titleParsed} numberOfLines={1}>
              {entry.title ?? "Recipe"}
            </Text>
            <Text style={styles.statusReady}>Ready for review</Text>
          </>
        )}
        {isNeedsRetake && (
          <>
            <Text style={styles.titleDefault}>Photo needs retake</Text>
            <Text style={styles.statusRetake}>Tap to retake photo</Text>
          </>
        )}
        {isFailed && (
          <>
            <Text style={styles.titleDefault}>Couldn't read this photo</Text>
            <TouchableOpacity onPress={onCancelEntry} hitSlop={8}>
              <Text style={styles.statusCancel}>Cancel</Text>
            </TouchableOpacity>
          </>
        )}
        {isReviewing && (
          <>
            <Text style={styles.titleMuted} numberOfLines={1}>
              {entry.title ?? "Recipe"}
            </Text>
            <Text style={styles.statusMuted}>In review...</Text>
          </>
        )}
        {isSaving && (
          <>
            <Text style={styles.titleMuted} numberOfLines={1}>
              {entry.title ?? "Recipe"}
            </Text>
            <Text style={styles.statusMuted}>Saving...</Text>
          </>
        )}
      </View>
      {isTappable && (
        <ChevronRight size={LUCIDE.md} color={TEXT_SECONDARY} />
      )}
    </View>
  );

  if (isTappable) {
    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={isParsed ? onReview : onRetake}
      >
        {content}
      </TouchableOpacity>
    );
  }

  return content;
}

export function ImportHubScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const entries = useImportQueueStore((s) => s.entries);
  const canImportMore = useImportQueueStore((s) => s.canImportMore);
  const setReviewing = useImportQueueStore((s) => s.setReviewing);
  const removeEntry = useImportQueueStore((s) => s.removeEntry);

  const checkOpacity = useRef(new Animated.Value(0)).current;
  const checkScale = useRef(new Animated.Value(0.35)).current;
  const autoNavRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const allDone = entries.length === 0;

  useEffect(() => {
    if (!allDone) return;

    Animated.parallel([
      Animated.spring(checkScale, {
        toValue: 1,
        useNativeDriver: true,
        friction: 7,
        tension: 140,
      }),
      Animated.timing(checkOpacity, {
        toValue: 1,
        duration: 280,
        useNativeDriver: true,
      }),
    ]).start();

    autoNavRef.current = setTimeout(() => {
      if (navigation.isFocused()) {
        navigation.navigate("Home", {});
      }
    }, 3000);

    return () => {
      if (autoNavRef.current) clearTimeout(autoNavRef.current);
    };
  }, [allDone, checkOpacity, checkScale, navigation]);

  const handleReview = useCallback(
    (entry: QueueEntry) => {
      if (!entry.draftId) return;
      setReviewing(entry.localId);
      navigation.push("ImportFlow", {
        mode: "image",
        resumeDraftId: entry.draftId,
        fromHub: true,
      });
    },
    [navigation, setReviewing],
  );

  const handleRetake = useCallback(
    (entry: QueueEntry) => {
      if (!entry.draftId) return;
      setReviewing(entry.localId);
      navigation.push("ImportFlow", {
        mode: "image",
        resumeDraftId: entry.draftId,
        fromHub: true,
      });
    },
    [navigation, setReviewing],
  );

  const handleCancelEntry = useCallback(
    (entry: QueueEntry) => {
      Alert.alert(
        "Cancel Import",
        "Remove this photo from the import queue?",
        [
          { text: "Keep", style: "cancel" },
          {
            text: "Remove",
            style: "destructive",
            onPress: async () => {
              if (entry.draftId) {
                try {
                  await api.drafts.cancel(entry.draftId);
                } catch {
                  // best-effort
                }
              }
              removeEntry(entry.localId);
            },
          },
        ],
      );
    },
    [removeEntry],
  );

  const handleImportAnother = () => {
    navigation.navigate("Home", { openFab: true });
  };

  const handleDone = () => {
    navigation.navigate("Home", {});
  };

  if (allDone) {
    return (
      <View style={[styles.completionContainer, { paddingTop: insets.top + 16 }]}>
        <Animated.View
          style={[
            styles.checkWrap,
            { opacity: checkOpacity, transform: [{ scale: checkScale }] },
          ]}
        >
          <Check size={LUCIDE.hero} color={SUCCESS} />
        </Animated.View>
        <Text style={styles.completionTitle}>All done!</Text>
        <Text style={styles.completionSubtitle}>
          All your recipes have been saved.
        </Text>
        <TouchableOpacity style={styles.doneButton} onPress={handleDone}>
          <Text style={styles.doneButtonText}>Done</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16 }]}>
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>Your Imports</Text>
        <TouchableOpacity
          onPress={() => navigation.navigate("Home", {})}
          hitSlop={12}
          style={styles.closeButton}
        >
          <X size={LUCIDE.row} color={TEXT_SECONDARY} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: canImportMore() ? 100 : 40 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {entries.map((entry) => (
          <QueueCard
            key={entry.localId}
            entry={entry}
            onReview={() => handleReview(entry)}
            onRetake={() => handleRetake(entry)}
            onCancelEntry={() => handleCancelEntry(entry)}
          />
        ))}
      </ScrollView>

      {canImportMore() && (
        <View
          style={[
            styles.bottomAction,
            { paddingBottom: insets.bottom + 12 },
          ]}
        >
          <TouchableOpacity
            style={styles.importAnotherButton}
            onPress={handleImportAnother}
          >
            <Text style={styles.importAnotherText}>Import Another</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: WHITE,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: TEXT_PRIMARY,
  },
  closeButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: SURFACE,
    alignItems: "center",
    justifyContent: "center",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    gap: 12,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: DIVIDER,
    borderRadius: 12,
    padding: 12,
    gap: 12,
    shadowColor: BLACK,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  cardMuted: {
    opacity: 0.5,
  },
  thumbnail: {
    width: 56,
    height: 72,
    borderRadius: 8,
    backgroundColor: SURFACE,
  },
  cardInfo: {
    flex: 1,
    gap: 4,
  },
  shimmerBar: {
    width: "60%",
    height: 8,
  },
  statusParsing: {
    fontSize: 14,
    fontWeight: "500",
    color: TEXT_SECONDARY,
  },
  titleParsed: {
    fontSize: 15,
    fontWeight: "600",
    color: TEXT_PRIMARY,
  },
  statusReady: {
    fontSize: 13,
    fontWeight: "500",
    color: SUCCESS,
  },
  titleDefault: {
    fontSize: 15,
    fontWeight: "600",
    color: TEXT_TERTIARY,
  },
  statusRetake: {
    fontSize: 13,
    fontWeight: "500",
    color: PRIMARY,
  },
  statusCancel: {
    fontSize: 13,
    fontWeight: "600",
    color: ERROR,
  },
  titleMuted: {
    fontSize: 15,
    fontWeight: "600",
    color: TEXT_SECONDARY,
  },
  statusMuted: {
    fontSize: 13,
    fontWeight: "500",
    color: TEXT_SECONDARY,
  },
  bottomAction: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 24,
    paddingTop: 12,
    backgroundColor: WHITE,
  },
  importAnotherButton: {
    backgroundColor: PRIMARY,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  importAnotherText: {
    color: WHITE,
    fontSize: 16,
    fontWeight: "600",
  },
  completionContainer: {
    flex: 1,
    backgroundColor: WHITE,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  checkWrap: {
    marginBottom: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  completionTitle: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 8,
    marginTop: 2,
  },
  completionSubtitle: {
    fontSize: 15,
    color: TEXT_SECONDARY,
    textAlign: "center",
  },
  doneButton: {
    marginTop: 32,
    backgroundColor: DIVIDER,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
  },
  doneButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: TEXT_TERTIARY,
  },
});
