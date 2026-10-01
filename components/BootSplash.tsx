/**
 * COS-1226 — the only thing the app draws before the first real screen.
 *
 * ─── THE BUG THIS FIXES ──────────────────────────────────────────────
 *
 * `SplashScreen.preventAutoHideAsync()` runs at module load (app/_layout.tsx)
 * and the ONLY code that ever hid it again was app/index.tsx. app/index.tsx is
 * a <Stack> route, and the Stack is a child of <PlanBootGate>. So anything
 * that holds ABOVE the Stack holds the native splash up with it, and draws
 * itself UNDERNEATH it:
 *
 *   • PlanBootGate's loader (COS-1061/1069/1072) — invisible.
 *   • PlanBootGate's ConnectionErrorScreen — invisible AND untappable. The
 *     "something happened, try again" screen Vishal asked for twice was built
 *     and then unreachable by construction.
 *   • security-store's `if (!isReady) return null` — the entire app rendered
 *     as nothing, under a splash, until two SecureStore reads came back.
 *
 * ─── WHY HIDING EARLIER IS NOT ENOUGH ────────────────────────────────
 *
 * The splash looks seamless today precisely BECAUSE it is held until the first
 * real screen is ready. Hiding it sooner and drawing something else is how a
 * rare frozen splash becomes a flicker on all 26 production patients' daily
 * launch. So the screen that replaces it is the splash: same asset, same size,
 * same background, same position. Every pre-first-screen state renders this
 * one component (the gate's hold, the security store's hold, the splash
 * gate's own loading state), so there is nothing to jump between.
 *
 * And it hands over on PAINT, not on commit — see `handOver` below.
 *
 * ─── WHAT "THE SAME" MEANS, EXACTLY ──────────────────────────────────
 *
 * ios/CSH/SplashScreen.storyboard: one imageView, `scaleAspectFit`, pinned to
 * centerX/centerY of a full-screen container (insetsLayoutMarginsFromSafeArea
 * = NO), over the named colour SplashScreenBackground (#ffffff, #000000 dark).
 * The imageView is 200pt wide; the asset is assets/images/splash-icon.png,
 * which is byte-for-byte assets/images/logo.png (identical md5), 1024x638,
 * with transparent letterboxing. Visible logo: 200 x 124.6pt, centred.
 *
 * Those numbers are GENERATED from app.json's expo-splash-screen block, so the
 * duplication here is real and both must change together. The contract test
 * reads app.json and this file and fails if they drift
 * (tests/unit/boot-splash-handover.test.mjs).
 *
 * ─── NO PROVIDERS, DELIBERATELY ──────────────────────────────────────
 *
 * This is the screen that shows when a provider is NOT READY, so it reads no
 * context — `useAccessibility()` throws outside its provider, and a boot-path
 * component that can throw is a brick. `Colors` is a plain object, not a
 * context. Text still honours the OS font-size setting (RN's default); it just
 * does not read the in-app accessibility multiplier.
 */

import { Image } from 'expo-image';
import * as SplashScreen from 'expo-splash-screen';
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, useColorScheme, View } from 'react-native';

import { Colors } from '@/constants/theme';

/** app.json → plugins → expo-splash-screen → imageWidth. */
const SPLASH_IMAGE_WIDTH = 200;
/** assets/images/splash-icon.png is 1024x638; `contain` keeps that ratio. */
const SPLASH_IMAGE_HEIGHT = (SPLASH_IMAGE_WIDTH * 638) / 1024;
/** app.json → plugins → expo-splash-screen → backgroundColor / dark. */
const SPLASH_BACKGROUND_LIGHT = '#ffffff';
const SPLASH_BACKGROUND_DARK = '#000000';

/**
 * How long the screen stays a pure splash before it admits to being a loader.
 *
 * A healthy launch resolves in a few hundred milliseconds, so nobody sees past
 * this. Past it, the patient is waiting on something and is owed evidence that
 * the app is alive rather than a logo that could be a freeze. It is the floor
 * on "visible", not a performance budget.
 */
