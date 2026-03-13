// @ts-nocheck - WatermelonDB decorators handle field initialization
import { Model } from '@nozbe/watermelondb';
import { field, date } from '@nozbe/watermelondb/decorators';

export default class Clinic extends Model {
  static table = 'clinics';

  @field('name') name!: string;
  @field('identifier') identifier!: string | null;
  @field('address_line') addressLine!: string | null;
  @field('city') city!: string | null;
  @field('state') state!: string | null;
  @field('zip') zip!: string | null;
  @field('country') country!: string | null;
  @field('phone') phone!: string | null;
  @field('email') email!: string | null;
  @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;
  @date('synced_at') syncedAt!: Date | null;
}
