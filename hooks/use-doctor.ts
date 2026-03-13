import { useCallback, useEffect, useState } from 'react';
import { getDatabase } from '@/database';
import { Doctor } from '@/database/models';
import { Q } from '@nozbe/watermelondb';
import { Platform, PermissionsAndroid } from 'react-native';
import type { ImagePickerResponse, ImageLibraryOptions } from 'react-native-image-picker';

/** Minimal interface for the dynamically-loaded react-native-image-picker module */
interface ImagePickerModule {
  launchImageLibrary: (options: ImageLibraryOptions, callback: (response: ImagePickerResponse) => void) => void;
}

// Use react-native-image-picker as alternative to expo-image-picker
// This library is more reliable and doesn't depend on Expo's module system
let ImagePicker: ImagePickerModule | null = null;

const loadImagePicker = async () => {
  if (ImagePicker) return ImagePicker;
  
  try {
    // Dynamic import - only loads when needed
    const ImagePickerModule = await import('react-native-image-picker');
    ImagePicker = ImagePickerModule.default || ImagePickerModule;
    
    if (!ImagePicker || typeof ImagePicker.launchImageLibrary !== 'function') {
      console.error('❌ react-native-image-picker module loaded but API not available');
      return null;
    }
    
    return ImagePicker;
  } catch (error) {
    console.error('❌ Failed to load react-native-image-picker:', error);
    return null;
  }
};

export interface DoctorData {
  id: string;
  name: string;
  specialty?: string;
  phone?: string;
  email?: string;
  address?: string;
  photoUrl?: string;
  providerId?: string; // Link to Fasten Health provider ID
  clinicId?: string;
  clinicName?: string;
}

export function useDoctor(providerId: string) {
  const [doctor, setDoctor] = useState<DoctorData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const loadDoctor = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const database = getDatabase();
      if (!database) {
        throw new Error('Database not available. Please ensure you are using a Development Client.');
      }

      const doctorsCollection = database.collections.get<Doctor>('doctors');
      const doctorRecords = await doctorsCollection
        .query(Q.where('provider_id', providerId))
        .fetch();

      if (doctorRecords.length > 0) {
        const record = doctorRecords[0];
        setDoctor({
          id: record.id,
          name: record.name,
          specialty: record.specialty || undefined,
          phone: record.phone || undefined,
          email: record.email || undefined,
          address: record.address || undefined,
          photoUrl: record.photoUrl || undefined,
          providerId: record.providerId || undefined,
          clinicId: record.clinicId || undefined,
          clinicName: record.clinicName || undefined,
        });
      } else {
        // Doctor not found in database
        setDoctor(null);
      }
    } catch (err) {
      console.error('❌ Error loading doctor:', err);
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setIsLoading(false);
    }
  }, [providerId]);

  const updateDoctor = useCallback(async (updates: Partial<DoctorData>) => {
    try {
      const database = getDatabase();
      if (!database) {
        throw new Error('Database not available. Please ensure you are using a Development Client.');
      }

      const doctorsCollection = database.collections.get<Doctor>('doctors');
      const existingRecords = await doctorsCollection
        .query(Q.where('provider_id', providerId))
        .fetch();

      await database.write(async () => {
        if (existingRecords.length > 0) {
          // Update existing record
          const record = existingRecords[0];
          await record.update((doctor) => {
            if (updates.name !== undefined) doctor.name = updates.name;
            if (updates.specialty !== undefined) doctor.specialty = updates.specialty || null;
            if (updates.phone !== undefined) doctor.phone = updates.phone || null;
            if (updates.email !== undefined) doctor.email = updates.email || null;
            if (updates.address !== undefined) doctor.address = updates.address || null;
            if (updates.photoUrl !== undefined) doctor.photoUrl = updates.photoUrl || null;
            if (updates.clinicId !== undefined) doctor.clinicId = updates.clinicId || null;
            if (updates.clinicName !== undefined) doctor.clinicName = updates.clinicName || null;
            doctor.updatedAt = new Date();
          });
          console.log('✅ Updated doctor record in database');
        } else {
          // Create new record
          await doctorsCollection.create((doctor) => {
            doctor.name = updates.name || 'Unknown Doctor';
            doctor.specialty = updates.specialty || null;
            doctor.phone = updates.phone || null;
            doctor.email = updates.email || null;
            doctor.address = updates.address || null;
            doctor.photoUrl = updates.photoUrl || null;
            doctor.providerId = providerId;
            doctor.clinicId = updates.clinicId || null;
            doctor.clinicName = updates.clinicName || null;
            doctor.createdAt = new Date();
            doctor.updatedAt = new Date();
          });
          console.log('✅ Created new doctor record in database');
        }
      });

      // Reload doctor data
      await loadDoctor();
      console.log('✅ Doctor data reloaded from database');
    } catch (err) {
      console.error('❌ Error updating doctor:', err);
      throw err;
    }
  }, [providerId, loadDoctor]);

  const pickImage = useCallback(async (): Promise<string | null> => {
    try {
      console.log('📸 Starting image picker...');
      
      // Get ImagePicker instance (lazy load)
      const picker = await loadImagePicker();
      
      if (!picker) {
        console.error('❌ ImagePicker module is null - native module not linked');
        throw new Error(
          'Image picker native module is not available. ' +
          'Please install: npm install react-native-image-picker && cd ios && pod install && cd .. && npx expo run:ios --device'
        );
      }

      console.log('✅ ImagePicker module loaded');

      // Request permissions (iOS handles this automatically, Android needs explicit request)
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES,
          {
            title: 'Photo Library Permission',
            message: 'The app needs access to your photos to set doctor profile pictures.',
            buttonNeutral: 'Ask Me Later',
            buttonNegative: 'Cancel',
            buttonPositive: 'OK',
          }
        );
        
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          throw new Error('Permission to access media library was denied');
        }
      }

      console.log('✅ Permissions granted, launching image picker...');

      // Launch image picker using react-native-image-picker API
      return new Promise((resolve, reject) => {
        const options = {
          mediaType: 'photo' as const,
          includeBase64: false,
          maxHeight: 2000,
          maxWidth: 2000,
          quality: 0.8,
          selectionLimit: 1,
        };

        picker.launchImageLibrary(options, (response: ImagePickerResponse) => {
          console.log('📸 Image picker response:', {
            didCancel: response.didCancel,
            errorMessage: response.errorMessage,
            hasUri: !!response.assets?.[0]?.uri,
          });

          if (response.didCancel) {
            console.log('ℹ️ User canceled image selection');
            resolve(null);
          } else if (response.errorMessage) {
            console.error('❌ Image picker error:', response.errorMessage);
            reject(new Error(response.errorMessage));
          } else if (response.assets && response.assets.length > 0) {
            const uri = response.assets[0].uri;
            console.log('✅ Image selected:', uri);
            resolve(uri || null);
          } else {
            console.log('ℹ️ No image selected');
            resolve(null);
          }
        });
      });
    } catch (err) {
      console.error('❌ Error picking image:', err);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      throw new Error(`Failed to pick image: ${errorMessage}`);
    }
  }, []);

  useEffect(() => {
    if (providerId) {
      loadDoctor();
    }
  }, [providerId, loadDoctor]);

  return {
    doctor,
    isLoading,
    error,
    updateDoctor,
    pickImage,
    refresh: loadDoctor,
  };
}
