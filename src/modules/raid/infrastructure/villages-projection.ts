import { eq } from 'drizzle-orm'
import { STARTING_LEVELS, VILLAGE_CHANNEL_PREFIX } from '@/modules/realm/contracts'
import type { StoredEvent } from '@/platform/event-store/event-store'
import type { Projection } from '@/platform/projection/projection'
import { villages } from './schema'

/** Identifiant du joueur tiré du nom du flux de son village : « village-alice » donne « alice ». */
const playerIdOf = (event: StoredEvent) => event.stream.slice(VILLAGE_CHANNEL_PREFIX.length)

/**
 * Projection des villages, construite à partir du langage publié du Village : sa fondation,
 * ses améliorations et ses pertes de niveau. Le Pillage ne lit jamais les tables du Village.
 */
export const villagesProjection: Projection = {
  name: 'raid-villages',
  version: 1,
  eventTypes: ['VillageFounded', 'BuildingUpgraded', 'BuildingDowngraded'],

  async apply(event, tx) {
    if (!event.stream.startsWith(VILLAGE_CHANNEL_PREFIX)) return
    const playerId = playerIdOf(event)

    if (event.type === 'VillageFounded') {
      // Les niveaux de départ ne figurent pas dans l'événement : ils sont publiés par le Village.
      await tx
        .insert(villages)
        .values({ playerId, name: String(event.data.name), levels: { ...STARTING_LEVELS } })
        .onConflictDoNothing()
      return
    }

    // Amélioration ou perte de niveau : le bâtiment prend le niveau indiqué par l'événement.
    const [row] = await tx.select().from(villages).where(eq(villages.playerId, playerId))
    if (!row) return
    const levels = { ...(row.levels as Record<string, number>) }
    levels[String(event.data.building)] = Number(event.data.toLevel)
    await tx.update(villages).set({ levels }).where(eq(villages.playerId, playerId))
  },

  async reset(tx) {
    await tx.delete(villages)
  },
}