export const REVEAL_MS = 1_200;

/**
 * Backstop for the handover itself: if the image never reports back (decode
 * failure, a cache miss on a device under memory pressure), hand over anyway.
 * The background already matches, so the worst case is a splash with no logo —
 * strictly better than a splash that never lifts, which is the whole ticket.
 */
const HANDOVER_CEILING_MS = 1_500;

export default function BootSplash({
  label,
  sublabel,
  revealAfterMs = REVEAL_MS,
}: {
  label?: string;
  sublabel?: string;
  revealAfterMs?: number;
}) {
  const scheme = useColorScheme();
  const dark = scheme === 'dark';
  const colors = Colors[dark ? 'dark' : 'light'];
  const background = dark ? SPLASH_BACKGROUND_DARK : SPLASH_BACKGROUND_LIGHT;

  const [revealed, setRevealed] = React.useState(false);

  /*
   * Hand over once OUR copy of the splash is on screen, not when it is merely
   * committed. React commits before the image has decoded, and hiding there
   * would show a frame or two of bare background on every single launch — the
   * exact flicker this change exists not to introduce. onLoadEnd fires for a
   * failed decode too, so a broken asset cannot wedge the splash either.
   *
   * hideAsync is idempotent (it resolves false when already hidden), which is
   * why no cross-module "did we hide yet" flag is needed: app/index.tsx still
   * calls it in its `finally` exactly as before.
   */
  const handOver = React.useCallback(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  React.useEffect(() => {
    const ceiling = setTimeout(handOver, HANDOVER_CEILING_MS);
    const reveal = setTimeout(() => setRevealed(true), revealAfterMs);
    return () => {
      clearTimeout(ceiling);
      clearTimeout(reveal);
    };
  }, [handOver, revealAfterMs]);

  return (
    <View
      style={[styles.root, { backgroundColor: background }]}
      accessibilityRole="progressbar"
      accessibilityLabel={label ?? 'Starting Circle Support Health'}
    >
      <Image
        source={require('@/assets/images/splash-icon.png')}
        style={styles.logo}
        contentFit="contain"
        onLoadEnd={handOver}
      />
      {revealed ? (
        /*
         * COS-1072 — Vishal: "there should be a full screen loader with an
         * overlay effect." Kept as a dimmed ground with a raised card on it,
         * drawn rather than laid over a mounted app, because the children are
         * deliberately unmounted (see PlanBootGate). Absolutely positioned so
         * appearing cannot move the logo — the logo not moving is the point.
         *
         * Primitives only: View / Text / ActivityIndicator. No Modal
         * (ADR-0003 bans it on this path) and no Animated.
         */
        <View style={styles.overlay} pointerEvents="none">
          <View style={styles.veil} />
          <View
            style={[
              styles.card,
              { backgroundColor: background, borderColor: colors.border ?? 'rgba(127,127,127,0.25)' },
            ]}
          >
            <ActivityIndicator size="large" color={colors.primary} />
            {label ? <Text style={[styles.label, { color: colors.text }]}>{label}</Text> : null}
            {sublabel ? (
              <Text style={[styles.sublabel, { color: colors.subtext }]}>{sublabel}</Text>
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  /* No SafeAreaView: the storyboard centres in the FULL window, so we must too. */
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: SPLASH_IMAGE_WIDTH,
    height: SPLASH_IMAGE_HEIGHT,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  veil: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  card: {
    minWidth: 220,
    maxWidth: 320,
    alignItems: 'center',
    paddingVertical: 26,
    paddingHorizontal: 24,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 20,
    elevation: 8,
  },
  label: {
    marginTop: 16,
    textAlign: 'center',
    fontWeight: '600',
    fontSize: 15,
  },
  sublabel: {
    marginTop: 6,
    textAlign: 'center',
    fontSize: 12.5,
  },
});
