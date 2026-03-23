/**
 * Stub — WatermelonDB removed. Local AI extraction is no longer supported.
 * TODO: replace with server-side Bedrock AI summarization via API.
 */

export interface TreatmentSummaryFile {
  id: string
  name: string
  uri?: string
  mimeType?: string
  fileName?: string
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function summarizeTreatmentFromFiles(_files: TreatmentSummaryFile[]): Promise<string> {
  return ''
}
