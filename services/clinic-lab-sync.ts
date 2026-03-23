/**
 * Clinic and Lab Sync Service
 *
 * Previously synced data to a local WatermelonDB database.
 * Now a no-op — data flows directly from the backend API.
 */

import { ProcessedClinic, ProcessedLab } from './fasten-health-processor';

/**
 * No-op: Previously stored clinics in the local database.
 */
export async function syncClinicsToDatabase(
  _clinics: ProcessedClinic[],
  _database?: any
): Promise<void> {
  // no-op
}

/**
 * No-op: Previously stored labs in the local database.
 */
export async function syncLabsToDatabase(
  _labs: ProcessedLab[],
  _database?: any
): Promise<void> {
  // no-op
}

/**
 * No-op: Previously retrieved clinics from the local database.
 */
export async function getClinicsFromDatabase(
  _database?: any
): Promise<ProcessedClinic[]> {
  return [];
}

/**
 * No-op: Previously retrieved labs from the local database.
 */
export async function getLabsFromDatabase(
  _database?: any
): Promise<ProcessedLab[]> {
  return [];
}

/**
 * No-op: Previously synced both clinics and labs to the local database.
 */
export async function syncClinicsAndLabsToDatabase(
  _clinics: ProcessedClinic[],
  _labs: ProcessedLab[],
  _database?: any
): Promise<void> {
  // no-op
}
