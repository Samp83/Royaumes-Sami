import { bigint, index, jsonb, pgSchema, text } from 'drizzle-orm/pg-core'

/**
 * Schéma PostgreSQL du module Pillage. Ses événements restent dans le journal de la
 * plateforme : ce schéma ne contient que des modèles de lecture, tenus par des projections.
 */
export const raid = pgSchema('raid')

/**
 * Villages des joueurs, tenus à jour par la projection du langage publié du Village : le nom
 * du village et le niveau de chacun de ses bâtiments. Une ligne par village fondé.
 */
export const villages = raid.table('villages', {
  playerId: text('player_id').primaryKey(),
  name: text('name').notNull(),
  /** Niveau de chaque bâtiment, par nom de bâtiment. */
  levels: jsonb('levels').notNull(),
})

/**
 * Historique des pillages, tenu à jour par la projection des événements du Pillage. Il réunit
 * les pillages lancés par un joueur, qui sont dans son flux, et ceux qu'il a subis, qui sont
 * dans les flux de leurs attaquants.
 */
export const raids = raid.table(
  'raids',
  {
    raidId: text('raid_id').primaryKey(),
    attackerId: text('attacker_id').notNull(),
    defenderId: text('defender_id').notNull(),
    outcome: text('outcome').notNull(),
    status: text('status').notNull(),
    loot: jsonb('loot'),
    lostBuilding: text('lost_building'),
    launchedAt: bigint('launched_at', { mode: 'number' }).notNull(),
  },
  (t) => [
    index('raids_attacker_idx').on(t.attackerId),
    index('raids_defender_idx').on(t.defenderId),
  ],
)
