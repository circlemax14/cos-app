/**
 * Care Management Agencies Data
 */

import { apiClient } from '@/lib/api-client';

export interface CareManagerAgency {
  id: string;
  name: string;
  description: string;
  phone?: string;
  email?: string;
  website?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  specialties?: string[];
  services?: string[];
  rating?: number;
  reviewCount?: number;
  logoUrl?: string;
}

/**
 * Get all care manager agencies from the API.
 */
export async function getAllCareManagerAgencies(): Promise<CareManagerAgency[]> {
  try {
    const res = await apiClient.get<{ success: boolean; data: CareManagerAgency[] }>(
      '/v1/care-managers',
    );
    return res.data.data ?? [];
  } catch (err) {
    console.error('Error fetching care manager agencies:', err);
    return [];
  }
}

/**
 * Get care manager agency by ID from the API.
 */
export async function getCareManagerAgencyById(id: string): Promise<CareManagerAgency | undefined> {
  try {
    const res = await apiClient.get<{ success: boolean; data: CareManagerAgency }>(
      `/v1/care-managers/${id}`,
    );
    return res.data.data;
  } catch (err) {
    console.error('Error fetching care manager agency:', err);
    return undefined;
  }
}

/**
 * Search care manager agencies by query via the API.
 */
export async function searchCareManagerAgencies(query: string): Promise<CareManagerAgency[]> {
  try {
    const res = await apiClient.get<{ success: boolean; data: CareManagerAgency[] }>(
      '/v1/care-managers',
      { params: { q: query } },
    );
    return res.data.data ?? [];
  } catch (err) {
    console.error('Error searching care manager agencies:', err);
    return [];
  }
}
