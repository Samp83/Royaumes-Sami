import { eq, inArray, sql } from 'drizzle-orm'
import { GAME_CHANNEL_PREFIX } from '@/modules/dungeon/contracts'
import { RAID_STREAM_PREFIX } from '@/modules/raid/contracts'
import { VILLAGE_CHANNEL_PREFIX } from '@/modules/realm/contracts'
import type { StoredEvent } from '@/platform/event-store/event-store'
import type { DbTransaction, Projection } from '@/platform/projection/projection'
import { gamePlayers, players, raidsByDay } from './schema'

/*
 * Données des événements lus par le Classement. Elles forment le « langage publié »
 * du Village et du Donjon : le Classement en dépend, comme tout lecteur du journal.
 * Seuls les champs utiles sont décrits.
 */
interface GameCreatedData {
  hostId: string
  hostName: string
}
interface PlayerJoinedData {
  playerId: string
  name: string
}
interface GameEndedData {
  result: 'won' | 'lost'
  loot: number
}
interface VillageFoundedData {
  name: string
}
interface RaidPlunderedData {
  at: number
}

/** Jour civil de Paris d'un instant, au format AAAA-MM-JJ : le jour d'un pillage réussi. */
const PARIS_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Paris',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})
export const parisDay = (at: number) => PARIS_DAY.format(new Date(at))

/** Identifiant tiré du nom d'un flux : « dungeon-7f3a » donne « 7f3a ». */
const idFrom = (event: StoredEvent, prefix: string) => event.stream.slice(prefix.length)

/** Enregistre le nom d'un joueur, et sa participation à une expédition. */
async function recordPlayer(tx: DbTransaction, gameId: string, playerId: string, name: string) {
  await tx
    .insert(players)
    .values({ playerId, name })
    .onConflictDoUpdate({ target: players.playerId, set: { name } })
  await tx.insert(gamePlayers).values({ gameId, playerId }).onConflictDoNothing()
}

/**
 * Projection du classement : met à jour les totaux des joueurs à partir du journal.
 * Version 2 : ajout du meilleur butin. Version 3 : ajout des pillages réussis par jour.
 */
export const rankingProjection: Projection = {
  name: 'ranking',
  version: 3,
  eventTypes: [
    'GameCreated',
    'PlayerJoined',
    'GameEnded',
    'VillageFounded',
    'BuildingUpgraded',
    'RaidPlundered',
  ],

  async apply(event, tx) {
    switch (event.type) {
      case 'GameCreated': {
        const data = event.data as unknown as GameCreatedData
        await recordPlayer(tx, idFrom(event, GAME_CHANNEL_PREFIX), data.hostId, data.hostName)
        return
      }

      case 'PlayerJoined': {
        const data = event.data as unknown as PlayerJoinedData
        await recordPlayer(tx, idFrom(event, GAME_CHANNEL_PREFIX), data.playerId, data.name)
        return
      }

      case 'GameEnded': {
        // Le résultat est attribué aux joueurs de l'expédition, compagnons exclus.
        const data = event.data as unknown as GameEndedData
        const gameId = idFrom(event, GAME_CHANNEL_PREFIX)
        const rows = await tx.select().from(gamePlayers).where(eq(gamePlayers.gameId, gameId))
        const ids = rows.map((row) => row.playerId)
        if (ids.length > 0) {
          const won = data.result === 'won'
          await tx
            .update(players)
            .set({
              gamesPlayed: sql`${players.gamesPlayed} + 1`,
              gamesWon: sql`${players.gamesWon} + ${won ? 1 : 0}`,
              gold: sql`${players.gold} + ${won ? data.loot : 0}`,
              bestLoot: sql`greatest(${players.bestLoot}, ${won ? data.loot : 0})`,
            })
            .where(inArray(players.playerId, ids))
        }
        // L'expédition est terminée : la liste de ses joueurs n'est plus utile.
        await tx.delete(gamePlayers).where(eq(gamePlayers.gameId, gameId))
        return
      }

      case 'VillageFounded': {
        const data = event.data as unknown as VillageFoundedData
        const playerId = idFrom(event, VILLAGE_CHANNEL_PREFIX)
        await tx
          .insert(players)
          .values({ playerId, village: data.name })
          .onConflictDoUpdate({ target: players.playerId, set: { village: data.name } })
        return
      }

      case 'BuildingUpgraded': {
        const playerId = idFrom(event, VILLAGE_CHANNEL_PREFIX)
        await tx
          .insert(players)
          .values({ playerId, upgrades: 1 })
          .onConflictDoUpdate({
            target: players.playerId,
            set: { upgrades: sql`${players.upgrades} + 1` },
          })
        return
      }

      // Un pillage réussi, compté le jour de sa conclusion pour l'attaquant, désigné par le
      // nom du flux : « raid-alice » donne « alice ».
      case 'RaidPlundered': {
        const data = event.data as unknown as RaidPlunderedData
        await tx
          .insert(raidsByDay)
          .values({ playerId: idFrom(event, RAID_STREAM_PREFIX), day: parisDay(data.at), raids: 1 })
          .onConflictDoUpdate({
            target: [raidsByDay.playerId, raidsByDay.day],
            set: { raids: sql`${raidsByDay.raids} + 1` },
          })
        return
      }
    }
  },

  async reset(tx) {
    await tx.delete(raidsByDay)
    await tx.delete(gamePlayers)
    await tx.delete(players)
  },
}
