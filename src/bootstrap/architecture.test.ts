import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { RAID_STREAM_PREFIX } from '@/modules/raid/contracts'
import { createTestDatabase } from '@/platform/db/client'
import { createEventStore } from '@/platform/event-store/event-store'
import { createTestApi } from './testing'

/** Répertoires des modules métier. */
const MODULES = readdirSync(path.join(process.cwd(), 'src/modules'))

/** Toutes les clés d'une donnée JSON, à toutes les profondeurs. */
function keysOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(keysOf)
  if (value === null || typeof value !== 'object') return []
  return Object.entries(value).flatMap(([key, child]) => [key, ...keysOf(child)])
}

/**
 * Fonctions d'aptitude (TD11) : des règles d'architecture que dependency-cruiser ne peut pas
 * vérifier, parce qu'elles ne portent pas sur les importations, sont vérifiées par des tests.
 */
describe("Fonctions d'aptitude", () => {
  it("range chaque table dans le schéma d'une brique de la plateforme ou d'un module", async () => {
    const db = await createTestDatabase()
    const result = await db.execute(sql`
      SELECT DISTINCT table_schema FROM information_schema.tables
      WHERE table_schema NOT IN ('pg_catalog', 'information_schema', 'drizzle')`)
    const schemas = (result as unknown as { rows: { table_schema: string }[] }).rows.map(
      (row) => row.table_schema,
    )

    // Aucune table dans le schéma public, et chaque schéma correspond à un propriétaire connu.
    const owners = ['platform', 'identity', ...MODULES]
    expect(schemas).not.toContain('public')
    for (const schema of schemas) expect(owners).toContain(schema)
  })

  it('déclare les données personnelles de chaque module qui conserve des données', () => {
    // Le module system ne conserve aucune donnée ; tous les autres doivent participer
    // aux droits des joueurs (TD10).
    const withData = MODULES.filter((module) => module !== 'system')
    for (const module of withData) {
      const file = path.join(process.cwd(), 'src/modules', module, 'personal-data.ts')
      expect(existsSync(file), `${module} n'a pas de fichier personal-data.ts`).toBe(true)
    }
  })

  it("n'enregistre aucun nom de joueur ni de village dans les événements du Pillage", async () => {
    // Les événements du Pillage ne contiennent que des identifiants (ADR 0008, références sans
    // copie) : son contributeur aux droits des joueurs n'a donc rien à réécrire lors d'un
    // effacement. Un nom ajouté à un événement échapperait à l'effacement sans aucune erreur.
    const { db, post, advance } = await createTestApi()
    await post('/api/realm/village', { name: 'Valombre' }, 'alice')
    await post('/api/realm/village', { name: 'Clairval' }, 'bob')

    // Alice atteint le niveau 4, Bob le niveau 3. Bob échoue contre Alice et perd sa mine ;
    // Alice réussit ensuite contre Bob : les trois sortes d'événements du Pillage sont produites.
    advance(2)
    await post('/api/realm/village/upgrade', { building: 'mine' }, 'alice')
    await post('/api/realm/village/upgrade', { building: 'mine' }, 'bob')
    advance(10)
    await post('/api/realm/village/upgrade', { building: 'sawmill' }, 'alice')
    await post('/api/raid/raids', { defenderId: 'alice' }, 'bob')
    await post('/api/raid/raids', { defenderId: 'bob' }, 'alice')

    const events = await createEventStore(db).readAll({ streamPrefix: RAID_STREAM_PREFIX })
    expect(new Set(events.map((e) => e.type))).toEqual(
      new Set(['RaidLaunched', 'RaidPlundered', 'RaidRepelled']),
    )
    for (const event of events) {
      // Aucun nom de village, et aucune clé destinée à un nom, de joueur ou de village.
      expect(JSON.stringify(event.data)).not.toMatch(/Valombre|Clairval/)
      expect(
        keysOf(event.data).filter((key) => /name/i.test(key)),
        event.type,
      ).toEqual([])
    }
  })
})
