import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  type ListRenderItemInfo,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Camera, FolderOpen, ChefHat } from "lucide-react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  PRIMARY,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  DIVIDER,
  WHITE,
} from "../theme/colors";

const ONBOARDING_STORAGE_KEY = "@orzo/onboarding-complete";
const { width: SCREEN_WIDTH } = Dimensions.get("window");

type Slide = {
  key: string;
  title: string;
  subtitle: string;
  Icon: typeof Camera;
};

const SLIDES: Slide[] = [
  {
    key: "1",
    title: "Scan any recipe",
    subtitle:
      "Capture recipes from photos, screenshots, or links—no typing required.",
    Icon: Camera,
  },
  {
    key: "2",
    title: "Organize your collection",
    subtitle:
      "Group recipes into folders so favorites and weeknight meals stay within reach.",
    Icon: FolderOpen,
  },
  {
    key: "3",
    title: "Cook with confidence",
    subtitle:
      "Keep steps and ingredients in one place while you work through each dish.",
    Icon: ChefHat,
  },
];

type Props = NativeStackScreenProps<any, "Onboarding">;

export function OnboardingScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(0);

  const complete = useCallback(async () => {
    await AsyncStorage.setItem(ONBOARDING_STORAGE_KEY, "true");
    navigation.navigate("Auth");
  }, [navigation]);

  const onMomentumScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const i = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
      setIndex(i);
    },
    []
  );

  const renderItem = useCallback(({ item }: ListRenderItemInfo<Slide>) => {
    const Icon = item.Icon;
    return (
      <View style={[styles.slide, { width: SCREEN_WIDTH }]}>
        <Icon size={64} color={PRIMARY} strokeWidth={1.75} />
        <Text style={styles.title}>{item.title}</Text>
        <Text style={styles.subtitle}>{item.subtitle}</Text>
      </View>
    );
  }, []);

  return (
    <View style={styles.root}>
      <View style={styles.upper}>
        {index < 2 ? (
          <TouchableOpacity
            style={[styles.skipTouchable, { top: insets.top + 8 }]}
            onPress={complete}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Skip onboarding"
          >
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>
        ) : null}
        <FlatList
          data={SLIDES}
          renderItem={renderItem}
          keyExtractor={(item) => item.key}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onMomentumScrollEnd}
          getItemLayout={(_, i) => ({
            length: SCREEN_WIDTH,
            offset: SCREEN_WIDTH * i,
            index: i,
          })}
          style={styles.list}
        />
      </View>
      <View
        style={[
          styles.footer,
          { paddingBottom: Math.max(insets.bottom, 16) },
        ]}
      >
        <View style={styles.dots}>
          {SLIDES.map((slide, i) => (
            <View
              key={slide.key}
              style={[
                styles.dot,
                i === index ? styles.dotActive : styles.dotInactive,
              ]}
            />
          ))}
        </View>
        {index === 2 ? (
          <TouchableOpacity
            style={styles.cta}
            onPress={complete}
            activeOpacity={0.88}
            accessibilityRole="button"
            accessibilityLabel="Get started"
          >
            <Text style={styles.ctaText}>Get Started</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: WHITE,
  },
  upper: {
    flex: 1,
    position: "relative",
  },
  skipTouchable: {
    position: "absolute",
    right: 24,
    zIndex: 2,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  skipText: {
    color: TEXT_SECONDARY,
    fontSize: 15,
    fontWeight: "400",
  },
  list: {
    flex: 1,
  },
  slide: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    marginTop: 28,
    fontSize: 29,
    fontWeight: "700",
    color: TEXT_PRIMARY,
    textAlign: "center",
  },
  subtitle: {
    marginTop: 14,
    fontSize: 16,
    fontWeight: "400",
    color: TEXT_SECONDARY,
    textAlign: "center",
    lineHeight: 24,
    maxWidth: 320,
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotActive: {
    backgroundColor: PRIMARY,
  },
  dotInactive: {
    backgroundColor: DIVIDER,
  },
  cta: {
    backgroundColor: PRIMARY,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    width: "100%",
  },
  ctaText: {
    color: WHITE,
    fontSize: 16,
    fontWeight: "600",
  },
});
