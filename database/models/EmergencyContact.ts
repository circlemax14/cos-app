// @ts-nocheck - WatermelonDB decorators handle field initialization
import { Model } from '@nozbe/watermelondb';
import { field, date } from '@nozbe/watermelondb/decorators';

export default class EmergencyContact extends Model {
  static table = 'emergency_contacts';

  @field('name') name!: string;
  @field('relationship') relationship!: string | null;
  @field('phone') phone!: string | null;
  @field('email') email!: string | null;
  @field('patient_id') patientId!: string | null;
  @field('clinic_id') clinicId!: string | null;
  @field('clinic_name') clinicName!: string | null;
  @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;
  @date('synced_at') syncedAt!: Date | null;
}
