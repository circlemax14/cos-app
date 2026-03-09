/**
 * Icon mappings for categories and subcategories
 * Uses SF Symbols (IconSymbol) names compatible with expo-router
 */

export const CATEGORY_ICONS: Record<string, string> = {
  'care-manager': 'person.2.fill',
  'medical': 'cross.case.fill',
  'integrative': 'leaf.circle.fill',
  // Legacy icons kept for any existing references
  'mental-health': 'brain.head.profile',
  'services': 'wrench.and.screwdriver.fill',
  'social-leisure': 'figure.socialdance',
  'faith': 'book.closed.fill',
  'family': 'person.2.fill',
};

export const SUBCATEGORY_ICONS: Record<string, string> = {
  // Medical subcategories
  'pcp': 'stethoscope',
  'all-specialists': 'cross.case.fill',
  'surgical-specialists': 'scissors',
  'registered-nurses': 'cross.fill',
  'nurse-practitioners': 'cross.circle.fill',
  'physician-assistants': 'person.badge.shield.checkmark.fill',
  'physical-occupational-therapists': 'figure.walk',
  'others': 'cross.case',

  // Mental Health subcategories
  'psychiatrist': 'brain.head.profile',
  'psychologist': 'brain',
  'mft': 'person.2.fill',
  'lcsw': 'person.text.rectangle.fill',
  'aa': 'person.2.circle.fill',
  'substance-abuse': 'pills.fill',

  // Family subcategories
  'spouse': 'heart.fill',
  'children': 'figure.child',
  'siblings': 'person.2.fill',
  'parents': 'figure.and.child.holdinghands',
  'cousins': 'person.3.fill',
  'nephews': 'figure.child',
  'niece': 'figure.child',

  // Social/Leisure subcategories
  'friends': 'person.2.fill',
  'groups': 'person.3.fill',
  'exercise': 'figure.run',
  'yoga': 'figure.flexibility',
  'music': 'music.note',
  'concerts': 'music.mic',
  'education': 'book.fill',

  // Faith subcategories
  'priest': 'book.closed.fill',
  'rabbi': 'book.closed.fill',
  'minister': 'book.closed.fill',
  'church': 'building.2.fill',
  'synagogue': 'building.2.fill',

  // Services subcategories
  'meals': 'fork.knife',
  'caregivers': 'person.fill.checkmark',
  'aids': 'figure.walk.circle.fill',
  'housekeeper': 'house.fill',
  'maintenance': 'wrench.and.screwdriver.fill',
  'delivery': 'shippingbox.fill',
  'yard': 'leaf.fill',
};

/**
 * Get icon name for a category
 */
export function getCategoryIcon(categoryId: string): string {
  return CATEGORY_ICONS[categoryId] || 'circle.fill';
}

/**
 * Get icon name for a subcategory
 */
export function getSubCategoryIcon(subCategoryId: string): string {
  return SUBCATEGORY_ICONS[subCategoryId] || 'circle.fill';
}
