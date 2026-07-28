import { apiClient } from '@/lib/api-client';
import type { Row } from '@/components/health-plan/patient-intake/intake-report-builder';

/**
 * Immunizations API client — COS-481 Phase 2 (EHR-hydrated vaccines).
 *
 * Thin wrapper around `GET /v1/patients/me/immunizations` served by
 * cos-backend on the COS-481/vaccines-ehr-hydrate-be branch. The route is
 * dark-launched behind `IMMUNIZATIONS_EHR_ENABLED` (SSM-backed env var on
 * the Lambda side); when the flag is off, the BE responds with the standard
 * `{ success: true, data: [] }` envelope so the FE renders the pre-Phase-2
 * "patient-added only" card without any error state.
 *
 * Lenient contract: on any transport / server failure we return `[]` instead
 * of throwing. A HealthLake blip must never blank the whole Vaccines card —
 * the patient-added rows in the intake answer bank are the primary source
 * of truth from the user's perspective and stay visible regardless. Mirrors
 * `fetchProviderAllergies` (services/api/providers.ts).
 */
export interface Immunization {
  id: string;
  name: string;
  date?: string;
}

export async function fetchImmunizations(): Promise<Immunization[]> {
  try {
    const res = await apiClient.get<{
      success: boolean;
      data: Immunization[];
    }>('/v1/patients/me/immunizations');
    return res.data.data ?? [];
  } catch {
    return [];
  }
}

/**
 * Shared "Immunization → intake-report Row" mapper. Used by both
 * `IntakeReportScreen` (on-device layered card) and
 * `ShareIntakeReportSection` (PDF export) so the two surfaces cannot drift
 * apart on formatting rules.
 *
 * Row shape mirrors patient-added rows above/below it: `label` renders as
 * small subtext (the date), `value` renders as bold text (the vaccine
 * name). `missing` stays `false` even when the date is absent — we always
 * have at least a name for an EHR row, so the italic "Not shared"
 * fallback never applies.
 *
 * Date formatting matches the intake vaccine formatter's "MMM YYYY" +
 * bare-year passthrough contract (see `formatVaccineDateNote` in
 * `intake-report-builder.ts`) so an EHR row and a patient-added row for
 * the same vaccine render as visually identical strings.
 */
const MMM = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function formatImmunizationDate(date: string | undefined): string {
  if (!date) return '';
  const trimmed = date.trim();
  if (!trimmed) return '';
  if (/^\d{4}$/.test(trimmed)) return trimmed;
  const t = Date.parse(trimmed);
  if (Number.isNaN(t)) return trimmed;
  const d = new Date(t);
  return `${MMM[d.getMonth()]} ${d.getFullYear()}`;
}

export function immunizationToRow(
  imm: Immunization,
  index: number,
): Row {
  const dateText = formatImmunizationDate(imm.date);
  const name = (imm.name ?? '').trim() || 'Unknown vaccine';
  const rowKey = `ehr-immunization-${imm.id || String(index)}`;
  return {
    key: rowKey,
    label: dateText,
    value: name,
    missing: false,
  };
}
