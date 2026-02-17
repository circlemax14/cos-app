import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import { NativeModules } from 'react-native';

import { schema } from './schema';
import * as models from './models';
import migrations from './migrations';

// Lazy database initialization for Expo compatibility
let databaseInstance: Database | null = null;

export function getDatabase(): Database | null {
  if (databaseInstance) {
    return databaseInstance;
  }

  // For Expo, we use JSI mode with expo-sqlite for better performance
  // IMPORTANT: WatermelonDB requires a development build, NOT Expo Go
  // You cannot use Expo Go - you must create a development build
  // If the native WatermelonDB DatabaseBridge isn't present, we're likely running
  // inside Expo Go or an environment without native linking. Return null so UI
  // code can gracefully fall back to mock/no-op behavior.
  if (!NativeModules || !NativeModules.DatabaseBridge) {
    console.warn('WatermelonDB native module not found (NativeModules.DatabaseBridge). Skipping DB initialization.');
    return null;
  }

  const adapter = new SQLiteAdapter({
    schema,
    migrations,
    dbName: 'cos_database', // Database name
    jsi: false, // Set to false for now (can enable after rebuild)
    onSetUpError: (error) => {
      // Database failed to load
      console.error('❌ Database setup error:', error);
      
      if (error.message?.includes('DatabaseBridge') || error.message?.includes('NativeModules')) {
        console.error(`
⚠️  NATIVE MODULE ERROR: DatabaseBridge is not defined

This means WatermelonDB native module is not linked.

SOLUTION - You MUST create a development build (Expo Go won't work):

1. Stop Metro bundler (Ctrl+C)

2. For iOS:
   cd ios && pod install && cd ..
   npx expo run:ios

3. For Android:
   npx expo run:android

4. If using EAS Build:
   eas build --profile development --platform ios
   eas build --profile development --platform android

IMPORTANT: 
- You CANNOT use Expo Go with WatermelonDB
- You MUST create a development build
- After building, the native modules will be linked
        `);
      } else if (error.message?.includes('initializeJSI') || error.message?.includes('null')) {
        console.error(`
⚠️  JSI Initialization Error

To fix:
1. Stop Metro bundler (Ctrl+C)
2. Clear cache: npx expo start --clear
3. Rebuild: npx expo run:ios (or run:android)
4. For iOS: cd ios && pod install && cd ..
        `);
      }
    },
  });

  // Create the Watermelon database
  databaseInstance = new Database({
    adapter,
    modelClasses: [
      models.Appointment,
      models.Medication,
      models.MedicalReport,
      models.Doctor,
      models.HealthMetric,
      models.Clinic,
      models.Lab,
      models.SelectedProvider,
      models.EmergencyContact,
      models.HealthDetails,
      models.Proxy,
      models.FeaturePermission,
    ],
  });

  return databaseInstance;
}

// Note: Don't call getDatabase() at module level for Expo compatibility
// Use getDatabase() or useDatabase() hook instead

// Export models for easy access
export * from './models';
