// @ts-nocheck - WatermelonDB decorators handle field initialization
import { Model } from '@nozbe/watermelondb';
import { field, date } from '@nozbe/watermelondb/decorators';

export default class Medication extends Model {
  static table = 'medications';

  @field('clinic_id') clinicId!: string | null;
  @field('patient_id') patientId!: string | null;
  @field('name') name!: string;
  @field('dosage') dosage!: string;
  @field('frequency') frequency!: string;
  @field('purpose') purpose!: string | null;
  @field('start_date') startDate!: string | null;
  @field('end_date') endDate!: string | null;
  @field('is_active') isActive!: boolean;
  @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;
  @date('synced_at') syncedAt!: Date | null;
}
