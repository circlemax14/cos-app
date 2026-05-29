import { Platform, NativeModules } from 'react-native';
import AppleHealthKit from 'react-native-health';
import type {
  HealthKitPermissions,
  HealthInputOptions,
  HealthValue,
  HealthPermission,
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
      console.log('📋 Available methods:', Object.keys(AppleHealthKit).filter(key => typeof (AppleHealthKit as unknown as Record<string, unknown>)[key] === 'function'));
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

    if (!Constants) {
      reject(new Error('HealthKit Constants not available. The app needs to be rebuilt: npx expo run:ios --clean'));
      return;
    }

    const permissions: HealthKitPermissions = {
      permissions: {
        read: [
          Constants.Permissions.StepCount as HealthPermission,
          Constants.Permissions.HeartRate as HealthPermission,
          Constants.Permissions.SleepAnalysis as HealthPermission,
          Constants.Permissions.ActiveEnergyBurned as HealthPermission,
          // SCRUM-240: additional vital reads for the Result Trends screen.
          // Failing to add a permission here causes the matching trend to
          // silently resolve to null, so the chart is missing but the rest
          // of the screen keeps working.
          ...(getHealthKitVitalPermissions() as HealthPermission[]),
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
          Constants.Permissions.StepCount as HealthPermission,
          Constants.Permissions.HeartRate as HealthPermission,
          Constants.Permissions.SleepAnalysis as HealthPermission,
          Constants.Permissions.ActiveEnergyBurned as HealthPermission,
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
      console.log('📋 Available JS wrapper methods:', healthKit ? Object.keys(healthKit).filter(k => typeof (healthKit as unknown as Record<string, unknown>)[k] === 'function') : 'No JS wrapper');
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
        const errorCode = (errorObj as Record<string, unknown>)?.code as string || ((errorObj as Record<string, unknown>)?.userInfo as Record<string, string> | undefined)?.['Error reason'] || '';
        
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
          const errorMessage = (err as Error)?.message || String(err) || '';
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

// ─── Longitudinal vitals series (SCRUM-240) ───────────────────────────────────
//
// Fetches HealthKit samples for vitals over a date window and returns them as
// TrendDataPoint[] — the same shape the backend serves under
// /v1/patients/me/trends — so the Result Trends screen can render HealthKit-
// sourced trends side-by-side with FHIR-sourced ones.
//
// Reference ranges below are conservative adult-population defaults sourced
// from common clinical practice. They are NOT personalised. Their only role
// is to draw the "normal range" band on the chart so the visualisation is
// useful when HealthKit (which has no concept of reference ranges) supplies
// the data. Out-of-range *interpretation* is computed the same way the
// backend does it.

import type { TrendDataPoint, LongitudinalTrend } from './api/types'

export type HealthKitVitalMetric =
  | 'blood-pressure-systolic'
  | 'blood-pressure-diastolic'
  | 'blood-glucose'
  | 'body-temperature'
  | 'oxygen-saturation'
  | 'respiratory-rate'
  | 'heart-rate'
  | 'weight'
  | 'body-mass-index'
  // SCRUM-244: fitness + sleep metrics surfaced as part of the Apple Health
  // carousel at the top of the Result Trends screen.
  | 'steps'
  | 'active-energy'
  | 'distance-walking-running'
  | 'flights-climbed'
  | 'exercise-time'
  | 'resting-heart-rate'
  | 'walking-heart-rate'
  | 'heart-rate-variability'
  | 'sleep-hours'
  // SCRUM-271: expanded HealthKit coverage. These types are all standard
  // HKQuantityTypeIdentifier / HKCategoryTypeIdentifier values supported
  // by react-native-health@1.19+.
  | 'vo2-max'
  | 'walking-speed'
  | 'walking-step-length'
  | 'six-minute-walk-distance'
  | 'stair-ascent-speed'
  | 'stair-descent-speed'
  | 'apple-stand-time'
  | 'mindful-minutes'
  | 'water-intake'
  | 'caffeine-intake'
  | 'headphone-audio-exposure'
  | 'environmental-audio-exposure'
  | 'body-fat-percentage'
  | 'lean-body-mass'
  | 'height'
  | 'waist-circumference'

interface VitalSpec {
  metricCode: string
  metricName: string
  permission: string
  unit: string
  refRange: { low: number; high: number }
  // healthkit returns SpO2 as a 0..1 fraction — we need to scale it to a %.
  scale?: (v: number) => number
  // Which react-native-health method to call. Defaults are inferred from the
  // metric key for clinical vitals (`getBloodPressureSamples`, etc.); fitness
  // metrics are explicit because their HealthKit method names don't share
  // the `get<Metric>Samples` convention.
  fetcher?: string
  // How to reduce multiple samples in a calendar day to one point. Default
  // 'mean' is correct for vitals (BP, HR, glucose). Fitness counters that
  // are inherently cumulative use 'sum' (steps, kcal, distance, flights,
  // exercise minutes).
  dayReducer?: 'mean' | 'sum'
}

const VITAL_SPECS: Record<HealthKitVitalMetric, VitalSpec> = {
  'blood-pressure-systolic': {
    metricCode: 'hk-bp-systolic',
    metricName: 'Blood Pressure (Systolic)',
    permission: 'BloodPressureSystolic',
    unit: 'mmHg',
    refRange: { low: 90, high: 120 },
  },
  'blood-pressure-diastolic': {
    metricCode: 'hk-bp-diastolic',
    metricName: 'Blood Pressure (Diastolic)',
    permission: 'BloodPressureDiastolic',
    unit: 'mmHg',
    refRange: { low: 60, high: 80 },
  },
  'blood-glucose': {
    metricCode: 'hk-glucose',
    metricName: 'Blood Glucose',
    permission: 'BloodGlucose',
    unit: 'mg/dL',
    refRange: { low: 70, high: 100 },
  },
  'body-temperature': {
    metricCode: 'hk-body-temp',
    metricName: 'Body Temperature',
    permission: 'BodyTemperature',
    unit: '°C',
    refRange: { low: 36.1, high: 37.2 },
  },
  'oxygen-saturation': {
    metricCode: 'hk-spo2',
    metricName: 'Oxygen Saturation',
    permission: 'OxygenSaturation',
    unit: '%',
    refRange: { low: 95, high: 100 },
    scale: (v) => v * 100,
  },
  'respiratory-rate': {
    metricCode: 'hk-resp-rate',
    metricName: 'Respiratory Rate',
    permission: 'RespiratoryRate',
    unit: 'breaths/min',
    refRange: { low: 12, high: 20 },
  },
  'heart-rate': {
    metricCode: 'hk-heart-rate',
    metricName: 'Heart Rate',
    permission: 'HeartRate',
    unit: 'bpm',
    refRange: { low: 60, high: 100 },
  },
  weight: {
    metricCode: 'hk-weight',
    metricName: 'Weight',
    permission: 'Weight',
    unit: 'kg',
    refRange: { low: 50, high: 100 },
  },
  'body-mass-index': {
    metricCode: 'hk-bmi',
    metricName: 'Body Mass Index',
    permission: 'BodyMassIndex',
    unit: 'kg/m²',
    refRange: { low: 18.5, high: 24.9 },
  },
  // ── Fitness / activity metrics ─────────────────────────────────────────
  steps: {
    metricCode: 'hk-steps',
    metricName: 'Steps',
    permission: 'StepCount',
    unit: 'steps',
    refRange: { low: 7000, high: 12000 },
    fetcher: 'getDailyStepCountSamples',
    dayReducer: 'sum',
  },
  'active-energy': {
    metricCode: 'hk-active-energy',
    metricName: 'Active Calories',
    permission: 'ActiveEnergyBurned',
    unit: 'kcal',
    refRange: { low: 250, high: 600 },
    fetcher: 'getActiveEnergyBurned',
    dayReducer: 'sum',
  },
  'distance-walking-running': {
    metricCode: 'hk-distance-walking',
    metricName: 'Distance',
    permission: 'DistanceWalkingRunning',
    unit: 'km',
    refRange: { low: 5, high: 10 },
    fetcher: 'getDailyDistanceWalkingRunningSamples',
    dayReducer: 'sum',
    // HealthKit returns distance in metres — convert to km for display.
    scale: (v) => v / 1000,
  },
  'flights-climbed': {
    metricCode: 'hk-flights',
    metricName: 'Flights Climbed',
    permission: 'FlightsClimbed',
    unit: 'floors',
    refRange: { low: 5, high: 20 },
    fetcher: 'getDailyFlightsClimbedSamples',
    dayReducer: 'sum',
  },
  'exercise-time': {
    metricCode: 'hk-exercise-time',
    metricName: 'Exercise Time',
    permission: 'AppleExerciseTime',
    unit: 'min',
    refRange: { low: 30, high: 60 },
    fetcher: 'getAppleExerciseTime',
    dayReducer: 'sum',
  },
  'resting-heart-rate': {
    metricCode: 'hk-resting-hr',
    metricName: 'Resting Heart Rate',
    permission: 'RestingHeartRate',
    unit: 'bpm',
    refRange: { low: 50, high: 70 },
    fetcher: 'getRestingHeartRateSamples',
  },
  'walking-heart-rate': {
    metricCode: 'hk-walking-hr',
    metricName: 'Walking Heart Rate',
    permission: 'WalkingHeartRateAverage',
    unit: 'bpm',
    refRange: { low: 90, high: 130 },
    fetcher: 'getWalkingHeartRateAverage',
  },
  'heart-rate-variability': {
    metricCode: 'hk-hrv',
    metricName: 'Heart Rate Variability',
    permission: 'HeartRateVariability',
    unit: 'ms',
    refRange: { low: 30, high: 80 },
    fetcher: 'getHeartRateVariabilitySamples',
  },
  // Sleep is special: each sample carries start/end timestamps representing
  // a sleep segment, and we want to express total sleep duration per day.
  // The fetcher below is wired but the fetcherName never actually triggers
  // the generic path — getHealthKitVitalTrend short-circuits to the sleep
  // path when metric === 'sleep-hours' so the duration is summed correctly.
  'sleep-hours': {
    metricCode: 'hk-sleep',
    metricName: 'Sleep',
    permission: 'SleepAnalysis',
    unit: 'hours',
    refRange: { low: 7, high: 9 },
    fetcher: 'getSleepSamples',
  },
  // ── SCRUM-271: expanded HealthKit coverage ─────────────────────────────
  'vo2-max': {
    metricCode: 'hk-vo2-max',
    metricName: 'VO₂ Max',
    permission: 'Vo2Max',
    unit: 'mL/(kg·min)',
    refRange: { low: 30, high: 50 },
    fetcher: 'getVo2MaxSamples',
  },
  'walking-speed': {
    metricCode: 'hk-walking-speed',
    metricName: 'Walking Speed',
    permission: 'WalkingSpeed',
    unit: 'm/s',
    refRange: { low: 1.0, high: 1.4 },
    fetcher: 'getWalkingSpeedSamples',
  },
  'walking-step-length': {
    metricCode: 'hk-walking-step-length',
    metricName: 'Walking Step Length',
    permission: 'WalkingStepLength',
    unit: 'cm',
    refRange: { low: 60, high: 80 },
    fetcher: 'getWalkingStepLengthSamples',
  },
  'six-minute-walk-distance': {
    metricCode: 'hk-six-min-walk',
    metricName: '6-Minute Walk Distance',
    permission: 'SixMinuteWalkTestDistance',
    unit: 'm',
    refRange: { low: 400, high: 700 },
    fetcher: 'getSixMinuteWalkTestDistance',
  },
  'stair-ascent-speed': {
    metricCode: 'hk-stair-ascent-speed',
    metricName: 'Stair Ascent Speed',
    permission: 'StairAscentSpeed',
    unit: 'm/s',
    refRange: { low: 0.4, high: 0.7 },
    fetcher: 'getStairAscentSpeedSamples',
  },
  'stair-descent-speed': {
    metricCode: 'hk-stair-descent-speed',
    metricName: 'Stair Descent Speed',
    permission: 'StairDescentSpeed',
    unit: 'm/s',
    refRange: { low: 0.4, high: 0.7 },
    fetcher: 'getStairDescentSpeedSamples',
  },
  'apple-stand-time': {
    metricCode: 'hk-stand-time',
    metricName: 'Stand Time',
    permission: 'AppleStandTime',
    unit: 'min',
    refRange: { low: 60, high: 600 },
    fetcher: 'getAppleStandTime',
    dayReducer: 'sum',
  },
  'mindful-minutes': {
    metricCode: 'hk-mindful',
    metricName: 'Mindful Minutes',
    permission: 'MindfulSession',
    unit: 'min',
    refRange: { low: 5, high: 30 },
    fetcher: 'getMindfulSession',
    dayReducer: 'sum',
  },
  'water-intake': {
    metricCode: 'hk-water',
    metricName: 'Water Intake',
    permission: 'Water',
    unit: 'L',
    refRange: { low: 2, high: 3 },
    fetcher: 'getWater',
    dayReducer: 'sum',
  },
  'caffeine-intake': {
    metricCode: 'hk-caffeine',
    metricName: 'Caffeine',
    permission: 'Caffeine',
    unit: 'mg',
    refRange: { low: 0, high: 400 },
    fetcher: 'getCaffeine',
    dayReducer: 'sum',
  },
  'headphone-audio-exposure': {
    metricCode: 'hk-headphone-audio',
    metricName: 'Headphone Audio',
    permission: 'HeadphoneAudioExposure',
    unit: 'dB SPL',
    refRange: { low: 0, high: 80 },
    fetcher: 'getHeadphoneAudioExposure',
  },
  'environmental-audio-exposure': {
    metricCode: 'hk-environmental-audio',
    metricName: 'Environmental Sound',
    permission: 'EnvironmentalAudioExposure',
    unit: 'dB SPL',
    refRange: { low: 0, high: 70 },
    fetcher: 'getEnvironmentalAudioExposure',
  },
  'body-fat-percentage': {
    metricCode: 'hk-body-fat',
    metricName: 'Body Fat %',
    permission: 'BodyFatPercentage',
    unit: '%',
    refRange: { low: 8, high: 24 },
    fetcher: 'getBodyFatPercentageSamples',
    scale: (v) => v * 100,
  },
  'lean-body-mass': {
    metricCode: 'hk-lean-body-mass',
    metricName: 'Lean Body Mass',
    permission: 'LeanBodyMass',
    unit: 'kg',
    refRange: { low: 40, high: 80 },
    fetcher: 'getLeanBodyMass',
  },
  height: {
    metricCode: 'hk-height',
    metricName: 'Height',
    permission: 'Height',
    unit: 'cm',
    refRange: { low: 150, high: 200 },
    fetcher: 'getHeightSamples',
    scale: (v) => v * 100, // HealthKit returns metres
  },
  'waist-circumference': {
    metricCode: 'hk-waist',
    metricName: 'Waist',
    permission: 'WaistCircumference',
    unit: 'cm',
    refRange: { low: 70, high: 95 },
    fetcher: 'getWaistCircumferenceSamples',
    scale: (v) => v * 100, // HealthKit returns metres
  },
}

const interpretPoint = (
  value: number,
  range: { low: number; high: number },
): TrendDataPoint['interpretation'] => {
  if (value < range.low) return 'low'
  if (value > range.high) return 'high'
  return 'normal'
}

const computeTrendDirection = (
  points: TrendDataPoint[],
  range: { low: number; high: number },
): LongitudinalTrend['trendDirection'] => {
  if (points.length < 2) return 'insufficient_data'
  // simple linear fit slope over time
  const xs = points.map((_, i) => i)
  const ys = points.map((p) => p.value)
  const meanX = xs.reduce((s, v) => s + v, 0) / xs.length
  const meanY = ys.reduce((s, v) => s + v, 0) / ys.length
  let num = 0
  let den = 0
  for (let i = 0; i < xs.length; i++) {
    num += (xs[i] - meanX) * (ys[i] - meanY)
    den += (xs[i] - meanX) ** 2
  }
  if (den === 0) return 'stable'
  const slope = num / den
  // No-slope band: <1% of range per sample step is "stable".
  const stableBand = Math.max(0.5, (range.high - range.low) * 0.01)
  if (Math.abs(slope) < stableBand) return 'stable'
  // Whether slope-up is "improving" or "worsening" depends on the metric —
  // for blood pressure, falling toward range is improving; for SpO2, rising
  // toward range is improving. We use the latest point's distance to the
  // normal range as the truth: if latest is in-range or moving into range,
  // call it improving; otherwise worsening.
  const latest = points[points.length - 1].value
  const earliest = points[0].value
  const distLatest = latest < range.low ? range.low - latest : latest > range.high ? latest - range.high : 0
  const distEarliest = earliest < range.low ? range.low - earliest : earliest > range.high ? earliest - range.high : 0
  if (distLatest < distEarliest) return 'improving'
  if (distLatest > distEarliest) return 'worsening'
  return 'stable'
}

/**
 * SCRUM-271 hotfix (2026-05-29): some VITAL_SPECS reference permission
 * constants that don't exist in react-native-health@1.19 (added in
 * newer versions): WalkingSpeed, WalkingStepLength, SixMinuteWalkTestDistance,
 * StairAscentSpeed, StairDescentSpeed. When Constants.Permissions[X]
 * is undefined and we still pass the raw string literal through to the
 * native init call, the native side throws and the app crashes on
 * launch. Filter to only metrics whose constant actually resolves so
 * unsupported types are skipped silently instead of crashing.
 */
function isMetricSupportedInRNHealth(spec: VitalSpec): boolean {
  const constants = (AppleHealthKit as unknown as HealthKitExtended)?.Constants?.Permissions as
    | Record<string, string>
    | undefined
  return typeof constants?.[spec.permission] === 'string'
}

/**
 * Returns the union of HealthKit Permissions constants for every vital we
 * read in `getHealthKitVitalTrend`, so `initializeHealthKit` can request
 * them up-front and avoid per-metric permission prompts later. Filters
 * out any constant that doesn't exist in the installed react-native-health
 * version (see hotfix note above).
 */
export const getHealthKitVitalPermissions = (): string[] => {
  const constants = (AppleHealthKit as unknown as HealthKitExtended)?.Constants?.Permissions as
    | Record<string, string>
    | undefined
  return Object.values(VITAL_SPECS)
    .map((spec) => constants?.[spec.permission])
    .filter((p): p is string => typeof p === 'string')
}

/**
 * Pulls samples for one vital metric over the last `daysBack` days and
 * returns them as a LongitudinalTrend in the same shape the backend serves.
 *
 * Returns null if HealthKit is unavailable (Android), the user has not
 * granted permission for this metric, or no samples exist in the window.
 */
export const getHealthKitVitalTrend = (
  metric: HealthKitVitalMetric,
  daysBack: number = 90,
): Promise<LongitudinalTrend | null> => {
  return new Promise((resolve) => {
    if (Platform.OS !== 'ios') {
      resolve(null)
      return
    }
    const spec = VITAL_SPECS[metric]
    // SCRUM-271 hotfix: skip metrics whose permission constant doesn't
    // exist in the installed react-native-health version (see note on
    // getHealthKitVitalPermissions). Avoids native-side crashes from
    // unrecognized identifiers.
    if (!isMetricSupportedInRNHealth(spec)) {
      resolve(null)
      return
    }
    const nativeModule = NativeModules.AppleHealthKit || NativeModules.RNAppleHealthKit
    const wrapper = AppleHealthKit as unknown as Record<string, unknown>

    // Sleep is a special case — values come from start/end pairs and we
    // want total sleep duration per day, not the per-sample value. Delegate
    // to the dedicated sleep path.
    if (metric === 'sleep-hours') {
      getHealthKitSleepTrend(daysBack).then(resolve).catch(() => resolve(null))
      return
    }

    // Inferred default fetcher names for the original 9 clinical vitals.
    // Fitness metrics declare `spec.fetcher` explicitly because their
    // names don't follow the get<Metric>Samples convention.
    const inferredFetcher =
      metric === 'blood-pressure-systolic' || metric === 'blood-pressure-diastolic'
        ? 'getBloodPressureSamples'
        : metric === 'blood-glucose'
          ? 'getBloodGlucoseSamples'
          : metric === 'body-temperature'
            ? 'getBodyTemperatureSamples'
            : metric === 'oxygen-saturation'
              ? 'getOxygenSaturationSamples'
              : metric === 'respiratory-rate'
                ? 'getRespiratoryRateSamples'
                : metric === 'heart-rate'
                  ? 'getHeartRateSamples'
                  : metric === 'weight'
                    ? 'getWeightSamples'
                    : metric === 'body-mass-index'
                      ? 'getBmiSamples'
                      : ''
    const fetcherName = spec.fetcher ?? inferredFetcher

    const fetcher =
      (typeof wrapper[fetcherName] === 'function' && (wrapper[fetcherName] as Function)) ||
      (nativeModule && typeof nativeModule[fetcherName] === 'function' && nativeModule[fetcherName]) ||
      null

    if (!fetcher) {
      resolve(null)
      return
    }

    const end = new Date()
    const start = new Date(end.getTime() - daysBack * 24 * 60 * 60 * 1000)
    const options: HealthInputOptions = {
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      ascending: true,
      includeManuallyAdded: true,
    }

    fetcher(options, (err: string | Error | null, results: unknown) => {
      if (err) {
        resolve(null)
        return
      }
      const raw = Array.isArray(results) ? results : []
      if (raw.length === 0) {
        resolve(null)
        return
      }
      // Bucket samples by calendar day and reduce to one representative
      // (mean) per day. HealthKit can return tens of thousands of samples
      // for high-frequency metrics like heart rate or SpO2 from Apple
      // Watch — rendering one chart point per raw sample swamps both the
      // SVG renderer and the data table. Day-level aggregation caps the
      // series at ~daysBack points and keeps the trend visualization
      // truthful for clinical interpretation.
      const dayBuckets = new Map<string, { sum: number; count: number; lastDate: string }>()
      for (const sample of raw as Record<string, unknown>[]) {
        const rawValue =
          metric === 'blood-pressure-systolic'
            ? (sample.bloodPressureSystolicValue as number | undefined)
            : metric === 'blood-pressure-diastolic'
              ? (sample.bloodPressureDiastolicValue as number | undefined)
              : (sample.value as number | undefined)
        if (rawValue === undefined || rawValue === null || Number.isNaN(rawValue)) continue
        const value = spec.scale ? spec.scale(rawValue) : rawValue
        const dateIso = (sample.startDate as string | undefined) ?? ''
        if (!dateIso) continue
        const dayKey = dateIso.slice(0, 10)
        const bucket = dayBuckets.get(dayKey)
        if (bucket) {
          bucket.sum += value
          bucket.count += 1
          // keep the latest within-day timestamp so the chart's x-axis
          // is still anchored on a real sample time, not midnight.
          if (dateIso > bucket.lastDate) bucket.lastDate = dateIso
        } else {
          dayBuckets.set(dayKey, { sum: value, count: 1, lastDate: dateIso })
        }
      }
      // For cumulative daily counters (steps, kcal, distance, flights,
      // exercise minutes), the daily representative is the SUM of intra-day
      // samples — not the mean. The `dayReducer` on the spec controls which.
      const reducer = spec.dayReducer ?? 'mean'
      const points: TrendDataPoint[] = []
      for (const [, bucket] of dayBuckets) {
        const value = reducer === 'sum' ? bucket.sum : bucket.sum / bucket.count
        points.push({
          date: bucket.lastDate,
          value: Math.round(value * 10) / 10,
          unit: spec.unit,
          referenceRange: spec.refRange,
          interpretation: interpretPoint(value, spec.refRange),
        })
      }
      points.sort((a, b) => a.date.localeCompare(b.date))

      if (points.length === 0) {
        resolve(null)
        return
      }

      resolve({
        id: spec.metricCode,
        metricCode: spec.metricCode,
        metricName: spec.metricName,
        category: 'vital',
        dataPoints: points,
        trendDirection: computeTrendDirection(points, spec.refRange),
        trendPeriod: `${daysBack}d`,
        relatedConditions: [],
        relatedMedications: [],
        source: 'apple-health',
      })
    })
  })
}

/**
 * Convenience wrapper: pulls all vitals in parallel and returns the
 * non-empty trends. Failures and "no data" for a given metric are silent —
 * the caller just sees fewer trends.
 */
export const getAllHealthKitVitalTrends = async (
  daysBack: number = 90,
): Promise<LongitudinalTrend[]> => {
  if (Platform.OS !== 'ios') return []
  const metrics = Object.keys(VITAL_SPECS) as HealthKitVitalMetric[]
  const results = await Promise.all(metrics.map((m) => getHealthKitVitalTrend(m, daysBack)))
  return results.filter((t): t is LongitudinalTrend => t !== null)
}

/**
 * Sleep trend — each HealthKit sleep sample carries start/end times that
 * represent a sleep segment (asleep, in-bed, deep, REM, etc.). The user-
 * facing trend is total sleep duration per day, in hours. We sum segment
 * durations per calendar day (keyed by the *start* date so an overnight
 * sleep ending after midnight is bucketed under the day it began).
 */
const getHealthKitSleepTrend = (
  daysBack: number = 90,
): Promise<LongitudinalTrend | null> => {
  return new Promise((resolve) => {
    if (Platform.OS !== 'ios') {
      resolve(null)
      return
    }
    const spec = VITAL_SPECS['sleep-hours']
    const nativeModule = NativeModules.AppleHealthKit || NativeModules.RNAppleHealthKit
    const wrapper = AppleHealthKit as unknown as Record<string, unknown>

    const fetcher =
      (typeof wrapper.getSleepSamples === 'function' && (wrapper.getSleepSamples as Function)) ||
      (nativeModule && typeof nativeModule.getSleepSamples === 'function' && nativeModule.getSleepSamples) ||
      null
    if (!fetcher) {
      resolve(null)
      return
    }

    const end = new Date()
    const start = new Date(end.getTime() - daysBack * 24 * 60 * 60 * 1000)
    const options: HealthInputOptions = {
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      ascending: true,
      includeManuallyAdded: true,
    }

    fetcher(options, (err: string | Error | null, results: unknown) => {
      if (err) {
        resolve(null)
        return
      }
      const raw = Array.isArray(results) ? (results as Record<string, unknown>[]) : []
      if (raw.length === 0) {
        resolve(null)
        return
      }
      // Sum sleep-segment hours per day (keyed by the day the segment began).
      const byDay = new Map<string, { hours: number; lastDate: string }>()
      for (const sample of raw) {
        const startIso = sample.startDate as string | undefined
        const endIso = sample.endDate as string | undefined
        if (!startIso || !endIso) continue
        const startTs = new Date(startIso).getTime()
        const endTs = new Date(endIso).getTime()
        if (Number.isNaN(startTs) || Number.isNaN(endTs) || endTs <= startTs) continue
        const hours = (endTs - startTs) / (1000 * 60 * 60)
        const dayKey = startIso.slice(0, 10)
        const bucket = byDay.get(dayKey)
        if (bucket) {
          bucket.hours += hours
          if (startIso > bucket.lastDate) bucket.lastDate = startIso
        } else {
          byDay.set(dayKey, { hours, lastDate: startIso })
        }
      }
      const points: TrendDataPoint[] = []
      for (const [, bucket] of byDay) {
        points.push({
          date: bucket.lastDate,
          value: Math.round(bucket.hours * 10) / 10,
          unit: spec.unit,
          referenceRange: spec.refRange,
          interpretation: interpretPoint(bucket.hours, spec.refRange),
        })
      }
      if (points.length === 0) {
        resolve(null)
        return
      }
      points.sort((a, b) => a.date.localeCompare(b.date))
      resolve({
        id: spec.metricCode,
        metricCode: spec.metricCode,
        metricName: spec.metricName,
        category: 'vital',
        dataPoints: points,
        trendDirection: computeTrendDirection(points, spec.refRange),
        trendPeriod: `${daysBack}d`,
        relatedConditions: [],
        relatedMedications: [],
        source: 'apple-health',
      })
    })
  })
}

