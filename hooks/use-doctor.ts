import { useCallback, useState } from 'react';
import { Platform, PermissionsAndroid } from 'react-native';
import { uploadProviderPhoto } from '@/services/provider-photo';

let ImagePicker: any = null;

const loadImagePicker = async () => {
  if (ImagePicker) return ImagePicker;

  try {
    const ImagePickerModule = await import('react-native-image-picker');
    ImagePicker = ImagePickerModule.default || ImagePickerModule;

    if (!ImagePicker || typeof ImagePicker.launchImageLibrary !== 'function') {
      console.error('react-native-image-picker module loaded but API not available');
      return null;
    }

    return ImagePicker;
  } catch (error) {
    console.error('Failed to load react-native-image-picker:', error);
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
  providerId?: string;
  clinicId?: string;
  clinicName?: string;
}

export function useDoctor(providerId: string) {
  const [doctor, setDoctor] = useState<DoctorData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const loadDoctor = useCallback(async () => {
    // Doctor data comes from route params / Fasten API, not this hook.
    // This hook provides photo upload + local state overlay.
  }, [providerId]);

  const updateDoctor = useCallback(async (updates: Partial<DoctorData>) => {
    if (updates.photoUrl && providerId) {
      try {
        setIsLoading(true);
        // Upload to S3 and save URL in backend
        const photoUrl = await uploadProviderPhoto(providerId, updates.photoUrl);
        setDoctor((prev) => prev ? { ...prev, photoUrl } : { id: providerId, name: '', photoUrl, providerId });
      } catch (err) {
        console.error('Error uploading provider photo:', err);
        setError(err instanceof Error ? err : new Error('Upload failed'));
        throw err;
      } finally {
        setIsLoading(false);
      }
    }
  }, [providerId]);

  const pickImage = useCallback(async (): Promise<string | null> => {
    try {
      const picker = await loadImagePicker();

      if (!picker) {
        throw new Error(
          'Image picker native module is not available. ' +
          'Please install: npm install react-native-image-picker && cd ios && pod install && cd .. && npx expo run:ios --device'
        );
      }

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

      return new Promise((resolve, reject) => {
        const options = {
          mediaType: 'photo' as const,
          includeBase64: false,
          maxHeight: 2000,
          maxWidth: 2000,
          quality: 0.8,
          selectionLimit: 1,
        };

        picker.launchImageLibrary(options, (response: any) => {
          if (response.didCancel) {
            resolve(null);
          } else if (response.errorMessage) {
            reject(new Error(response.errorMessage));
          } else if (response.assets && response.assets.length > 0) {
            resolve(response.assets[0].uri || null);
          } else {
            resolve(null);
          }
        });
      });
    } catch (err) {
      console.error('Error picking image:', err);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      throw new Error(`Failed to pick image: ${errorMessage}`);
    }
  }, []);

  return {
    doctor,
    isLoading,
    error,
    updateDoctor,
    pickImage,
    refresh: loadDoctor,
  };
}
