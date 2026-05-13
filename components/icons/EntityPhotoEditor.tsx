import React from 'react'
import {
  ActionSheetIOS,
  Alert,
  Platform,
  Pressable,
  View,
  type ViewStyle,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { Camera } from 'lucide-react-native'
import { EntityIcon, type EntityIconProps } from './EntityIcon'
import { useEntityPhotoUpload } from '@/hooks/useEntityPhotoUpload'
import type { EntityType } from '@/services/entity-photo-upload.service'

export interface EntityPhotoEditorProps {
  entityType: EntityType
  entityId: string
  currentPhotoUrl?: string | null
  name?: string
  size?: EntityIconProps['size']
  onChange?: (newPhotoUrl: string) => void
  style?: ViewStyle
}

/**
 * RN editable avatar. Tap the avatar (or the inset camera badge) → an
 * action sheet offers Take Photo / Choose From Library / Cancel → on
 * selection, the file gets uploaded via useEntityPhotoUpload and the
 * resulting photoUrl is fed to `onChange`.
 *
 * Currently used for the 4 new entity types (agency, care-manager,
 * care-giver, clinic). Existing patient/provider photo flows have
 * their own editors against different endpoints.
 */
export function EntityPhotoEditor({
  entityType,
  entityId,
  currentPhotoUrl,
  name,
  size = 'md',
  onChange,
  style,
}: EntityPhotoEditorProps): React.JSX.Element {
  const { uploadPhoto, uploading } = useEntityPhotoUpload({ entityType, entityId })

  async function handleResult(result: ImagePicker.ImagePickerResult) {
    if (result.canceled || !result.assets || result.assets.length === 0) return
    const asset = result.assets[0]
    const mime = asset.mimeType ?? 'image/jpeg'
    const newUrl = await uploadPhoto({ uri: asset.uri, mimeType: mime })
    if (newUrl && onChange) onChange(newUrl)
  }

  async function pickFromLibrary() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow photo access to choose an image.')
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
    })
    await handleResult(result)
  }

  async function takePhoto() {
    const perm = await ImagePicker.requestCameraPermissionsAsync()
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow camera access to take a photo.')
      return
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
    })
    await handleResult(result)
  }

  function showPicker() {
    if (uploading) return
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Take Photo', 'Choose From Library', 'Cancel'],
          cancelButtonIndex: 2,
        },
        (idx) => {
          if (idx === 0) void takePhoto()
          else if (idx === 1) void pickFromLibrary()
        },
      )
    } else {
      Alert.alert(
        'Change photo',
        undefined,
        [
          { text: 'Take Photo', onPress: () => { void takePhoto() } },
          { text: 'Choose From Library', onPress: () => { void pickFromLibrary() } },
          { text: 'Cancel', style: 'cancel' },
        ],
      )
    }
  }

  return (
    <Pressable
      onPress={showPicker}
      disabled={uploading}
      accessibilityRole="button"
      accessibilityLabel={`Change ${entityType} photo`}
      accessibilityState={{ disabled: uploading }}
      style={[{ position: 'relative', alignSelf: 'flex-start', opacity: uploading ? 0.6 : 1 }, style]}
    >
      <EntityIcon
        type={entityType}
        imageUrl={currentPhotoUrl ?? null}
        name={name}
        size={size}
      />

      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          right: -4,
          bottom: -4,
          width: 28,
          height: 28,
          borderRadius: 14,
          backgroundColor: '#2563EB',
          borderWidth: 2,
          borderColor: '#fff',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Camera width={14} height={14} color="#fff" strokeWidth={2} />
      </View>
    </Pressable>
  )
}
