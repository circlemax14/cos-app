import { apiClient } from '@/lib/api-client';
import { getAccessToken } from '@/lib/auth-tokens';

export interface PatientDocument {
  id: string;
  title: string;
  description?: string;
  contentType: string;
  contentSize: number;
  documentDate: string;
  documentType?: string;
  documentCategory?: string;
  practitionerName?: string;
  organizationName?: string;
  binaryFhirId?: string;
  status: string;
  createdAt: string;
}

interface BackendDocument extends PatientDocument {
  userId?: string;
  practitionerFhirId?: string;
  organizationFhirId?: string;
  isEhr?: boolean;
}

export async function fetchDocuments(): Promise<PatientDocument[]> {
  const res = await apiClient.get<{ success: boolean; data: BackendDocument[] }>(
    '/v1/patients/me/documents',
  );
  // Backend returns the array directly under data — strip server-only fields.
  return res.data.data.map((d) => ({
    id: d.id,
    title: d.title,
    description: d.description,
    contentType: d.contentType,
    contentSize: d.contentSize,
    documentDate: d.documentDate,
    documentType: d.documentType,
    documentCategory: d.documentCategory,
    practitionerName: d.practitionerName,
    organizationName: d.organizationName,
    binaryFhirId: d.binaryFhirId,
    status: d.status,
    createdAt: d.createdAt,
  }));
}

export async function fetchDocumentDownloadUrl(
  documentId: string,
): Promise<{ downloadUrl: string; contentType: string }> {
  const res = await apiClient.get<{ success: boolean; data: { downloadUrl: string; contentType: string } }>(
    `/v1/patients/me/documents/${encodeURIComponent(documentId)}/download-url`,
  );
  return res.data.data;
}

/**
 * Build the absolute URL + auth headers for the report-binary endpoint.
 * Used by the viewer's WebView to stream content from HealthLake-backed
 * Binaries (the cos-user-documents path uses presigned S3 URLs and
 * doesn't need auth).
 */
export async function getReportBinarySource(
  reportId: string,
  binaryId: string,
): Promise<{ uri: string; headers: Record<string, string> }> {
  const base = (process.env.EXPO_PUBLIC_API_BASE_URL ?? '').replace(/\/$/, '');
  const uri = `${base}/v1/patients/me/reports/${encodeURIComponent(reportId)}/binaries/${encodeURIComponent(binaryId)}`;
  const token = await getAccessToken();
  return {
    uri,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  };
}
