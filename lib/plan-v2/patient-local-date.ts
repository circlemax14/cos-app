/**
 * Pure helper — patient's local calendar day as YYYY-MM-DD.
 *
 * Mirrors `getTodayLocalDate` in services/api/ai-health-plan.ts so both
 * the RN bundle and node --test unit tests can consume the same logic
 * without importing axios/RN.
 *
 * DELIBERATELY NOT `toISOString().slice(0, 10)` — that returns UTC and
 * mis-anchors Pacific users after 17:00 local (SCRUM-595 exists to fix
 * exactly this class of bug on the BE anchors).
 */
export function getTodayLocalDate(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
