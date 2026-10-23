import { asc, eq, ne } from 'drizzle-orm'
import type { Db } from '@/platform/db/client'
import type { ProjectionRunner } from '@/platform/projection/projection'
import type { VillagesReader } from '../application/villages-reader'
import type { Levels } from '../domain/raid'
import { villages } from './schema'
import { villagesProjection } from './villages-projection'

/** Nombre maximal de villages présentés comme cibles. */
const TARGETS_SIZE = 100

/** Adaptateur du port VillagesReader, fondé sur la table des villages de la projection. */
export function createDrizzleVillagesReader(db: Db, projections: ProjectionRunner): VillagesReader {
  return {
    async levelsOf(playerId) {
      // La projection est rattrapée juste avant la lecture : les niveaux lus tiennent compte de
      // tous les événements du Village enregistrés jusqu'ici, sauf ceux encore en cours d'écriture.
      await projections.catchUp(villagesProjection)
      const [row] = await db.select().from(villages).where(eq(villages.playerId, playerId))
      return row ? { levels: row.levels as Levels } : null
    },

    async targets(viewerId) {
      await projections.catchUp(villagesProjection)
      // Règle 13 : seuls l'identifiant du joueur et le nom de son village sont lus.
      return db
        .select({ playerId: villages.playerId, villageName: villages.name })
        .from(villages)
        .where(ne(villages.playerId, viewerId))
        .orderBy(asc(villages.name))
        .limit(TARGETS_SIZE)
    },
  }
}
