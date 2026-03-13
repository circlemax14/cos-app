import { Platform, NativeModules } from 'react-native';
import AppleHealthKit from 'react-native-health';
import type {
  HealthKitPermissions,
  HealthInputOptions,
  HealthValue,
} from 'react-native-health';

/**
 * Interface for the extended HealthKit API surface that react-native-health
 * bridges at runtime but does not always expose in its TypeScript types.
 */
interface HealthKitExtended {
  initHealthKit: (permissions: HealthKitPermissions, callback: (error: string) => void) => void;
  getAuthStatus: (permissions: HealthKitPermissions, callback: (error: string, results: { permissions: { read: number[] } }) => void) => void;
  getStepCount: (options: HealthInputOptions, callback: (error: string | Error, results: HealthValue) => void) => void;
  getHeartRateSamples: (options: HealthInputOptions, callback: (error: string | Error, results: HealthValue[]) => void) => void;
  getSleepSamples: (options: HealthInputOptions, callback: (error: string | Error, results: HealthValue[]) => void) => void;
  getActiveEnergyBurned: (options: HealthInputOptions, callback: (error: string | Error, results: HealthValue[] | HealthValue) => void) => void;
  Constants: {
    Permissions: {
      StepCount: string;
      HeartRate: string;
      SleepAnalysis: string;
      ActiveEnergyBurned: string;
    };
  };
}

export interface HealthMetrics {
  steps: number;
  heartRate: number | null;
  sleepHours: number;
  caloriesBurned: number;
  isLoading: boolean;
  error: string | null;
}

/**
 * Get the HealthKit module (either from JS wrapper or native module directly)
 * Based on react-native-health documentation: https://github.com/agencyenterprise/react-native-health
 */
const getHealthKitModule = () => {
  // The package exports a JS wrapper that should have all methods
  // But if methods aren't available, try native module directly
  const nativeModule = NativeModules.AppleHealthKit || NativeModules.RNAppleHealthKit;
  
  // Check native module first for all methods
  if (nativeModule && typeof nativeModule.getStepCount === 'function') {
    console.log('✅ Using native module directly (all methods available)');
    return {
      ...nativeModule,
      Constants: AppleHealthKit?.Constants || {
        Permissions: {
          StepCount: 'StepCount',
          HeartRate: 'HeartRate',
          SleepAnalysis: 'SleepAnalysis',
          ActiveEnergyBurned: 'ActiveEnergyBurned',
        },
      },
    };
  }
  
  // Try JS wrapper
  if (AppleHealthKit) {
    // Check if JS wrapper has the methods we need
    const hasAllMethods = 
      typeof (AppleHealthKit as unknown as HealthKitExtended).getStepCount === 'function' &&
      typeof (AppleHealthKit as unknown as HealthKitExtended).getHeartRateSamples === 'function' &&
      typeof (AppleHealthKit as unknown as HealthKitExtended).getSleepSamples === 'function' &&
      typeof (AppleHealthKit as unknown as HealthKitExtended).getActiveEnergyBurned === 'function';
    
    if (hasAllMethods) {
      console.log('✅ Using JS wrapper (all methods available)');
      return AppleHealthKit;
    } else {
      console.warn('⚠️ JS wrapper exists but missing methods');
      console.log('📋 Available methods:', Object.keys(AppleHealthKit).filter(key => typeof (AppleHealthKit as unknown as HealthKitExtended)[key] === 'function'));
    }
  }
  
  // If native module exists but methods aren't bridged, this is a build issue
  if (nativeModule) {
    console.error('❌ Native module exists but methods are not bridged. This requires a full rebuild.');
    console.log('📋 Native module methods:', Object.keys(nativeModule).filter(key => typeof nativeModule[key] === 'function'));
    
    // Return native module anyway - might work after rebuild
    return {
      ...nativeModule,
      Constants: AppleHealthKit?.Constants || {
        Permissions: {
          StepCount: 'StepCount',
          HeartRate: 'HeartRate',
          SleepAnalysis: 'SleepAnalysis',
          ActiveEnergyBurned: 'ActiveEnergyBurned',
        },
      },
    };
  }
  
  return null;
};

/**
 * Check if HealthKit is available on this platform
 */
