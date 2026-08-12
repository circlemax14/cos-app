/**
 * Vitals red-flag observer hook (HS-3b).
 *
 * Mounted from `app/Home/plan.tsx`. Watches the Apple Health longitudinal
 * trends returned by `useHealthKitTrends(90)`, evaluates each metric's
 * latest sample against the shared rule set in `lib/vitals-red-flag-rules`,
 * and — on every fresh transition into amber|red for a given metric — does
 * two things:
 *
 *   1. POSTs the client-computed verdict to
 *      `POST /v1/patients/me/vitals-red-flag-event` via
 *      `usePostVitalsRedFlag`. Fire-and-forget with `.catch` so a network
 *      blip never blocks the local UX or the local recheck notification.
 *      Deduped per `(metricType, YYYY-MM-DD(observedAt), severity)` in
 *      AsyncStorage so the same day-key at the same severity is never
 *      POSTed twice — but a same-day amber→red escalation still POSTs
 *      because the severity segment of the key changed.
 *
 *   2. Calls `reconcileVitalsRecheckNotifications` with the current active
 *      amber|red flags. That service owns the SCHEDULE_ONLY_WHEN_GRANTED
 *      permission gate + cancel-by-tag + re-schedule dance — this hook
 *      just feeds it the flag list. Reconciliation is idempotent, so
 *      calling it every time trends resolve is safe.
 *
 * NO PHI on the wire and NO PHI in logs — the POST body carries only the
 * verdict label (`amber` / `red`), never the raw metric value, and the
 * dedupe key holds only the metric taxonomy label + day-key.
 *
 * COS-397 / SCRUM-535: `useHealthKitTrends` exposes a `disabled` flag that
 * is `true` whenever the user has turned Apple Health off in the app
 * preference (or is not on iOS). While `disabled`, this hook is a no-op —
 * we never fire a POST or a recheck reminder from HealthKit data the user
 * has explicitly opted out of. That preference is the master OFF switch.
 *
 * Mirrors the reconcile pattern used by `hooks/use-notification-categories`
 * + `services/plan-task-notifications` — feed the reconciler the current
 * desired set on every settle; let it handle idempotent scheduling and the
 * permission gate. An `inFlight` ref guards against re-entrancy while an
 * evaluation pass is still awaiting AsyncStorage / network.
 */

import { useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useHealthKitTrends } from '@/hooks/use-healthkit-trends';
import { usePostVitalsRedFlag } from '@/hooks/use-post-vitals-red-flag';
import {
  reconcileVitalsRecheckNotifications,
  type ActiveFlag,
} from '@/services/vitals-recheck-notifications';
import {
  evaluateBP,
  evaluateGlucose,
  evaluateStepsDaily,
  evaluateRestingHR,
  evaluateHRVTrend,
  evaluateSpO2,
  splitHRVTrend,
  type MetricType,
  type RuleVerdict,
  type Severity,
} from '@/lib/vitals-red-flag-rules';
import type { LongitudinalTrend, TrendDataPoint } from '@/services/api/types';
import { useNotificationCategories } from './use-notification-categories';

/**
 * Dedupe key format: one entry per (metric, day, severity) so the same
 * observed-at day for the same metric at the same severity can only POST
 * once — but a same-day amber→red escalation still POSTs because the
 * severity segment differs. Prefix keeps the AsyncStorage namespace clean
 * and grep-friendly. Metric label + day-key + severity are non-PHI
 * (taxonomy string + date + verdict label, no reading value).
 */
const DEDUPE_KEY = (metric: MetricType, day: string, severity: Severity): string =>
  `vitalsRedFlag:${metric}:${day}:${severity}`;

/** Only these severities are POSTed / scheduled for recheck. */
type ActionableSeverity = 'amber' | 'red';

interface VitalsCandidate {
  metricType: MetricType;
  verdict: RuleVerdict;
  observedAt: string;
}

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

function latestPoint(points: TrendDataPoint[]): TrendDataPoint | undefined {
  if (!points || points.length === 0) return undefined;
  // `getAllHealthKitVitalTrends` sorts ascending by date, so the last
  // element is the most-recent sample.
  return points[points.length - 1];
}

function isActionable(v: RuleVerdict): v is RuleVerdict & { severity: ActionableSeverity } {
  return v.severity === 'amber' || v.severity === 'red';
}

/**
 * Walk each HealthKit trend and reduce it to one candidate verdict per
 * metric (or none, if the metric has no data / can't be evaluated).
 * Pure — no side effects, no I/O — so it stays cheap and unit-testable.
 */
