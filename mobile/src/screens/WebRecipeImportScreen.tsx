import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Keyboard,
  Linking,
  Alert,
  ActivityIndicator,
} from "react-native";
import { WebView } from "react-native-webview";
import type { WebViewMessageEvent, WebViewNavigation } from "react-native-webview";
import type { ShouldStartLoadRequest } from "react-native-webview/lib/WebViewTypes";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  X,
  RotateCw,
  ChevronLeft,
  ChevronRight,
  Search,
} from "lucide-react-native";
import { StackActions } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { URL_IMPORT_HTML_MAX_BYTES } from "@recipejar/shared";
import type { RootStackParamList } from "../navigation/types";
import {
  looksLikeHttpUrl,
  resolveOmnibarInput,
  stripUrlCredentials,
} from "../features/import/webImportUrl";

type Props = NativeStackScreenProps<RootStackParamList, "WebRecipeImport">;
type CaptureFailureReason =
  NonNullable<RootStackParamList["ImportFlow"]["urlCaptureFailureReason"]>;

const HTML_CAPTURE_MESSAGE_TYPE = "recipejar-html-capture";
const HTML_CAPTURE_TIMEOUT_MS = 4_000;

const AD_DOMAIN_KEYWORDS = [
  "doubleclick.net",
  "googlesyndication.com",
  "googleadservices.com",
  "google-analytics.com",
  "googletagmanager.com",
  "adnxs.com",
  "adsrvr.org",
  "amazon-adsystem.com",
  "casalemedia.com",
  "criteo.com",
  "criteo.net",
  "demdex.net",
  "moatads.com",
  "outbrain.com",
  "taboola.com",
  "pubmatic.com",
  "rubiconproject.com",
  "openx.net",
  "bidswitch.net",
  "sharethis.com",
  "sharethrough.com",
  "mediavine.com",
  "adthrive.com",
  "ezoic.net",
  "ezoic.com",
  "ad.doubleclick.net",
  "pagead2.googlesyndication.com",
  "securepubads.g.doubleclick.net",
  "tpc.googlesyndication.com",
  "zergnet.com",
  "outbrain.com",
  "taboola.com",
  "revcontent.com",
  "mgid.com",
  "content.ad",
];

function isAdUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return AD_DOMAIN_KEYWORDS.some(
      (ad) => host === ad || host.endsWith(`.${ad}`),
    );
  } catch {
    return false;
  }
}

function promptExternalUrl(url: string, label: string) {
  Alert.alert(
    "Open external app",
    `${label}\n\nAllow leaving RecipeJar to open this link?`,
    [
      { text: "Cancel", style: "cancel" },
      {
        text: "Open",
        onPress: () => {
          Linking.openURL(url).catch(() => {});
        },
      },
    ],
  );
}

function getUtf8ByteLength(value: string): number {
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(value).length;
  }
  return value.length;
}

function buildHtmlCaptureScript(requestId: string): string {
  return `
    (function() {
      try {
        var readyState = document.readyState || "unknown";
        if (!document.documentElement || readyState === "loading") {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: "${HTML_CAPTURE_MESSAGE_TYPE}",
            requestId: ${JSON.stringify(requestId)},
            ok: false,
            errorCode: "page_not_ready"
          }));
          return true;
        }

        var clone = document.documentElement.cloneNode(true);

        var remove = clone.querySelectorAll(
          'script:not([type="application/ld+json"]), style, svg, iframe, noscript, ' +
          'link[rel="stylesheet"], link[rel="preload"], link[rel="prefetch"], ' +
          'meta, img, video, audio, source, picture, canvas, ' +
          '[class*="ad-"], [class*="advertisement"], [id*="ad-"], [class*="sidebar"], ' +
          '[class*="comment"], [class*="social"], [class*="share"], [class*="related"], ' +
          '[class*="newsletter"], [class*="popup"], [class*="modal"], [class*="overlay"]'
        );
        for (var i = 0; i < remove.length; i++) {
          remove[i].parentNode && remove[i].parentNode.removeChild(remove[i]);
        }

        var html = clone.outerHTML || "";
        if (!html) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: "${HTML_CAPTURE_MESSAGE_TYPE}",
            requestId: ${JSON.stringify(requestId)},
            ok: false,
            errorCode: "page_not_ready"
          }));
          return true;
        }

        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: "${HTML_CAPTURE_MESSAGE_TYPE}",
          requestId: ${JSON.stringify(requestId)},
          ok: true,
          html: html,
          url: window.location.href || ""
        }));
      } catch (error) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: "${HTML_CAPTURE_MESSAGE_TYPE}",
          requestId: ${JSON.stringify(requestId)},
          ok: false,
          errorCode: "injection_failed",
          message: error && error.message ? error.message : "capture_failed"
        }));
      }
      return true;
    })();
  `;
}

