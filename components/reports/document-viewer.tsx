import React from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
// COS-928 — SafeAreaView from safe-area-context, not react-native.
// RN's own SafeAreaView is a NO-OP on Android (it only ever applied iOS safe
// area insets), so these screens rendered under the status bar / camera
// cutout. The context version reads real insets on both platforms and is
// already a dependency, used elsewhere in the app.
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { Colors } from '@/constants/theme';
import { useAccessibility } from '@/stores/accessibility-store';

export interface DocumentViewerSource {
  /** Direct URL — presigned S3 link (cos-user-documents) or report-binary endpoint. */
  uri: string;
  /** Auth headers for non-S3 sources. iOS WKWebView applies these on the initial request only. */
  headers?: Record<string, string>;
  contentType?: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  source: DocumentViewerSource | null;
  title: string;
  subtitle?: string;
}

const PDF_VIEWER_HTML = (pdfUrl: string) => `<!doctype html>
<html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body,iframe{margin:0;padding:0;border:0;width:100%;height:100%;background:#525659}</style>
</head><body>
<iframe src="${pdfUrl}" type="application/pdf"></iframe>
</body></html>`;

export function DocumentViewer({ visible, onClose, source, title, subtitle }: Props) {
  const { settings, getScaledFontSize, getScaledFontWeight } = useAccessibility();
  const colors = Colors[settings.isDarkTheme ? 'dark' : 'light'];
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (visible) setLoading(true);
  }, [visible, source?.uri]);

  const isPdf = (source?.contentType ?? '').toLowerCase().includes('pdf');
  // For PDFs we wrap in a tiny HTML shell with an <iframe> — iOS WKWebView
  // renders application/pdf inline reliably this way; bare WebView source
  // sometimes triggers a download prompt instead of inline render.
  const webViewSource = source
    ? isPdf
      ? { html: PDF_VIEWER_HTML(source.uri) }
      : { uri: source.uri, headers: source.headers }
    : { uri: 'about:blank' };

  const onMessage = (_e: WebViewMessageEvent) => {
    // Reserved for future bottom-toolbar features (page count, etc).
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { borderBottomColor: '#E0E0E0' }]}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <MaterialIcons name="close" size={getScaledFontSize(24)} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.headerTitle}>
            <Text
              numberOfLines={1}
              style={[styles.title, { color: colors.text, fontSize: getScaledFontSize(16), fontWeight: getScaledFontWeight(600) as any }]}
            >
              {title}
            </Text>
            {subtitle && (
              <Text
                numberOfLines={1}
                style={[styles.subtitle, { color: colors.subtext, fontSize: getScaledFontSize(12), fontWeight: getScaledFontWeight(400) as any }]}
              >
                {subtitle}
              </Text>
            )}
          </View>
          {/* Spacer keeps title centered */}
          <View style={{ width: getScaledFontSize(24) }} />
        </View>

        <View style={styles.body}>
          {source && (
            <WebView
              source={webViewSource as any}
              onLoadStart={() => setLoading(true)}
              onLoadEnd={() => setLoading(false)}
              onMessage={onMessage}
              style={{ backgroundColor: colors.background }}
              originWhitelist={['*']}
            />
          )}
          {loading && (
            <View style={styles.loaderOverlay}>
              <ActivityIndicator size="large" color="#008080" />
            </View>
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  headerTitle: { flex: 1, alignItems: 'center' },
  title: { textAlign: 'center' },
  subtitle: { textAlign: 'center', marginTop: 2 },
  body: { flex: 1 },
  loaderOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
});
