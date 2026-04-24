import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Linking,
  Alert,
  ActivityIndicator,
} from "react-native";
import { WebView } from "react-native-webview";
import type { WebViewErrorEvent } from "react-native-webview/lib/WebViewTypes";
import FastImage from "react-native-fast-image";
import { ExternalLink, AlertTriangle } from "lucide-react-native";
import { LUCIDE } from "../../theme/lucideSizes";
import { FullScreenImageViewer } from "../../components/FullScreenImageViewer";
import {
  PRIMARY,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  DIVIDER,
  WHITE,
  WARNING,
} from "../../theme/colors";

interface SourceTabViewProps {
  sourceType: "image" | "url";
  /** Set for URL imports: the URL the parser actually hit (the resolved
   *  URL when the fallback cascade fired, otherwise the original). The
   *  WebView loads this directly so the user sees the exact page whose
   *  recipe ended up in the Imported tab. Null on image imports. */
  sourceUrl: string | null;
  /** Set for image imports: local file URIs of captured pages, in order.
   *  Tap any image to open it full-screen via `FullScreenImageViewer`.
   *  Empty on URL imports. */
  sourcePageUris: string[];
  /** Sibling-render gate. The parent renders both Imported and Source panes
   *  under the same parent View; the inactive one is hidden via
   *  display:none so the WebView retains scroll/cookie/login state across
   *  tab switches. When false, this component skips expensive mount work
   *  (no WebView reload on toggle). */
  active: boolean;
}

/**
 * Source view for the import-review screen. Shows the original material the
 * parser consumed so the user can sanity-check what got extracted:
 *   - URL imports: live WebView of the resolved page
 *   - Image imports: vertically stacked captured photos with tap-to-zoom
 *
 * Rendered as a sibling to the Imported tab inside `PreviewEditView`, gated
 * by `display:none` via the `active` prop. Keeping it mounted-but-hidden
 * preserves WebView state (scroll position, auth cookies, any JS state)
 * across tab switches, avoiding the "did it reload? do I wait again?"
 * confusion of a lazy-mount approach.
 *
 * The WebView's error state is handled inside this component — we show a
 * "couldn't load source here — open in browser" fallback with `Linking`
 * so users hit by aggressive bot-blocking or paywalls aren't left
 * staring at a blank pane.
 */
