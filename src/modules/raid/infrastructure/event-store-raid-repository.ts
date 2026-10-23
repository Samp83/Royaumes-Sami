import type { EventStore, NewEvent } from '@/platform/event-store/event-store'
import type { RaidRepository } from '../application/raid-repository'
import { raidStream } from '../contracts'
import { type RaidEvent, replay } from '../domain/raid'

/** Adaptateur du port RaidRepository fondé sur le journal d'événements : un flux par attaquant. */
export function createEventStoreRaidRepository(store: EventStore): RaidRepository {
  return {
    async load(attackerId) {
      const stored = await store.read(raidStream(attackerId))
      const events = stored.map((e) => ({ type: e.type, data: e.data }) as RaidEvent)
      return { state: replay(events), version: stored.at(-1)?.version ?? 0 }
    },

    async save(attackerId, expectedVersion, events, messages) {
      // Les événements du pillage et les messages de la saga : une seule transaction.
      await store.append(
        raidStream(attackerId),
        expectedVersion,
        events as unknown as NewEvent[],
        messages,
      )
    },
  }
}
