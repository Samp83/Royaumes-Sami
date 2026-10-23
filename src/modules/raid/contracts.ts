/**
 * Entrée publique « partagée » du module Pillage : utilisable par le serveur
 * comme par l'interface. Elle ne contient que des types et des constantes.
 */
export type { Amounts, RaidError, RaidOutcome, RaidStatus } from './domain/raid'
export type { RaidView } from './domain/view'

/** Préfixe commun aux noms des flux du Pillage : un flux par attaquant. */
export const RAID_STREAM_PREFIX = 'raid-'

/** Nom du flux qui contient les pillages lancés par un joueur. */
export const raidStream = (attackerId: string) => `${RAID_STREAM_PREFIX}${attackerId}`
