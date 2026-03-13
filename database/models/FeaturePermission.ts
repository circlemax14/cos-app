// @ts-nocheck - WatermelonDB decorators handle field initialization
import { Model } from '@nozbe/watermelondb';
import { field, date } from '@nozbe/watermelondb/decorators';

/**
 * Generic per-feature permission record.
 *
 * Each row represents a single feature key and the current permission status
 * for the logged-in user.
 *
 * Common statuses:
 * - enabled      → feature is fully available
 * - disabled     → feature is not available
 * - purchasable  → feature can be purchased (show paywall / CTA)
 * - purchased    → feature has been purchased and is available
 * - hidden       → feature should not be shown in the UI
 */
export default class FeaturePermission extends Model {
  static table = 'feature_permissions';

  @field('feature_key') featureKey!: string;
  @field('status') status!: string;

  @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;
}