const isHealthKitAvailable = (): boolean => {
  if (Platform.OS !== 'ios') {
    return false;
  }

  // Check native module directly first
  const nativeModule = NativeModules.AppleHealthKit || NativeModules.RNAppleHealthKit;
  if (nativeModule && typeof nativeModule.initHealthKit === 'function') {
    return true;
  }

  // Check JS wrapper
  if (AppleHealthKit && typeof (AppleHealthKit as unknown as HealthKitExtended).initHealthKit === 'function') {
    return true;
  }

  // If we have a native module but no initHealthKit, log what we do have
  if (nativeModule) {
    const methods = Object.keys(nativeModule).filter(k => typeof nativeModule[k] === 'function');
    console.warn('⚠️ Native module exists but initHealthKit not found. Available methods:', methods);
  }

  return false;
};

/**
 * Initialize HealthKit with required permissions
 * Based on react-native-health documentation: https://github.com/agencyenterprise/react-native-health
 */
export const initializeHealthKit = (): Promise<boolean> => {
  return new Promise((resolve, reject) => {
    if (Platform.OS !== 'ios') {
      reject(new Error('HealthKit is only available on iOS devices.'));
      return;
    }

    // Try native module first (most reliable)
    const nativeModule = NativeModules.AppleHealthKit || NativeModules.RNAppleHealthKit;
    let initMethod: ((permissions: HealthKitPermissions, callback: (error: string) => void) => void) | null = null;
    let Constants: { Permissions: { StepCount: string; HeartRate: string; SleepAnalysis: string; ActiveEnergyBurned: string } } | null = null;

    if (nativeModule && typeof nativeModule.initHealthKit === 'function') {
      console.log('✅ Using native module for initHealthKit');
      initMethod = nativeModule.initHealthKit;
      // Get Constants from JS wrapper if available, otherwise use fallback
      Constants = (AppleHealthKit as unknown as HealthKitExtended)?.Constants || {
        Permissions: {
          StepCount: 'StepCount',
          HeartRate: 'HeartRate',
          SleepAnalysis: 'SleepAnalysis',
          ActiveEnergyBurned: 'ActiveEnergyBurned',
        },
      };
    } 
    // Fallback to JS wrapper
    else if (AppleHealthKit && typeof (AppleHealthKit as unknown as HealthKitExtended).initHealthKit === 'function') {
      console.log('✅ Using JS wrapper for initHealthKit');
      initMethod = (AppleHealthKit as unknown as HealthKitExtended).initHealthKit;
      Constants = (AppleHealthKit as unknown as HealthKitExtended).Constants || {
        Permissions: {
          StepCount: 'StepCount',
          HeartRate: 'HeartRate',
          SleepAnalysis: 'SleepAnalysis',
          ActiveEnergyBurned: 'ActiveEnergyBurned',
        },
      };
    }
    // Last resort - try getHealthKitModule
    else {
      const module = getHealthKitModule();
      if (module && typeof (module as unknown as HealthKitExtended).initHealthKit === 'function') {
        console.log('✅ Using getHealthKitModule for initHealthKit');
        initMethod = (module as unknown as HealthKitExtended).initHealthKit;
        Constants = (module as unknown as HealthKitExtended).Constants || (AppleHealthKit as unknown as HealthKitExtended)?.Constants || {
          Permissions: {
            StepCount: 'StepCount',
            HeartRate: 'HeartRate',
            SleepAnalysis: 'SleepAnalysis',
            ActiveEnergyBurned: 'ActiveEnergyBurned',
          },
        };
      }
    }

    if (!initMethod) {
      const errorMessage = 'HealthKit initHealthKit method not available. The app needs to be rebuilt: npx expo run:ios --clean';
      console.error('❌', errorMessage);
      console.log('📋 Native module exists:', !!nativeModule);
      console.log('📋 Native module has initHealthKit:', nativeModule ? typeof nativeModule.initHealthKit : 'N/A');
      console.log('📋 JS wrapper exists:', !!AppleHealthKit);
      console.log('📋 JS wrapper has initHealthKit:', AppleHealthKit ? typeof (AppleHealthKit as unknown as HealthKitExtended).initHealthKit : 'N/A');
      reject(new Error(errorMessage));
      return;
    }

    const permissions: HealthKitPermissions = {
      permissions: {
        read: [
          Constants.Permissions.StepCount,
          Constants.Permissions.HeartRate,
          Constants.Permissions.SleepAnalysis,
          Constants.Permissions.ActiveEnergyBurned,
        ],
        write: [], // We only need read permissions
      },
    };

    console.log('🔐 Requesting HealthKit permissions:', permissions);

    try {
      initMethod(permissions, (error: string) => {
        try {
          if (error) {
            console.error('❌ Error initializing HealthKit:', error);
            // Parse error to provide better message
            const errorObj = typeof error === 'string' ? { message: error } : error;
            const errorMessage = errorObj?.message || String(error);
            
            if (errorMessage.includes('authorization') || errorMessage.includes('permission')) {
              reject(new Error('Health permissions were denied or not granted. Please enable them in Settings > Privacy & Security > Health > CoS'));
            } else {
              reject(new Error(errorMessage));
            }
            return;
          }
          
          // initHealthKit can succeed even if permissions aren't granted
          // Check authorization status to verify
          handleInitSuccess(resolve);
        } catch (callbackError) {
          console.error('❌ Error in HealthKit init callback:', callbackError);
          reject(callbackError instanceof Error ? callbackError : new Error(String(callbackError)));
        }
      });
    } catch (initError) {
      console.error('❌ Error calling initHealthKit:', initError);
      reject(initError instanceof Error ? initError : new Error(String(initError)));
    }
  });
};

