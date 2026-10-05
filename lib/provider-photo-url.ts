/**
 * Clinic-crawler photos on provider avatars.
 *
 * The provider list may carry `photoUrl`: a staff photo crawled from the
 * clinic's own website, as a presigned https URL that expires in about six
 * hours. Because it expires it is display-only — never saved into the circle
 * selection or the on-device doctor record, where it would outlive its
 * signature and render as a dead image.
 */

/** Only an https string is a photo; anything else is dropped at the boundary. */
export function remotePhotoUrl(raw: unknown): string | undefined {
  return typeof raw === 'string' && raw.startsWith('https://') ? raw : undefined;
}

/**
 * A photo the patient chose on this device (the `doctor_data_<id>` map from
 * useDoctorPhotos) wins; the clinic photo fills in only when there is none.
 */
export function providerPhotoUrl(
  localPhotos: Map<string, string>,
  provider: { id: string; photoUrl?: string },
): string | null {
  return localPhotos.get(provider.id) ?? provider.photoUrl ?? null;
}

/**
 * The circle selection is stored on the server, so any photoUrl it holds may
 * be long expired. Replace it with the one from the provider list just
 * fetched — or nothing, which renders exactly as the ring did before.
 */
export function withFreshPhotos<T extends { id: string; photoUrl?: string }>(
  saved: T[],
  fetched: { id: string; photoUrl?: string }[],
): T[] {
  const fresh = new Map(fetched.map((p) => [p.id, p.photoUrl]));
  return saved.map((p) => ({ ...p, photoUrl: fresh.get(p.id) }));
}