function evaluateHealthKitTrends(trends: LongitudinalTrend[]): VitalsCandidate[] {
  const byCode = new Map<string, LongitudinalTrend>();
  for (const t of trends) byCode.set(t.metricCode, t);

  const out: VitalsCandidate[] = [];

  // BP: HealthKit stores systolic + diastolic as separate metrics; pair
  // the latest sample from each. Use the newer of the two dates as the
  // canonical observed-at (they normally share a timestamp).
  const sysTrend = byCode.get('hk-bp-systolic');
  const diaTrend = byCode.get('hk-bp-diastolic');
  if (sysTrend && diaTrend) {
    const sys = latestPoint(sysTrend.dataPoints);
    const dia = latestPoint(diaTrend.dataPoints);
    if (sys && dia) {
      const observedAt = sys.date >= dia.date ? sys.date : dia.date;
      out.push({
        metricType: 'bp',
        verdict: evaluateBP(sys.value, dia.value),
        observedAt,
      });
    }
  }

  const glucose = byCode.get('hk-glucose');
  if (glucose) {
    const p = latestPoint(glucose.dataPoints);
    if (p) {
      out.push({
        metricType: 'glucose',
        verdict: evaluateGlucose(p.value),
        observedAt: p.date,
      });
    }
  }

  const steps = byCode.get('hk-steps');
  if (steps) {
    const p = latestPoint(steps.dataPoints);
    if (p) {
      out.push({
        metricType: 'steps',
        verdict: evaluateStepsDaily(p.value),
        observedAt: p.date,
      });
    }
  }

  const restingHR = byCode.get('hk-resting-hr');
  if (restingHR) {
    const p = latestPoint(restingHR.dataPoints);
    if (p) {
      out.push({
        metricType: 'hr',
        verdict: evaluateRestingHR(p.value),
        observedAt: p.date,
      });
    }
  }

  const spo2 = byCode.get('hk-spo2');
  if (spo2) {
    const p = latestPoint(spo2.dataPoints);
    if (p) {
      out.push({
        metricType: 'spo2',
        verdict: evaluateSpO2(p.value),
        observedAt: p.date,
      });
    }
  }

  // HRV: delegate the recent-vs-prior split to the shared helper in
  // `lib/vitals-red-flag-rules` so this observer and the
  // `VitalsRedFlagSection` tile compute the trend from the same window
  // slicing. The rules module gates on `sampleCount >= HRV_MIN_SAMPLES`
  // and returns `info` when data is too sparse to draw a trend, so we
  // safely pass the raw counts through without gating here.
  const hrv = byCode.get('hk-hrv');
  if (hrv && hrv.dataPoints.length > 0) {
    const { recent, prior, sampleCount } = splitHRVTrend(hrv.dataPoints);
    const mean = (xs: number[]): number =>
      xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
    const observedAt = latestPoint(hrv.dataPoints)!.date;
    out.push({
      metricType: 'hrv',
      verdict: evaluateHRVTrend(mean(recent), mean(prior), sampleCount),
      observedAt,
    });
  }

  return out;
}

export function useVitalsRedFlagNotifications(): void {
  const { data: trends, disabled } = useHealthKitTrends(90);
  // 2026-08-12 — the "Health alerts" category. Undefined while the prefs
  // query is loading or on error, which the scheduler treats as ENABLED: a
  // failed prefs read must never silently swallow a "recheck your blood
  // pressure".
  const { data: notifCategories } = useNotificationCategories();
  const healthAlertsEnabled = notifCategories?.preferences?.healthAlerts;
  const postMutation = usePostVitalsRedFlag();
  const inFlight = useRef(false);

  useEffect(() => {
    // Master OFF switch: Apple Health preference (COS-397 / SCRUM-535) or
    // non-iOS platform. `useHealthKitTrends` clamps `data` to [] in either
    // case; the extra `disabled` guard is belt-and-braces.
    if (disabled) return;
    if (!trends || trends.length === 0) return;
    if (inFlight.current) return;

    inFlight.current = true;
    void (async () => {
      try {
        const candidates = evaluateHealthKitTrends(trends);
        const actionable = candidates.filter((c) => isActionable(c.verdict));

        // POST fresh verdicts, deduped per (metric, day-key, severity)
        // so an amber→red escalation on the same day still POSTs.
        for (const c of actionable) {
          const key = DEDUPE_KEY(c.metricType, dayKey(c.observedAt), c.verdict.severity);

          let alreadyPosted: string | null = null;
          try {
            alreadyPosted = await AsyncStorage.getItem(key);
          } catch {
            // Best-effort dedupe: on a storage read failure we may POST
            // again today. Server upserts by (metricType, day-key,
            // severity) so a duplicate POST is a no-op, never a
            // duplicate row.
          }
          if (alreadyPosted) continue;

          try {
            await AsyncStorage.setItem(key, '1');
          } catch {
            // Persistence failed — still fire the POST once so today's
            // verdict lands on the backend even if we lose the dedupe.
          }

          // Fire-and-forget. `mutateAsync` returns a real Promise (unlike
          // `mutate` which returns void), so we can attach `.catch` per
          // the task rule. `usePostVitalsRedFlag` intentionally has no
          // onError side effect — a network blip must never block the
          // local recheck notification below.
          postMutation
            .mutateAsync({
              metricType: c.metricType,
              severity: c.verdict.severity as ActionableSeverity,
              observedAt: c.observedAt,
              source: 'apple-health',
            })
            .catch(() => {
              // Swallow — best-effort. No PHI to log.
            });
        }

        // Reconcile local recheck reminders against the current active
        // flag set. The service handles the permission gate, cancel-by-
        // tag cleanup, and MAX_TOTAL_SCHEDULES cap. Idempotent — always
        // safe to call on every trends settle.
        const active: ActiveFlag[] = actionable.map((c) => ({
          metricType: c.metricType,
          observedAt: c.observedAt,
        }));
        // 2026-08-12 — honour the "Health alerts" category. Read straight
        // from the query cache the settings screen already populates; a miss
        // leaves it undefined, which the scheduler treats as enabled.
        await reconcileVitalsRecheckNotifications(active, healthAlertsEnabled).catch(() => {
          // Non-fatal — local reminders are a nice-to-have.
        });
      } finally {
        inFlight.current = false;
      }
    })();
    // postMutation identity is stable across renders (React Query memoises
    // the mutation object per QueryClient) — depending on it would just
    // add noise without changing behaviour.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trends, disabled, healthAlertsEnabled]);
}
