// @ts-nocheck - WatermelonDB decorators handle field initialization
import { Model } from '@nozbe/watermelondb';
import { field, date } from '@nozbe/watermelondb/decorators';

export default class HealthDetails extends Model {
  static table = 'health_details';

  @field('height') height!: string | null; // e.g., "182 cm"
  @field('weight') weight!: string | null; // e.g., "111.1 kg"
  @field('blood_type') bloodType!: string | null; // e.g., "O+", "A-", etc.
  @field('blood_pressure_systolic') bloodPressureSystolic!: string | null; // e.g., "120"
  @field('blood_pressure_diastolic') bloodPressureDiastolic!: string | null; // e.g., "80"
  @field('uses_cpap') usesCpap!: boolean;
  @field('chronic_conditions') chronicConditions!: string | null; // JSON array as string
  @field('patient_id') patientId!: string | null;
  @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;
  @date('synced_at') syncedAt!: Date | null;
}
