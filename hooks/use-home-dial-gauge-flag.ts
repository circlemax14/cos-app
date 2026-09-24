/**
 * COS-1094 — Home dial-gauge kill-switch.
 *
 * Ken asked for the Home wellbeing and health-age tiles to look like the
 * detail screens he screenshotted, which means DialGauge — and DialGauge uses
 * react-native-svg on a screen that is deliberately SVG-free after a
 * cold-mount crash (ADR-0003).
 *
 * The evidence says it is safe: DialGauge has rendered on wellbeing-score.tsx
 * and health-age.tsx in production for weeks. But those are PUSHED screens and
 * Home is the cold-mount surface, which is exactly the distinction that bit us
 * on 2026-08-18. So it ships behind a switch that can be thrown from SSM
 * without an OTA, falling back to ScoreRing.
 *
 * Default-OFF while the query is in flight, matching every sibling flag: never
 * mount the risky path on a guess.
 *
 * SSM key: /cos/{stage}/backend/home_dial_gauge_enabled (+ _beta override).
 */

import { useFeatureFlags } from './use-feature-flags'

const HOME_DIAL_GAUGE_FLAG = 'home_dial_gauge_enabled'

export function useHomeDialGaugeFlag(): boolean {
  const { data } = useFeatureFlags()
  return data?.[HOME_DIAL_GAUGE_FLAG] === true
}
