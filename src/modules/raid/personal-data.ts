import type { EventStore } from '@/platform/event-store/event-store'
import type { PersonalDataContributor } from '@/platform/privacy/privacy'
import { RAID_STREAM_PREFIX, raidStream } from './contracts'
import { type RaidEvent, replay } from './domain/raid'

/**
 * Données personnelles du Pillage : les pillages lancés et subis par le joueur.
 * Les événements du Pillage ne contiennent aucun nom : ils n'ont rien à réécrire lors d'un
 * effacement, et le module ne tient encore aucune table.
 */
export function createRaidPersonalData(store: EventStore): PersonalDataContributor {
  return {
    name: 'raid',

    async export(playerId) {
      // Pillages lancés : le flux du joueur. Ni le défenseur ni les niveaux n'y figurent.
      const own = await store.read(raidStream(playerId))
      const state = replay(own.map((e) => ({ type: e.type, data: e.data }) as RaidEvent))
      const launched = Object.values(state.raids).map((raid) => ({
        raidId: raid.raidId,
        outcome: raid.outcome,
        loot: raid.loot,
        lostBuilding: raid.lostBuilding,
        launchedAt: raid.launchedAt,
      }))

      // Pillages subis : ils se trouvent dans les flux de leurs attaquants. Ni l'attaquant
      // ni les niveaux n'y figurent.
      const stored = await store.readAll({
        streamPrefix: RAID_STREAM_PREFIX,
        types: ['RaidLaunched', 'RaidPlundered'],
      })
      const loot = new Map(
        stored.filter((e) => e.type === 'RaidPlundered').map((e) => [e.data.raidId, e.data.loot]),
      )
      const suffered = stored
        .filter((e) => e.type === 'RaidLaunched' && e.data.defenderId === playerId)
        .map((e) => ({
          raidId: e.data.raidId,
          outcome: e.data.outcome,
          loot: loot.get(e.data.raidId) ?? null,
          launchedAt: e.data.at,
        }))

      return { launched, suffered }
    },
  }
}
