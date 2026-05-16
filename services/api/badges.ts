import { apiClient } from '@/lib/api-client'

export type BadgeTier = 'bronze' | 'silver' | 'gold'
export type BadgeCategory = 'streak' | 'adherence' | 'per-task-type' | 'awareness'

export interface BadgeTierDef {
  tier: BadgeTier
  threshold: number
  label: string
}

export interface BadgeDefinition {
  id: string
  category: BadgeCategory
  name: string
  description: string
  unit: string
  tiers: BadgeTierDef[]
  date?: { month: number; day: number }
}

export interface EarnedBadge {
  id: string
  name: string
  category: BadgeCategory
  tier: BadgeTier
  earnedAt: string
  progress: number
  nextThreshold?: number
  nextTier?: BadgeTier
}

export interface LockedBadge {
  id: string
  name: string
  category: BadgeCategory
  description: string
  nextThreshold: number
  nextTier: BadgeTier
  progress: number
}

export interface BadgeProgressResponse {
  earned: EarnedBadge[]
  locked: LockedBadge[]
  computedAt: string
}

export async function fetchBadgeProgress(): Promise<BadgeProgressResponse> {
  const res = await apiClient.get<{ success: boolean; data: BadgeProgressResponse }>(
    '/v1/patients/me/health-plan/badges',
  )
  return res.data.data
}

export async function fetchBadgeCatalog(): Promise<BadgeDefinition[]> {
  const res = await apiClient.get<{ success: boolean; data: { badges: BadgeDefinition[] } }>(
    '/v1/patients/me/health-plan/badges/catalog',
  )
  return res.data.data.badges
}
