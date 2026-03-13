// @ts-nocheck - WatermelonDB decorators handle field initialization
import { Model } from '@nozbe/watermelondb';
import { field, date } from '@nozbe/watermelondb/decorators';

export default class Proxy extends Model {
  static table = 'proxies';

  @field('email') email!: string;
  @field('status') status!: string; // 'pending', 'active', 'revoked'
  @field('consent_given') consentGiven!: boolean;
  @field('consent_date') consentDate!: string | null;
  @field('patient_id') patientId!: string | null;
  @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;
}
