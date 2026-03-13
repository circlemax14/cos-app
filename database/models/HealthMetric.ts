// @ts-nocheck - WatermelonDB decorators handle field initialization
import { Model } from '@nozbe/watermelondb';
import { field, date } from '@nozbe/watermelondb/decorators';

export default class HealthMetric extends Model {
  static table = 'health_metrics';

  @field('patient_id') patientId!: string | null;
  @field('type') type!: string;
  @field('value') value!: string;
  @field('unit') unit!: string | null;
  @field('date') date!: string;
  @field('source') source!: string | null;
  @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;
  @date('synced_at') syncedAt!: Date | null;
}
