import { beforeEach, describe, expect, it } from 'vitest'
import { createTestDatabase, type Db } from '@/platform/db/client'
import {
  ConcurrencyError,
  createEventStore,
  type EventStore,
} from '@/platform/event-store/event-store'
import { outbox } from '@/platform/outbox/schema'
import type { RaidRepository } from '../application/raid-repository'
import type { RaidEvent } from '../domain/raid'
import { createRaidPersonalData } from '../personal-data'
import { createEventStoreRaidRepository } from './event-store-raid-repository'

const T0 = Date.UTC(2026, 0, 1)

/** Lancement d'un pillage réussi d'un attaquant contre un défenseur. */
const launched = (raidId: string, attackerId: string, defenderId: string): RaidEvent => ({
  type: 'RaidLaunched',
  data: {
    raidId,
    attackerId,
    defenderId,
    attackerLevel: 3,
    defenderLevel: 2,
    seed: 7,
    outcome: 'success',
    penalty: null,
    at: T0,
  },
})
const plundered = (raidId: string): RaidEvent => ({
  type: 'RaidPlundered',
  data: { raidId, loot: { wood: 60 }, at: T0 },
})
const seizeMessage = { topic: 'realm.seize', payload: { transferId: 'alice:r1:seize' } }

// Chaque test dispose d'un journal neuf, sur une base vidée.
let db: Db
let store: EventStore
let repo: RaidRepository
beforeEach(async () => {
  db = await createTestDatabase()
  store = createEventStore(db)
  repo = createEventStoreRaidRepository(store)
})

describe('Adaptateur du Pillage fondé sur le journal', () => {
  it("reconstruit l'état d'un attaquant à partir de son flux, avec sa version", async () => {
    await repo.save('alice', 0, [launched('r1', 'alice', 'bob')], [])
    await repo.save('alice', 1, [plundered('r1')], [])

    const { state, version } = await repo.load('alice')
    expect(version).toBe(2)
    expect(state.raids.r1).toMatchObject({ status: 'completed', loot: { wood: 60 } })
    // Les pillages d'Alice sont dans son propre flux : celui de Bob est vide.
    expect(await repo.load('bob')).toMatchObject({ version: 0, state: { raids: {} } })
  })

  it('enregistre les messages de la saga avec les événements, dans une même transaction', async () => {
    await repo.save('alice', 0, [launched('r1', 'alice', 'bob')], [seizeMessage])
    expect((await db.select().from(outbox)).map((m) => m.topic)).toEqual(['realm.seize'])

    // Une écriture fondée sur une version périmée est refusée, et son message n'est pas enregistré.
    await expect(
      repo.save('alice', 0, [launched('r2', 'alice', 'carol')], [seizeMessage]),
    ).rejects.toBeInstanceOf(ConcurrencyError)
    expect(await db.select().from(outbox)).toHaveLength(1)
  })
})

describe('Données personnelles du Pillage', () => {
  it('exporte les pillages lancés et subis par le joueur, sans niveau ni autre joueur', async () => {
    await repo.save('alice', 0, [launched('r1', 'alice', 'bob'), plundered('r1')], [])
    const contributor = createRaidPersonalData(store)

    expect(await contributor.export('alice')).toEqual({
      launched: [
        {
          raidId: 'r1',
          outcome: 'success',
          loot: { wood: 60 },
          lostBuilding: null,
          launchedAt: T0,
        },
      ],
      suffered: [],
    })
    const bob = await contributor.export('bob')
    expect(bob).toEqual({
      launched: [],
      suffered: [{ raidId: 'r1', outcome: 'success', loot: { wood: 60 }, launchedAt: T0 }],
    })
    expect(JSON.stringify(bob)).not.toMatch(/level|alice/i)
  })
})