export function WebRecipeImportScreen({ route, navigation }: Props) {
  const insets = useSafeAreaInsets();
  const initialUrl = route.params?.initialUrl?.trim();
  const skipLanding = Boolean(initialUrl && looksLikeHttpUrl(initialUrl));

  const webRef = useRef<WebView>(null);
  const [browsing, setBrowsing] = useState(skipLanding);
  const [omnibarText, setOmnibarText] = useState(initialUrl ?? "");
  const [sourceUri, setSourceUri] = useState(
    skipLanding ? stripUrlCredentials(initialUrl!) : "about:blank",
  );

  const [navState, setNavState] = useState({
    loading: false,
    canGoBack: false,
    canGoForward: false,
    currentUrl: skipLanding ? stripUrlCredentials(initialUrl!) : "",
  });
  const [saveInFlight, setSaveInFlight] = useState(false);
  const pendingCaptureRef = useRef<{ requestId: string; fallbackUrl: string } | null>(
    null,
  );
  const captureTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasNavigatedRef = useRef(false);

  const clearPendingCapture = useCallback(() => {
    pendingCaptureRef.current = null;
    if (captureTimeoutRef.current) {
      clearTimeout(captureTimeoutRef.current);
      captureTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => () => clearPendingCapture(), [clearPendingCapture]);

  const beginImport = useCallback(
    (params: RootStackParamList["ImportFlow"]) => {
      if (hasNavigatedRef.current) return;
      hasNavigatedRef.current = true;
      clearPendingCapture();
      setSaveInFlight(false);
      navigation.dispatch(StackActions.replace("ImportFlow", params));
    },
    [clearPendingCapture, navigation],
  );

  const fallbackToServerFetch = useCallback(
    (url: string, reason: CaptureFailureReason) => {
      beginImport({
        mode: "url",
        url,
        urlAcquisitionMethod: "server-fetch-fallback",
        urlCaptureFailureReason: reason,
      });
    },
    [beginImport],
  );

  const onShouldStartLoadWithRequest = useCallback(
    (request: ShouldStartLoadRequest): boolean => {
      const url = request.url;
      const lower = url.toLowerCase();

      if (lower.startsWith("javascript:")) return false;

      // Block ad / tracking domains (both top-frame and subframe).
      if (isAdUrl(url)) return false;

      if (!request.isTopFrame) return true;

      if (
        lower.startsWith("tel:") ||
        lower.startsWith("mailto:") ||
        lower.startsWith("sms:")
      ) {
        const label =
          lower.startsWith("tel:")
            ? "Phone link"
            : lower.startsWith("mailto:")
              ? "Email link"
              : "Messages link";
        promptExternalUrl(url, label);
        return false;
      }

      if (lower.startsWith("intent:")) {
        promptExternalUrl(url, "App link (Android)");
        return false;
      }

      return true;
    },
    [],
  );

  const onNavigationStateChange = useCallback((nav: WebViewNavigation) => {
    setNavState({
      loading: nav.loading,
      canGoBack: nav.canGoBack,
      canGoForward: nav.canGoForward,
      currentUrl: (nav.url ?? "").trim(),
    });
    const u = (nav.url ?? "").trim();
    if (!nav.loading && u && looksLikeHttpUrl(u)) {
      setOmnibarText(u);
    }
  }, []);

  const startBrowse = useCallback(() => {
    const resolved = resolveOmnibarInput(omnibarText);
    Keyboard.dismiss();
    setSourceUri(resolved);
    setBrowsing(true);
  }, [omnibarText]);

  const onSave = useCallback(() => {
    if (saveInFlight) return;

    const url = stripUrlCredentials(navState.currentUrl.trim() || omnibarText.trim());
    if (navState.loading || !url || !looksLikeHttpUrl(url)) {
      Alert.alert(
        "No page loaded",
        "Wait until the page finishes loading, then try again.",
      );
      return;
    }

    if (!webRef.current) {
      fallbackToServerFetch(url, "injection_failed");
      return;
    }

    setSaveInFlight(true);
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    pendingCaptureRef.current = { requestId, fallbackUrl: url };
    captureTimeoutRef.current = setTimeout(() => {
      const pending = pendingCaptureRef.current;
      if (!pending || pending.requestId !== requestId) return;
      fallbackToServerFetch(pending.fallbackUrl, "capture_timeout");
    }, HTML_CAPTURE_TIMEOUT_MS);

    try {
      webRef.current.injectJavaScript(buildHtmlCaptureScript(requestId));
    } catch {
      fallbackToServerFetch(url, "injection_failed");
    }
  }, [
    fallbackToServerFetch,
    navState.currentUrl,
    navState.loading,
    omnibarText,
    saveInFlight,
  ]);

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      let payload: {
        type?: string;
        requestId?: string;
        ok?: boolean;
        html?: string;
        url?: string;
        errorCode?: CaptureFailureReason;
      };

      try {
        payload = JSON.parse(event.nativeEvent.data);
      } catch {
        return;
      }

      if (payload.type !== HTML_CAPTURE_MESSAGE_TYPE) return;
      const pending = pendingCaptureRef.current;
      if (!pending || payload.requestId !== pending.requestId) return;

      clearPendingCapture();

      if (!payload.ok || typeof payload.html !== "string") {
        fallbackToServerFetch(
          pending.fallbackUrl,
          payload.errorCode ?? "message_transport_failed",
        );
        return;
      }

      const htmlBytes = getUtf8ByteLength(payload.html);
      if (htmlBytes > URL_IMPORT_HTML_MAX_BYTES) {
        fallbackToServerFetch(pending.fallbackUrl, "payload_too_large");
        return;
      }

      const finalUrl = stripUrlCredentials(
        typeof payload.url === "string" && looksLikeHttpUrl(payload.url)
          ? payload.url
          : pending.fallbackUrl,
      );

      beginImport({
        mode: "url",
        url: finalUrl,
        urlHtml: payload.html,
        urlAcquisitionMethod: "webview-html",
      });
    },
    [beginImport, clearPendingCapture, fallbackToServerFetch],
  );

  const onOpenWindow = useCallback(
    (e: { nativeEvent: { targetUrl: string } }) => {
      const url = e.nativeEvent.targetUrl;
      setSourceUri(url);
      setOmnibarText(url);
    },
    [],
  );

  const chromeBottomPad = insets.bottom + 10;

  return (
    <View
      style={[styles.root, { paddingTop: insets.top + 6 }]}
      testID="web-recipe-import-screen"
    >
      <KeyboardAvoidingView
        style={styles.kavFill}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={styles.chromeRow}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            hitSlop={12}
            testID="web-recipe-import-close"
            accessibilityRole="button"
            accessibilityLabel="Close browser"
          >
            <X size={26} color="#374151" />
          </TouchableOpacity>
          <TextInput
            style={styles.omnibar}
            value={omnibarText}
            onChangeText={setOmnibarText}
            placeholder="Search or enter website"
            placeholderTextColor="#9ca3af"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="default"
            returnKeyType="go"
            onSubmitEditing={startBrowse}
            testID="web-recipe-import-omnibar"
            accessibilityLabel="Search or enter website"
          />
          <TouchableOpacity
            onPress={() => webRef.current?.reload()}
            hitSlop={12}
            testID="web-recipe-import-refresh"
            accessibilityRole="button"
            accessibilityLabel="Refresh page"
          >
            <RotateCw size={22} color="#374151" />
          </TouchableOpacity>
        </View>

        <View style={styles.separator} />

        <View style={styles.body}>
          {!browsing ? (
            <ScrollView
              keyboardShouldPersistTaps="handled"
              bounces={false}
              contentContainerStyle={styles.landingScroll}
            >
              <Search size={48} color="#7c3aed" style={styles.landingIcon} />
              <Text style={styles.landingTitle}>Find a recipe</Text>
              <Text style={styles.landingSubtitle}>
                Search the web for a recipe, then open a recipe page and tap
                Save to RecipeJar.
              </Text>
              <TextInput
                style={styles.landingInput}
                value={omnibarText}
                onChangeText={setOmnibarText}
                placeholder="Search or enter website"
                placeholderTextColor="#9ca3af"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="go"
                onSubmitEditing={startBrowse}
                testID="web-recipe-import-landing-input"
              />
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={startBrowse}
                testID="web-recipe-import-go"
                accessibilityRole="button"
                accessibilityLabel="Go"
              >
                <Text style={styles.primaryBtnText}>Go</Text>
              </TouchableOpacity>
            </ScrollView>
          ) : (
            <WebView
              ref={webRef}
              source={{ uri: sourceUri }}
              style={styles.webview}
              onNavigationStateChange={onNavigationStateChange}
              onMessage={onMessage}
              onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
              setSupportMultipleWindows={false}
              onOpenWindow={onOpenWindow}
              startInLoadingState
              javaScriptEnabled
              domStorageEnabled
              {...(Platform.OS === "ios"
                ? { allowsBackForwardNavigationGestures: true }
                : {})}
              onScroll={() => Keyboard.dismiss()}
              renderLoading={() => (
                <View style={styles.webLoading}>
                  <ActivityIndicator color="#7c3aed" />
                </View>
              )}
            />
          )}
        </View>
      </KeyboardAvoidingView>

      {browsing ? (
        <View style={[styles.bottomBar, { paddingBottom: chromeBottomPad }]}>
          <TouchableOpacity
            style={[styles.saveBtn, (saveInFlight || navState.loading) && styles.saveBtnDisabled]}
            onPress={onSave}
            disabled={saveInFlight || navState.loading}
            testID="web-recipe-import-save"
            accessibilityRole="button"
            accessibilityLabel="Save to RecipeJar"
          >
            <Text style={styles.saveBtnText}>
              {saveInFlight ? "Preparing Import..." : "Save to RecipeJar"}
            </Text>
          </TouchableOpacity>
          <View style={styles.navRow}>
            <TouchableOpacity
              onPress={() => webRef.current?.goBack()}
              disabled={!navState.canGoBack}
              style={styles.navIconBtn}
              testID="web-recipe-import-back"
              accessibilityRole="button"
              accessibilityLabel="Back"
            >
              <ChevronLeft
                size={28}
                color={navState.canGoBack ? "#374151" : "#d1d5db"}
              />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => webRef.current?.goForward()}
              disabled={!navState.canGoForward}
              style={styles.navIconBtn}
              testID="web-recipe-import-forward"
              accessibilityRole="button"
              accessibilityLabel="Forward"
            >
              <ChevronRight
                size={28}
                color={navState.canGoForward ? "#374151" : "#d1d5db"}
              />
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fff" },
  kavFill: { flex: 1, minHeight: 0 },
  chromeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  omnibar: {
    flex: 1,
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 10 : 8,
    fontSize: 15,
    color: "#111827",
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#e5e7eb",
    marginHorizontal: 12,
  },
  body: { flex: 1, minHeight: 0 },
  webview: { flex: 1, backgroundColor: "#fff" },
  webLoading: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
  },
  landingScroll: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 32,
    alignItems: "center",
  },
  landingIcon: { marginBottom: 16 },
  landingTitle: { fontSize: 24, fontWeight: "700", marginBottom: 8 },
  landingSubtitle: {
    fontSize: 14,
    color: "#6b7280",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 24,
  },
  landingInput: {
    width: "100%",
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: "#111827",
    marginBottom: 16,
  },
  primaryBtn: {
    backgroundColor: "#7c3aed",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
    minWidth: 200,
    alignItems: "center",
  },
  primaryBtnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  bottomBar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e5e7eb",
    paddingTop: 12,
    paddingHorizontal: 16,
    alignItems: "center",
    gap: 8,
    backgroundColor: "#fff",
  },
  navRow: { flexDirection: "row", gap: 24 },
  navIconBtn: { padding: 8 },
  saveBtn: {
    backgroundColor: "#7c3aed",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    width: "100%",
    alignItems: "center",
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
