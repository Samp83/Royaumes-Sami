import { eq } from 'drizzle-orm'
import type { Projection } from '@/platform/projection/projection'
import { RAID_STREAM_PREFIX } from '../contracts'
import type { RaidEvent } from '../domain/raid'
import { raids } from './schema'

/** Projection de l'historique des pillages, construite à partir des événements du Pillage. */
export const raidsProjection: Projection = {
  name: 'raid-history',
  version: 1,
  eventTypes: ['RaidLaunched', 'RaidPlundered', 'RaidRepelled'],

  async apply(stored, tx) {
    if (!stored.stream.startsWith(RAID_STREAM_PREFIX)) return
    const event = { type: stored.type, data: stored.data } as RaidEvent

    switch (event.type) {
      case 'RaidLaunched':
        await tx
          .insert(raids)
          .values({
            raidId: event.data.raidId,
            attackerId: event.data.attackerId,
            defenderId: event.data.defenderId,
            outcome: event.data.outcome,
            status: event.data.outcome === 'success' ? 'plundering' : 'penalizing',
            launchedAt: event.data.at,
          })
          .onConflictDoNothing()
        return
      case 'RaidPlundered':
        await tx
          .update(raids)
          .set({ status: 'completed', loot: event.data.loot })
          .where(eq(raids.raidId, event.data.raidId))
        return
      case 'RaidRepelled':
        await tx
          .update(raids)
          .set({ status: 'completed', lostBuilding: event.data.lostBuilding })
          .where(eq(raids.raidId, event.data.raidId))
        return
    }
  },

  async reset(tx) {
    await tx.delete(raids)
  },
}
