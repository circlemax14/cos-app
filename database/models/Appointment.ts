// @ts-nocheck - WatermelonDB decorators handle field initialization
import { Model } from '@nozbe/watermelondb';
import { field, date } from '@nozbe/watermelondb/decorators';

export default class Appointment extends Model {
  static table = 'appointments';

  @field('clinic_id') clinicId!: string | null;
  @field('patient_id') patientId!: string | null;
  @field('date') date!: string;
  @field('time') time!: string;
  @field('type') type!: string;
  @field('status') status!: string;
  @field('doctor_name') doctorName!: string;
  @field('doctor_specialty') doctorSpecialty!: string | null;
  @field('diagnosis') diagnosis!: string | null;
  @field('notes') notes!: string | null;
  @field('provider_id') providerId!: string | null;
  @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;
  @date('synced_at') syncedAt!: Date | null;
}