export function SourceTabView({
  sourceType,
  sourceUrl,
  sourcePageUris,
  active,
}: SourceTabViewProps) {
  const [webViewError, setWebViewError] = useState<string | null>(null);
  const [zoomUri, setZoomUri] = useState<string | null>(null);

  // display:none keeps the subtree mounted so inner state (WebView scroll,
  // pager position) survives tab switches. `none`/`flex` are the only two
  // RN-supported values.
  const visibility = active ? ({} as const) : ({ display: "none" } as const);

  if (sourceType === "url") {
    const url = sourceUrl?.trim() || null;
    if (!url) {
      return (
        <View style={[styles.container, visibility]} testID="source-tab-url-missing">
          <View style={styles.errorContent}>
            <AlertTriangle size={28} color={WARNING} strokeWidth={2} />
            <Text style={styles.errorTitle}>No source URL available</Text>
            <Text style={styles.errorBody}>
              We couldn't find a URL to load for this import.
            </Text>
          </View>
        </View>
      );
    }

    return (
      <View style={[styles.container, visibility]} testID="source-tab-url">
        {webViewError ? (
          <View style={styles.errorContent}>
            <AlertTriangle size={28} color={WARNING} strokeWidth={2} />
            <Text style={styles.errorTitle}>
              Couldn't load the source here
            </Text>
            <Text style={styles.errorBody}>
              Some sites block in-app WebViews. You can still open this
              page in your browser.
            </Text>
            <TouchableOpacity
              style={styles.errorButton}
              onPress={async () => {
                try {
                  await Linking.openURL(url);
                } catch {
                  Alert.alert(
                    "Can't open link",
                    "No app on this device can open this URL.",
                  );
                }
              }}
              accessibilityRole="button"
              accessibilityLabel="Open source in browser"
              testID="source-tab-open-in-browser"
            >
              <ExternalLink size={16} color={WHITE} strokeWidth={2} />
              <Text style={styles.errorButtonText}>Open in browser</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <WebView
            source={{ uri: url }}
            style={styles.webView}
            startInLoadingState
            renderLoading={() => (
              <View style={styles.webViewLoader}>
                <ActivityIndicator size="large" color={PRIMARY} />
              </View>
            )}
            onError={(event: WebViewErrorEvent) => {
              const description =
                event.nativeEvent?.description || "Unknown error";
              setWebViewError(description);
            }}
            // Some sites 4xx a fresh WebView but render fine after redirect —
            // don't treat HTTP errors as terminal. Only treat network /
            // loader failures (onError) as error state.
            onHttpError={() => {
              /* non-terminal — let the page try to render */
            }}
            testID="source-tab-webview"
          />
        )}
      </View>
    );
  }

  // Image import: vertical stack of captured pages. FastImage gives us the
  // same cache the saved-recipe detail screen uses, so switching between
  // Imported/Source never re-downloads.
  return (
    <View style={[styles.container, visibility]} testID="source-tab-image">
      {sourcePageUris.length === 0 ? (
        <View style={styles.errorContent}>
          <AlertTriangle size={28} color={WARNING} strokeWidth={2} />
          <Text style={styles.errorTitle}>No source photos</Text>
          <Text style={styles.errorBody}>
            The capture queue didn't hand off any images for this import.
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.imageScroll}
          contentContainerStyle={styles.imageScrollContent}
          testID="source-tab-image-scroll"
        >
          <Text style={styles.imageHint}>
            {sourcePageUris.length === 1
              ? "Tap the photo to zoom."
              : `${sourcePageUris.length} pages — tap any photo to zoom.`}
          </Text>
          {sourcePageUris.map((uri, idx) => (
            <TouchableOpacity
              key={`${uri}-${idx}`}
              style={styles.imageCard}
              onPress={() => setZoomUri(uri)}
              activeOpacity={0.9}
              accessibilityRole="imagebutton"
              accessibilityLabel={`View source photo ${idx + 1} of ${sourcePageUris.length}`}
              testID={`source-tab-image-${idx}`}
            >
              <FastImage
                source={{ uri }}
                style={styles.image}
                resizeMode={FastImage.resizeMode.contain}
              />
              {sourcePageUris.length > 1 && (
                <View style={styles.pageBadge}>
                  <Text style={styles.pageBadgeText}>
                    Page {idx + 1}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <FullScreenImageViewer
        visible={zoomUri !== null}
        imageUrl={zoomUri}
        onClose={() => setZoomUri(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: WHITE,
  },
  webView: {
    flex: 1,
    backgroundColor: WHITE,
  },
  webViewLoader: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: WHITE,
  },
  errorContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 12,
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: TEXT_PRIMARY,
    textAlign: "center",
  },
  errorBody: {
    fontSize: 13,
    color: TEXT_SECONDARY,
    textAlign: "center",
    lineHeight: 18,
  },
  errorButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: PRIMARY,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    marginTop: 12,
  },
  errorButtonText: {
    color: WHITE,
    fontSize: 14,
    fontWeight: "600",
  },
  imageScroll: {
    flex: 1,
  },
  imageScrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  imageHint: {
    fontSize: 12,
    fontStyle: "italic",
    color: TEXT_SECONDARY,
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  imageCard: {
    width: "100%",
    aspectRatio: 3 / 4,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: DIVIDER,
  },
  image: {
    width: "100%",
    height: "100%",
  },
  pageBadge: {
    position: "absolute",
    bottom: 8,
    left: 8,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  pageBadgeText: {
    color: WHITE,
    fontSize: 11,
    fontWeight: "600",
  },
});
