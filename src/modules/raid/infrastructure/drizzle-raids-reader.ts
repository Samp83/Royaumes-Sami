import { desc, eq, inArray, or } from 'drizzle-orm'
import type { Db } from '@/platform/db/client'
import { ERASED_VILLAGE } from '@/platform/privacy/privacy'
import type { ProjectionRunner } from '@/platform/projection/projection'
import type { RaidsReader } from '../application/raids-reader'
import type { RaidSummary } from '../contracts'
import type { Amounts, RaidOutcome, RaidStatus } from '../domain/raid'
import { raidsProjection } from './raids-projection'
import { raids, villages } from './schema'
import { villagesProjection } from './villages-projection'

/** Nombre maximal de pillages présentés dans l'historique. */
const HISTORY_SIZE = 50

/** Adaptateur du port RaidsReader, fondé sur les tables de l'historique et des villages. */
export function createDrizzleRaidsReader(db: Db, projections: ProjectionRunner): RaidsReader {
  return {
    async list(viewerId) {
      await projections.catchUp(raidsProjection)
      await projections.catchUp(villagesProjection)

      const rows = await db
        .select()
        .from(raids)
        .where(or(eq(raids.attackerId, viewerId), eq(raids.defenderId, viewerId)))
        .orderBy(desc(raids.launchedAt))
        .limit(HISTORY_SIZE)

      // Les événements ne contiennent aucun nom : celui du village de l'autre joueur est
      // retrouvé dans la table des villages, au moment de l'affichage.
      const opponentOf = (row: (typeof rows)[number]) =>
        row.attackerId === viewerId ? row.defenderId : row.attackerId
      const ids = [...new Set(rows.map(opponentOf))]
      const named =
        ids.length === 0
          ? []
          : await db
              .select({ playerId: villages.playerId, name: villages.name })
              .from(villages)
              .where(inArray(villages.playerId, ids))
      const names = new Map(named.map((v) => [v.playerId, v.name]))

      return rows.map((row): RaidSummary => {
        const role = row.attackerId === viewerId ? 'attacker' : 'defender'
        return {
          raidId: row.raidId,
          role,
          opponentVillage: names.get(opponentOf(row)) ?? ERASED_VILLAGE,
          outcome: row.outcome as RaidOutcome,
          status: row.status as RaidStatus,
          loot: row.loot as Amounts | null,
          // La perte de niveau de l'attaquant ne regarde que lui.
          lostBuilding: role === 'attacker' ? row.lostBuilding : null,
          launchedAt: row.launchedAt,
        }
      })
    },
  }
}