/**
 * Handle successful HealthKit initialization
 */
const handleInitSuccess = (resolve: (value: boolean) => void) => {
  // Try to check auth status if available
  const healthKit = AppleHealthKit || getHealthKitModule();
  if (healthKit && typeof (healthKit as unknown as HealthKitExtended).getAuthStatus === 'function') {
    const Constants = (AppleHealthKit as unknown as HealthKitExtended)?.Constants || {
      Permissions: {
        StepCount: 'StepCount',
        HeartRate: 'HeartRate',
        SleepAnalysis: 'SleepAnalysis',
        ActiveEnergyBurned: 'ActiveEnergyBurned',
      },
    };
    
    const permissions: HealthKitPermissions = {
      permissions: {
        read: [
          Constants.Permissions.StepCount,
          Constants.Permissions.HeartRate,
          Constants.Permissions.SleepAnalysis,
          Constants.Permissions.ActiveEnergyBurned,
        ],
        write: [],
      },
    };
    
    (healthKit as unknown as HealthKitExtended).getAuthStatus(permissions, (authError: string, authResults: { permissions: { read: number[] } }) => {
      if (authError) {
        console.warn('⚠️ Could not check auth status:', authError);
        console.log('✅ HealthKit initialized (auth status check failed)');
        resolve(true);
        return;
      }
      
      // Check if any read permission is authorized
      const readStatuses = authResults?.permissions?.read || [];
      const isAuthorized = readStatuses.some((status: number) => status === 2); // 2 = SharingAuthorized
      
      if (isAuthorized) {
        console.log('✅ HealthKit initialized successfully - permissions granted');
        resolve(true);
      } else {
        console.warn('⚠️ HealthKit initialized but permissions not granted');
        console.log('📋 Auth status:', JSON.stringify(authResults, null, 2));
        // Still resolve - let the data fetch show the actual error
        resolve(true);
      }
    });
  } else {
    console.log('✅ HealthKit initialized (no auth status check available)');
    resolve(true);
  }
};

/**
 * Get today's date range for HealthKit queries
 * HealthKit expects dates in ISO format, but we need to ensure we're using local timezone
 */
const getTodayDateRange = () => {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  const dateRange = {
    startDate: startOfDay.toISOString(),
    endDate: endOfDay.toISOString(),
  };
  
  console.log('📅 Date range for HealthKit query:', {
    start: dateRange.startDate,
    end: dateRange.endDate,
    startLocal: startOfDay.toLocaleString(),
    endLocal: endOfDay.toLocaleString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    now: now.toISOString(),
    nowLocal: now.toLocaleString(),
  });
  
  return dateRange;
};

/**
 * Fetch step count for today
 */
