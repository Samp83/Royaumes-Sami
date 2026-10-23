/**
 * Entrée publique « partagée » du module Pillage : utilisable par le serveur
 * comme par l'interface. Elle ne contient que des types, des schémas et des constantes.
 */
import { z } from 'zod'
import type { Amounts, RaidOutcome, RaidStatus } from './domain/raid'

export type { Amounts, RaidError, RaidOutcome, RaidStatus } from './domain/raid'
export type { RaidView } from './domain/view'

/** Corps attendu pour lancer un pillage : le joueur dont le village est visé. */
export const LaunchRaidInput = z.object({ defenderId: z.string().trim().min(1).max(100) })

/** Village qu'un joueur peut viser. Règle 13 : son niveau n'y figure pas. */
export interface Target {
  playerId: string
  villageName: string
}

/** Pillage tel que le présente l'historique d'un joueur, lancé par lui ou subi. */
export interface RaidSummary {
  raidId: string
  /** Rôle du joueur qui consulte l'historique. */
  role: 'attacker' | 'defender'
  /** Nom du village de l'autre joueur. */
  opponentVillage: string
  outcome: RaidOutcome
  status: RaidStatus
  /** Ressources prises au défenseur ; null tant que le prélèvement n'a pas eu lieu. */
  loot: Amounts | null
  /** Bâtiment de l'attaquant qui a perdu un niveau ; présenté à l'attaquant seulement. */
  lostBuilding: string | null
  launchedAt: number
}

/** Préfixe commun aux noms des flux du Pillage : un flux par attaquant. */
export const RAID_STREAM_PREFIX = 'raid-'

/** Nom du flux qui contient les pillages lancés par un joueur. */
export const raidStream = (attackerId: string) => `${RAID_STREAM_PREFIX}${attackerId}`

/** Sujets des messages adressés au Pillage. */
export const RAID_TOPICS = {
  /** Réponse du Village à un prélèvement ou à une perte de niveau. */
  transferResult: 'raid.transfer-result',
} as const
