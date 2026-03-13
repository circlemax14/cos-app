// @ts-nocheck - WatermelonDB decorators handle field initialization
import { Model } from '@nozbe/watermelondb';
import { field, date } from '@nozbe/watermelondb/decorators';

export default class SelectedProvider extends Model {
  static table = 'selected_providers';

  @field('provider_id') providerId!: string;
  @field('name') name!: string;
  @field('qualifications') qualifications!: string | null;
  @field('specialty') specialty!: string | null;
  @field('photo_url') photoUrl!: string | null;
  @field('phone') phone!: string | null;
  @field('email') email!: string | null;
  @field('category') category!: string | null;
  @field('sub_category') subCategory!: string | null;
  @field('sub_categories') subCategories!: string | null; // JSON array as string
  @field('last_visited') lastVisited!: string | null;
  @field('is_manual') isManual!: boolean;
  @field('relationship') relationship!: string | null;
  @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;
}
