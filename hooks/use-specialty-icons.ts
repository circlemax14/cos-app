import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

/**
 * Fetch the backend-served map of specialty → SVG content. The mobile
 * EntityIcon uses these to render specialty-specific glyphs that survive
 * the iOS 26 Lucide-rendering issue (see project_app_debugging_playbook.md).
 *
 * Cached for 1 hour — these change rarely and a stale icon is fine for far
 * longer than that. On 404 (older backend without the endpoint), the hook
 * returns an empty map and EntityIcon falls back to text initials.
 */

/**
 * Each specialty record is *either* inline SVG content *or* an image URL —
 * never both, never neither. EntityIcon picks the render path based on
 * which field is present.
 */
export interface SpecialtyIconMap {
  [specialty: string]: { svg?: string; imageUrl?: string };
}

export function useSpecialtyIcons() {
  return useQuery({
    queryKey: ['specialty-icons'],
    queryFn: async (): Promise<SpecialtyIconMap> => {
      try {
        const res = await apiClient.get<{ success: boolean; data: { icons: SpecialtyIconMap } }>(
          '/v1/specialty-icons',
        );
        return res.data.data.icons ?? {};
      } catch {
        // Backend not deployed yet, network blip, or 404 — fall back to
        // empty map so EntityIcon uses its text-initials fallback.
        return {};
      }
    },
    staleTime: 60 * 60 * 1000, // 1 hour
    gcTime: 24 * 60 * 60 * 1000, // keep in memory all day
  });
}