export const getTodayStepCount = (): Promise<number> => {
  return new Promise((resolve, reject) => {
    // Try to get the method from native module directly if JS wrapper doesn't have it
    const nativeModule = NativeModules.AppleHealthKit || NativeModules.RNAppleHealthKit;
    const healthKit = getHealthKitModule();
    
    // Get the method - try JS wrapper first, then native module
    const getStepCountMethod = 
      (healthKit && typeof (healthKit as unknown as HealthKitExtended).getStepCount === 'function') 
        ? (healthKit as unknown as HealthKitExtended).getStepCount
        : (nativeModule && typeof nativeModule.getStepCount === 'function')
          ? nativeModule.getStepCount
          : null;
    
    if (!getStepCountMethod) {
      const errorMsg = `HealthKit getStepCount method not available. This usually means the app needs to be rebuilt. Run: npx expo run:ios --clean`;
      console.error('❌', errorMsg);
      console.log('📋 Available native methods:', nativeModule ? Object.keys(nativeModule).filter(k => typeof nativeModule[k] === 'function') : 'No native module');
      console.log('📋 Available JS wrapper methods:', healthKit ? Object.keys(healthKit).filter(k => typeof (healthKit as unknown as HealthKitExtended)[k] === 'function') : 'No JS wrapper');
      reject(new Error(errorMsg));
      return;
    }

    const options: HealthInputOptions = getTodayDateRange();

    console.log('👣 Fetching step count with options:', options);

    getStepCountMethod(options, (error: string | Error, results: HealthValue) => {
      if (error) {
        // Handle authorization errors specifically
        const errorObj = typeof error === 'string' ? { message: error } : error;
        const errorMessage = errorObj?.message || String(error);
        const errorCode = errorObj?.code || errorObj?.userInfo?.['Error reason'] || '';
        
        console.error('❌ Error fetching step count:', errorMessage);
        console.error('❌ Error details:', JSON.stringify(errorObj, null, 2));
        
        if (errorMessage.includes('Not authorized') || errorMessage.includes('authorization') || errorCode.includes('Not authorized')) {
          reject(new Error('Step count permission not granted. Please enable in Settings > Privacy & Security > Health > CoS'));
        } else {
          reject(new Error(errorMessage));
        }
        return;
      }
      
      console.log('👣 Step count raw results:', JSON.stringify(results, null, 2));
      console.log('👣 Step count value:', results?.value);
      console.log('👣 Step count type:', typeof results?.value);
      
      const stepValue = results?.value || 0;
      console.log('✅ Resolving step count:', stepValue);
      resolve(stepValue);
    });
  });
};

/**
 * Fetch heart rate samples for today and return the most recent value
 * If no data for today, falls back to latest available data
 */
