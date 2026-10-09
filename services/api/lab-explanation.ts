/**
 * COS-1274 — "About this test". `null` = not a recognisable lab test.
 *
 * NOT swallowed: 404 FEATURE_DISABLED / 503 / 400 reach the component as an
 * error so it says it could not load, rather than claiming there is nothing.
 */
import { apiClient } from '@/lib/api-client'
import type { LabExplanation } from './types'

export async function fetchLabExplanation(
  name: string,
  code?: string,
  unit?: string,
): Promise<LabExplanation | null> {
  const res = await apiClient.get<{
    success: boolean
    data: { explanation: LabExplanation | null }
  }>('/v1/labs/explanation', { params: { name: name.trim(), code, unit } })
  return res.data.data.explanation ?? null
}
