import { and, asc, desc, eq } from 'drizzle-orm'
import type { Db } from '@/platform/db/client'
import type { ProjectionRunner } from '@/platform/projection/projection'
import type { RankingReader } from '../application/ranking-reader'
import { parisDay, rankingProjection } from './ranking-projection'
import { players, raidsByDay } from './schema'

/** Nom affiché d'un joueur : son nom s'il est connu, sinon celui de son village. */
const labelOf = (row: typeof players.$inferSelect) =>
  row.name ?? (row.village ? `Seigneur de ${row.village}` : 'Joueur inconnu')

/**
 * Adaptateur du port RankingReader, fondé sur la table du classement. L'horloge désigne le
 * jour dont les pillages réussis sont présentés.
 */
export function createDrizzleRankingReader(
  db: Db,
  projections: ProjectionRunner,
  clock: () => number = () => Date.now(),
): RankingReader {
  return {
    async top(limit) {
      // Rattrapage à la lecture : la table est mise à jour avant d'être lue.
      await projections.catchUp(rankingProjection)

      // La position est lue avant la table : la table reflète au moins cette position.
      // Lue après, elle pourrait annoncer un événement appliqué entre-temps, et absent des lignes.
      const position = await projections.positionOf(rankingProjection.name)
      // Les pillages du jour sont présentés à côté des totaux : ils n'interviennent pas dans l'ordre.
      const rows = await db
        .select({ player: players, raidsToday: raidsByDay.raids })
        .from(players)
        .leftJoin(
          raidsByDay,
          and(eq(raidsByDay.playerId, players.playerId), eq(raidsByDay.day, parisDay(clock()))),
        )
        .orderBy(
          desc(players.gamesWon),
          desc(players.gold),
          desc(players.upgrades),
          asc(players.playerId),
        )
        .limit(limit)

      const entries = rows.map(({ player, raidsToday }, index) => ({
        rank: index + 1,
        playerId: player.playerId,
        label: labelOf(player),
        gamesPlayed: player.gamesPlayed,
        gamesWon: player.gamesWon,
        gold: player.gold,
        upgrades: player.upgrades,
        bestLoot: player.bestLoot,
        raidsToday: raidsToday ?? 0,
      }))
      return { position, entries }
    },
  }
}
