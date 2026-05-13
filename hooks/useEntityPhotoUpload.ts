import { useCallback, useState } from 'react'
import {
  presignEntityPhoto,
  confirmEntityPhoto,
  type EntityType,
} from '@/services/entity-photo-upload.service'

const ALLOWED_CONTENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

export interface UseEntityPhotoUploadArgs {
  entityType: EntityType
  entityId: string
}

export interface UseEntityPhotoUploadReturn {
  uploadPhoto: (params: { uri: string; mimeType: string }) => Promise<string | null>
  uploading: boolean
  error: Error | null
  lastPhotoUrl: string | null
}

/**
 * RN counterpart of the web hook. Same state machine; the only difference
 * is the file input — RN passes `{ uri, mimeType }` from expo-image-picker
 * instead of a DOM File. The S3 PUT body is reconstructed from the uri
 * via fetch().blob() (RN fetch supports file:// URIs).
 */
export function useEntityPhotoUpload(
  args: UseEntityPhotoUploadArgs,
): UseEntityPhotoUploadReturn {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [lastPhotoUrl, setLastPhotoUrl] = useState<string | null>(null)

  const uploadPhoto = useCallback(
    async ({ uri, mimeType }: { uri: string; mimeType: string }): Promise<string | null> => {
      setUploading(true)
      setError(null)
      try {
        if (!ALLOWED_CONTENT_TYPES.has(mimeType)) {
          throw new Error(`Unsupported file type: ${mimeType}. Use JPEG, PNG, or WebP.`)
        }

        const { uploadUrl, photoUrl } = await presignEntityPhoto({
          entityType: args.entityType,
          entityId: args.entityId,
          contentType: mimeType as 'image/jpeg' | 'image/png' | 'image/webp',
        })

        // RN fetch can read a local file:// URI as a blob.
        const fileRes = await fetch(uri)
        const blob = await fileRes.blob()

        const putRes = await fetch(uploadUrl, {
          method: 'PUT',
          body: blob,
          headers: { 'Content-Type': mimeType },
        })
        if (!putRes.ok) {
          throw new Error(`S3 upload failed: HTTP ${putRes.status}`)
        }

        await confirmEntityPhoto({
          entityType: args.entityType,
          entityId: args.entityId,
          photoUrl,
        })

        setLastPhotoUrl(photoUrl)
        return photoUrl
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err))
        setError(e)
        return null
      } finally {
        setUploading(false)
      }
    },
    [args.entityType, args.entityId],
  )

  return { uploadPhoto, uploading, error, lastPhotoUrl }
}
