/**
 * Clinic-crawler photos on provider avatars.
 *
 * The provider list may carry `photoUrl`: a staff photo crawled from the
 * clinic's own website, as a presigned https URL that expires in about six
 * hours. Because it expires it is display-only — never saved into the circle
 * selection or the on-device doctor record, where it would outlive its
 * signature and render as a dead image.
 */

/**
 * The crawler bucket (cos-clinic-crawler-<stage>-<account>), virtual-hosted,
 * with or without a region label — the only host a clinic photo comes from.
 * Pinned because any other host — the clinic's own site, a scraped <img src> —
 * would learn this patient's IP and that they see this provider. The `/` after
 * the host stops `.evil.example` and `@evil.example` tails.
 * ponytail: path-style (s3.<region>.amazonaws.com/<bucket>) is rejected; the
 * backend's S3Client is not forcePathStyle and the bucket name is DNS-safe.
 */
const CRAWLER_BUCKET_URL =
  /^https:\/\/cos-clinic-crawler-[a-z]+-676726973617\.s3(\.[a-z0-9-]+)?\.amazonaws\.com\//;

/** Only a crawler-bucket https URL is a photo; anything else is dropped at the boundary. */
export function remotePhotoUrl(raw: unknown): string | undefined {
  return typeof raw === 'string' && CRAWLER_BUCKET_URL.test(raw) ? raw : undefined;
}

/**
 * Collapsing duplicate rows of one clinician keeps one row; the photo must not
 * die with the other. The backend matches photos per row (each row's clinic),
 * so the same person can arrive with the photo on the row dedupe drops.
 */
export function withPhotoFrom<T extends { photoUrl?: string }>(
  kept: T,
  dropped: { photoUrl?: string } | undefined,
): T {
  return !kept.photoUrl && dropped?.photoUrl ? { ...kept, photoUrl: dropped.photoUrl } : kept;
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
