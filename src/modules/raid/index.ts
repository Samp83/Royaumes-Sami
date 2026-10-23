/**
 * Entrée publique « serveur » du module Pillage.
 * Avec contracts.ts et ui.tsx, c'est le seul fichier du module qui peut être
 * importé depuis l'extérieur.
 */
import type { Db } from '@/platform/db/client'
import type { EventStore } from '@/platform/event-store/event-store'
import type { ProjectionRunner } from '@/platform/projection/projection'
import { createRaidApi } from './api'
import { createRaidService } from './application/raid-service'
import { createDrizzleRaidsReader } from './infrastructure/drizzle-raids-reader'
import { createDrizzleVillagesReader } from './infrastructure/drizzle-villages-reader'
import { createEventStoreRaidRepository } from './infrastructure/event-store-raid-repository'
import { createRaidHandlers } from './messages'
import { createRaidPersonalData } from './personal-data'

export interface RaidModuleDeps {
  /** Journal d'événements de la plateforme. */
  store: EventStore
  /** Base de données, dans laquelle le module tient ses modèles de lecture. */
  db: Db
  /** Moteur des projections de la plateforme. */
  projections: ProjectionRunner
  /** Distribution de la boîte d'envoi, déclenchée par le Pillage après ses commandes et lectures. */
  dispatch: () => Promise<unknown>
  /** Horloge de référence ; l'heure réelle par défaut. */
  clock?: () => number
  /** Graine du tirage d'un nouveau pillage ; aléatoire par défaut, fixée dans les tests. */
  newSeed?: () => number
}

/** Fabrique du module : assemble les adaptateurs, le service, l'API et les gestionnaires. */
export function createRaidModule({
  store,
  db,
  projections,
  dispatch,
  clock,
  newSeed,
}: RaidModuleDeps) {
  const repo = createEventStoreRaidRepository(store)
  const villages = createDrizzleVillagesReader(db, projections)
  const history = createDrizzleRaidsReader(db, projections)
  const service = createRaidService(repo, villages, history, { dispatch, clock, newSeed })

  return {
    api: createRaidApi(service),
    handlers: createRaidHandlers(service),
    personalData: createRaidPersonalData(store, db),
  }
}

export type { RaidApi } from './api'