export const getTodayHeartRate = (): Promise<number | null> => {
  return new Promise((resolve, reject) => {
    const nativeModule = NativeModules.AppleHealthKit || NativeModules.RNAppleHealthKit;
    const healthKit = getHealthKitModule();
    
    const getHeartRateMethod = 
      (healthKit && typeof (healthKit as unknown as HealthKitExtended).getHeartRateSamples === 'function')
        ? (healthKit as unknown as HealthKitExtended).getHeartRateSamples
        : (nativeModule && typeof nativeModule.getHeartRateSamples === 'function')
          ? nativeModule.getHeartRateSamples
          : null;
    
    if (!getHeartRateMethod) {
      reject(new Error('HealthKit getHeartRateSamples method not available. Rebuild required: npx expo run:ios --clean'));
      return;
    }

    // Get today's date boundaries
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    
    // Step 1: Try to get today's data first
    const todayOptions: HealthInputOptions = {
      startDate: todayStart.toISOString(),
      endDate: now.toISOString(),
      includeManuallyAdded: true,
      ascending: false,
    };

    console.log('❤️ Step 1: Fetching heart rate for TODAY with options:', JSON.stringify(todayOptions, null, 2));

    getHeartRateMethod(
      todayOptions,
      (error: string | Error, results: HealthValue[]) => {
        if (error) {
          const errorObj = typeof error === 'string' ? { message: error } : error;
          const errorMessage = errorObj?.message || String(error);
          
          console.error('❌ Error fetching heart rate:', errorMessage);
          console.error('❌ Error details:', JSON.stringify(errorObj, null, 2));
          
          if (errorMessage.includes('Authorization not determined') || errorMessage.includes('authorization')) {
            reject(new Error('Heart rate permission not granted. Please enable in Settings > Privacy & Security > Health > CoS'));
          } else {
            reject(new Error(errorMessage));
          }
          return;
        }
        
        console.log('❤️ Step 1 results - Heart rate samples count:', results?.length || 0);
        
        // Filter to only include samples from today
        const todaySamples = (results || []).filter((sample) => {
          const sampleDate = new Date(sample.startDate);
          return sampleDate >= todayStart && sampleDate <= todayEnd;
        });
        
        // Return the most recent heart rate value from today
        if (todaySamples.length > 0) {
          const sortedResults = todaySamples.sort(
            (a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
          );
          const latestValue = sortedResults[0].value || null;
          console.log('✅ Found heart rate for TODAY:', latestValue);
          resolve(latestValue);
          return;
        }
        
        // Step 2: No data for today, try to get latest available data
        console.log('⚠️ No heart rate found for today, trying to get latest available data...');
        
        // Query last 30 days to find latest data
        const monthAgo = new Date(todayStart);
        monthAgo.setDate(monthAgo.getDate() - 30);
        
        const latestOptions: HealthInputOptions = {
          startDate: monthAgo.toISOString(),
          endDate: now.toISOString(),
          includeManuallyAdded: true,
          ascending: false, // Most recent first
        };

        console.log('❤️ Step 2: Fetching latest available heart rate with options:', JSON.stringify(latestOptions, null, 2));

        getHeartRateMethod(
          latestOptions,
          (error2: string | Error, results2: HealthValue[]) => {
            if (error2) {
              console.error('❌ Error fetching latest heart rate:', error2);
              // If we can't get latest data either, return null
              resolve(null);
              return;
            }
            
            if (!results2 || results2.length === 0) {
              console.log('⚠️ No heart rate data found in HealthKit at all');
              resolve(null);
              return;
            }
            
            // Get the most recent heart rate value
            const sortedResults = results2.sort(
              (a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
            );
            
            const latestValue = sortedResults[0].value || null;
            const latestDate = new Date(sortedResults[0].startDate);
            console.log(`✅ Found latest available heart rate: ${latestValue} from ${latestDate.toLocaleDateString()}`);
            
            resolve(latestValue);
          }
        );
      }
    );
  });
};

/**
 * Fetch sleep samples for today and calculate total sleep hours
 * If no data for today, falls back to latest available data
 */
export const getTodaySleepHours = (): Promise<number> => {
  return new Promise((resolve, reject) => {
    const nativeModule = NativeModules.AppleHealthKit || NativeModules.RNAppleHealthKit;
    const healthKit = getHealthKitModule();
    
    const getSleepMethod = 
      (healthKit && typeof (healthKit as unknown as HealthKitExtended).getSleepSamples === 'function')
        ? (healthKit as unknown as HealthKitExtended).getSleepSamples
        : (nativeModule && typeof nativeModule.getSleepSamples === 'function')
          ? nativeModule.getSleepSamples
          : null;
    
    if (!getSleepMethod) {
      reject(new Error('HealthKit getSleepSamples method not available. Rebuild required: npx expo run:ios --clean'));
      return;
    }

    // Get today's date boundaries
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    
    // Step 1: Try to get today's data first
    const todayOptions: HealthInputOptions = {
      startDate: todayStart.toISOString(),
      endDate: now.toISOString(),
      includeManuallyAdded: true,
      ascending: false,
    };

    console.log('😴 Step 1: Fetching sleep data for TODAY with options:', JSON.stringify(todayOptions, null, 2));

    getSleepMethod(
      todayOptions,
      (error: string | Error, results: HealthValue[]) => {
        if (error) {
          const errorObj = typeof error === 'string' ? { message: error } : error;
          const errorMessage = errorObj?.message || String(error);
          
          console.error('❌ Error fetching sleep data:', errorMessage);
          console.error('❌ Error details:', JSON.stringify(errorObj, null, 2));
          
          if (errorMessage.includes('Authorization not determined') || errorMessage.includes('authorization')) {
            reject(new Error('Sleep permission not granted. Please enable in Settings > Privacy & Security > Health > CoS'));
          } else {
            reject(new Error(errorMessage));
          }
          return;
        }
        
        console.log('😴 Step 1 results - Sleep samples count:', results?.length || 0);
        
        // Filter to only include samples from today
        const todaySamples = (results || []).filter((sample) => {
          const sampleDate = new Date(sample.startDate);
          return sampleDate >= todayStart && sampleDate <= todayEnd;
        });
        
        // Calculate total sleep hours from today's samples
        if (todaySamples.length > 0) {
          let totalMinutes = 0;
          todaySamples.forEach((sample, index) => {
            const start = new Date(sample.startDate);
            const end = new Date(sample.endDate);
            const duration = (end.getTime() - start.getTime()) / (1000 * 60); // Convert to minutes
            totalMinutes += duration;
            console.log(`😴 Today sleep sample ${index + 1}: ${duration.toFixed(1)} minutes (${start.toLocaleTimeString()} - ${end.toLocaleTimeString()})`);
          });
          const hours = totalMinutes / 60;
          const roundedHours = Math.round(hours * 10) / 10;
          console.log('✅ Found sleep hours for TODAY:', roundedHours, `(${totalMinutes} minutes)`);
          resolve(roundedHours);
          return;
        }
        
        // Step 2: No data for today, try to get latest available data
        console.log('⚠️ No sleep data found for today, trying to get latest available data...');
        
        // Query last 30 days to find latest data
        const monthAgo = new Date(todayStart);
        monthAgo.setDate(monthAgo.getDate() - 30);
        
        const latestOptions: HealthInputOptions = {
          startDate: monthAgo.toISOString(),
          endDate: now.toISOString(),
          includeManuallyAdded: true,
          ascending: false, // Most recent first
        };

        console.log('😴 Step 2: Fetching latest available sleep data with options:', JSON.stringify(latestOptions, null, 2));

        getSleepMethod(
          latestOptions,
          (error2: string | Error, results2: HealthValue[]) => {
            if (error2) {
              console.error('❌ Error fetching latest sleep data:', error2);
              // If we can't get latest data either, return 0
              resolve(0);
              return;
            }
            
            if (!results2 || results2.length === 0) {
              console.log('⚠️ No sleep data found in HealthKit at all');
              resolve(0);
              return;
            }
            
            // Get the most recent day's sleep data
            // Group samples by date (same day)
            const samplesByDate = new Map<string, HealthValue[]>();
            
            results2.forEach((sample) => {
              const sampleDate = new Date(sample.startDate);
              const dateKey = `${sampleDate.getFullYear()}-${sampleDate.getMonth()}-${sampleDate.getDate()}`;
              
              if (!samplesByDate.has(dateKey)) {
                samplesByDate.set(dateKey, []);
              }
              samplesByDate.get(dateKey)!.push(sample);
            });
            
            // Get the most recent date
            const sortedDates = Array.from(samplesByDate.keys()).sort((a, b) => {
              return new Date(b).getTime() - new Date(a).getTime();
            });
            
            if (sortedDates.length > 0) {
              const latestDateKey = sortedDates[0];
              const latestDateSamples = samplesByDate.get(latestDateKey)!;
              
              // Calculate total sleep hours for the most recent day
              let totalMinutes = 0;
              latestDateSamples.forEach((sample, index) => {
                const start = new Date(sample.startDate);
                const end = new Date(sample.endDate);
                const duration = (end.getTime() - start.getTime()) / (1000 * 60); // Convert to minutes
                totalMinutes += duration;
                console.log(`😴 Latest sleep sample ${index + 1}: ${duration.toFixed(1)} minutes (${start.toLocaleTimeString()} - ${end.toLocaleTimeString()})`);
              });
              
              const hours = totalMinutes / 60;
              const roundedHours = Math.round(hours * 10) / 10;
              
              const latestDate = new Date(latestDateSamples[0].startDate);
              console.log(`✅ Found latest available sleep hours: ${roundedHours} from ${latestDate.toLocaleDateString()} (${totalMinutes} minutes)`);
              
              resolve(roundedHours);
            } else {
              console.log('⚠️ Could not determine latest sleep data');
              resolve(0);
            }
          }
        );
      }
    );
  });
};

/**
 * Fetch active energy burned (calories) for today
 * If no data for today, falls back to latest available data
 */
export const getTodayCaloriesBurned = (): Promise<number> => {
  return new Promise((resolve, reject) => {
    const nativeModule = NativeModules.AppleHealthKit || NativeModules.RNAppleHealthKit;
    const healthKit = getHealthKitModule();
    
    const getCaloriesMethod = 
      (healthKit && typeof (healthKit as unknown as HealthKitExtended).getActiveEnergyBurned === 'function')
        ? (healthKit as unknown as HealthKitExtended).getActiveEnergyBurned
        : (nativeModule && typeof nativeModule.getActiveEnergyBurned === 'function')
          ? nativeModule.getActiveEnergyBurned
          : null;
    
    if (!getCaloriesMethod) {
      reject(new Error('HealthKit getActiveEnergyBurned method not available. Rebuild required: npx expo run:ios --clean'));
      return;
    }

    // Get today's date boundaries for filtering (in local time)
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    
    // Step 1: Try to get today's data first
    const todayOptions: HealthInputOptions = {
      startDate: todayStart.toISOString(),
      endDate: now.toISOString(),
      includeManuallyAdded: true,
      ascending: false,
    };

    console.log('🔥 Step 1: Fetching calories for TODAY with options:', JSON.stringify(todayOptions, null, 2));

    getCaloriesMethod(
      todayOptions,
      (error: string | Error, results: HealthValue[] | HealthValue) => {
        if (error) {
          const errorObj = typeof error === 'string' ? { message: error } : error;
          const errorMessage = errorObj?.message || String(error);
          
          console.error('❌ Error fetching active energy burned:', errorMessage);
          console.error('❌ Error details:', JSON.stringify(errorObj, null, 2));
          
          if (errorMessage.includes('Authorization not determined') || errorMessage.includes('authorization') || errorMessage.includes('Not authorized')) {
            reject(new Error('Calories permission not granted. Please enable in Settings > Privacy & Security > Health > CoS'));
          } else {
            reject(new Error(errorMessage));
          }
          return;
        }
        
        // Handle both array and single object responses
        let resultsArray = Array.isArray(results) ? results : (results ? [results] : []);
        
        console.log('🔥 Step 1 results - Calories samples count:', resultsArray.length);
        
        // Filter to only include samples from today
        const todaySamples = resultsArray.filter((sample) => {
          const sampleDate = new Date(sample.startDate);
          return sampleDate >= todayStart && sampleDate <= todayEnd;
        });
        
        // Calculate today's total
        let todayTotal = 0;
        if (todaySamples.length > 0) {
          todayTotal = todaySamples.reduce((sum, sample) => {
            return sum + (Number(sample.value) || 0);
          }, 0);
          console.log('✅ Found calories for TODAY:', Math.round(todayTotal));
          console.log('🔥 Today samples:', todaySamples.length);
          resolve(Math.round(todayTotal));
          return;
        }
        
        // Step 2: No data for today, try to get latest available data
        console.log('⚠️ No calories found for today, trying to get latest available data...');
        
        // Query last 30 days to find latest data
        const monthAgo = new Date(todayStart);
        monthAgo.setDate(monthAgo.getDate() - 30);
        
        const latestOptions: HealthInputOptions = {
          startDate: monthAgo.toISOString(),
          endDate: now.toISOString(),
          includeManuallyAdded: true,
          ascending: false, // Most recent first
        };

        console.log('🔥 Step 2: Fetching latest available calories with options:', JSON.stringify(latestOptions, null, 2));

        getCaloriesMethod(
          latestOptions,
          (error2: string | Error, results2: HealthValue[] | HealthValue) => {
            if (error2) {
              console.error('❌ Error fetching latest calories:', error2);
              // If we can't get latest data either, return 0
              resolve(0);
              return;
            }
            
            let latestResultsArray = Array.isArray(results2) ? results2 : (results2 ? [results2] : []);
            
            if (latestResultsArray.length === 0) {
              console.log('⚠️ No calorie data found in HealthKit at all');
              resolve(0);
              return;
            }
            
            // Get the most recent day's data
            // Group samples by date (same day)
            const samplesByDate = new Map<string, HealthValue[]>();
            
            latestResultsArray.forEach((sample) => {
              const sampleDate = new Date(sample.startDate);
              const dateKey = `${sampleDate.getFullYear()}-${sampleDate.getMonth()}-${sampleDate.getDate()}`;
              
              if (!samplesByDate.has(dateKey)) {
                samplesByDate.set(dateKey, []);
              }
              samplesByDate.get(dateKey)!.push(sample);
            });
            
            // Get the most recent date
            const sortedDates = Array.from(samplesByDate.keys()).sort((a, b) => {
              return new Date(b).getTime() - new Date(a).getTime();
            });
            
            if (sortedDates.length > 0) {
              const latestDateKey = sortedDates[0];
              const latestDateSamples = samplesByDate.get(latestDateKey)!;
              
              const latestTotal = latestDateSamples.reduce((sum, sample) => {
                return sum + (Number(sample.value) || 0);
              }, 0);
              
              const latestDate = new Date(latestDateSamples[0].startDate);
              console.log(`✅ Found latest available calories: ${Math.round(latestTotal)} from ${latestDate.toLocaleDateString()}`);
              console.log(`🔥 Latest date samples: ${latestDateSamples.length}`);
              
              resolve(Math.round(latestTotal));
            } else {
              console.log('⚠️ Could not determine latest calorie data');
              resolve(0);
            }
          }
        );
      }
    );
  });
};

/**
 * Fetch all health metrics for today
 */
export const getTodayHealthMetrics = async (): Promise<HealthMetrics> => {
  console.log('🏥 Starting to fetch all health metrics...');
  
  try {
    // Initialize HealthKit - MUST complete before fetching data
    // According to react-native-health docs, initHealthKit must succeed before reading data
    try {
      await initializeHealthKit();
      console.log('✅ HealthKit initialized successfully');
      
      // Small delay to ensure permissions are fully processed
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      // If initialization fails, we can't fetch data
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('❌ HealthKit initialization failed:', errorMessage);
      
      // Check if it's an authorization error
      if (errorMessage.includes('authorization') || errorMessage.includes('permission')) {
        return {
          steps: 0,
          heartRate: null,
          sleepHours: 0,
          caloriesBurned: 0,
          isLoading: false,
          error: 'Health permissions are required. Please grant permissions when prompted.',
        };
      }
      
      return {
        steps: 0,
        heartRate: null,
        sleepHours: 0,
        caloriesBurned: 0,
        isLoading: false,
        error: `Failed to initialize HealthKit: ${errorMessage}`,
      };
    }

        console.log('📊 Fetching all metrics in parallel...');

        // Helper to check if error is permission-related
        const isPermissionError = (err: Error | string | unknown): boolean => {
          const errorMessage = err?.message || String(err) || '';
          const errorLower = errorMessage.toLowerCase();
          return (
            errorLower.includes('permission') ||
            errorLower.includes('authorization') ||
            errorLower.includes('denied') ||
            errorLower.includes('not granted') ||
            errorLower.includes('not authorized') ||
            errorLower.includes('authorization not determined')
          );
        };

        // Fetch all metrics in parallel with better error handling
        const errors: string[] = [];
        const permissionErrors: string[] = [];
        
        const [steps, heartRate, sleepHours, caloriesBurned] = await Promise.all([
          getTodayStepCount().catch((err) => {
            console.error('❌ Failed to get steps:', err);
            const errMsg = err?.message || String(err) || '';
            errors.push(errMsg);
            if (isPermissionError(err)) {
              permissionErrors.push(errMsg);
              console.log('🔐 Steps permission error detected:', errMsg);
            }
            return 0;
          }),
          getTodayHeartRate().catch((err) => {
            console.error('❌ Failed to get heart rate:', err);
            const errMsg = err?.message || String(err) || '';
            errors.push(errMsg);
            if (isPermissionError(err)) {
              permissionErrors.push(errMsg);
              console.log('🔐 Heart rate permission error detected:', errMsg);
            }
            return null;
          }),
          getTodaySleepHours().catch((err) => {
            console.error('❌ Failed to get sleep:', err);
            const errMsg = err?.message || String(err) || '';
            errors.push(errMsg);
            if (isPermissionError(err)) {
              permissionErrors.push(errMsg);
              console.log('🔐 Sleep permission error detected:', errMsg);
            }
            return 0;
          }),
          getTodayCaloriesBurned().catch((err) => {
            console.error('❌ Failed to get calories:', err);
            const errMsg = err?.message || String(err) || '';
            errors.push(errMsg);
            if (isPermissionError(err)) {
              permissionErrors.push(errMsg);
              console.log('🔐 Calories permission error detected:', errMsg);
            }
            return 0;
          }),
        ]);

        console.log('📊 Health metrics fetch results:', {
          steps,
          heartRate,
          sleepHours,
          caloriesBurned,
          totalErrors: errors.length,
          permissionErrors: permissionErrors.length,
          allZero: steps === 0 && heartRate === null && sleepHours === 0 && caloriesBurned === 0,
        });

        // If we got permission errors OR all values are 0/null (likely permission denial), set error
        const permissionError = permissionErrors.length > 0 || 
          (errors.length > 0 && steps === 0 && heartRate === null && sleepHours === 0 && caloriesBurned === 0)
          ? 'Health permissions are required. Please enable them in Settings > Privacy & Security > Health > CoS'
          : null;
        
        if (permissionError) {
          console.log('⚠️ Setting permission error in metrics');
        }

        const metrics = {
          steps,
          heartRate,
          sleepHours,
          caloriesBurned,
          isLoading: false,
          error: permissionError,
        };

    console.log('📊 Final health metrics:', {
      steps: `${steps} steps`,
      heartRate: heartRate ? `${heartRate} bpm` : 'N/A',
      sleepHours: `${sleepHours} hours`,
      caloriesBurned: `${caloriesBurned} calories`,
    });

    return metrics;
  } catch (error) {
    console.error('❌ Error in getTodayHealthMetrics:', error);
    return {
      steps: 0,
      heartRate: null,
      sleepHours: 0,
      caloriesBurned: 0,
      isLoading: false,
      error: error instanceof Error ? error.message : 'Failed to fetch health data',
    };
  }
};

