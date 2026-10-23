/**
 * Vue d'un pillage pour son attaquant. Règle 13 : elle ne contient pas le niveau du défenseur ; l'attaquant ne connaît que le résultat.
 */
import type { Amounts, Raid, RaidOutcome, RaidStatus } from './raid'

export interface RaidView {
  raidId: string
  defenderId: string
  outcome: RaidOutcome
  status: RaidStatus
  /** Ressources prises au défenseur ; null tant que le prélèvement n'a pas eu lieu. */
  loot: Amounts | null
  /** Bâtiment de l'attaquant qui a perdu un niveau ; null si aucun. */
  lostBuilding: string | null
  launchedAt: number
  completedAt: number | null
}

export const toView = (raid: Raid): RaidView => ({
  raidId: raid.raidId,
  defenderId: raid.defenderId,
  outcome: raid.outcome,
  status: raid.status,
  loot: raid.loot,
  lostBuilding: raid.lostBuilding,
  launchedAt: raid.launchedAt,
  completedAt: raid.completedAt,
})
