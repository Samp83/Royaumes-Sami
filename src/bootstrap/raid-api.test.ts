import { describe, expect, it } from 'vitest'
import type { RaidSummary, RaidView, Target } from '@/modules/raid/contracts'
import type { Levels, Stock } from '@/modules/realm/contracts'
import { createTestApi } from './testing'

type TestApi = Awaited<ReturnType<typeof createTestApi>>

/**
 * Application de test où Alice, Bob et Carol ont fondé leur village : niveau combiné 2,
 * 100 bois et 50 pierre. L'horloge reste figée tant que le test ne la fait pas avancer.
 */
async function withVillages(options: Parameters<typeof createTestApi>[0] = {}) {
  const api = await createTestApi(options)
  for (const player of ['alice', 'bob', 'carol']) {
    await api.post('/api/realm/village', { name: `Village de ${player}` }, player)
  }
  return api
}

/** Village d'un joueur : stock et niveaux. */
async function villageOf(api: TestApi, player: string) {
  const res = await api.get('/api/realm/village', player)
  return ((await res.json()) as { view: { stock: Stock; levels: Levels } }).view
}

/** Améliore un bâtiment au nom d'un joueur, et vérifie que l'amélioration est acceptée. */
async function upgrade(api: TestApi, player: string, building: string) {
  const res = await api.post('/api/realm/village/upgrade', { building }, player)
  expect(res.status).toBe(200)
}

/** Deux minutes de production, puis Alice améliore sa mine : niveau combiné 3 contre 2. */
async function aliceStronger(api: TestApi) {
  api.advance(2)
  await upgrade(api, 'alice', 'mine')
}

/** Lance un pillage ; renvoie la réponse et son corps. */
async function raid(api: TestApi, attacker: string, defenderId: string) {
  const res = await api.post('/api/raid/raids', { defenderId }, attacker)
  return { res, body: (await res.json()) as { raid: RaidView; error: { code: string } } }
}

/** Historique des pillages d'un joueur. */
async function historyOf(api: TestApi, player: string) {
  const res = await api.get('/api/raid/raids', player)
  return ((await res.json()) as { raids: RaidSummary[] }).raids
}

describe('API du module Pillage', () => {
  it('refuse les requêtes anonymes (401)', async () => {
    const api = await createTestApi()
    expect((await api.get('/api/raid/targets', null)).status).toBe(401)
    expect((await api.get('/api/raid/raids', null)).status).toBe(401)
    expect((await api.post('/api/raid/raids', { defenderId: 'bob' }, null)).status).toBe(401)
  })

  it('rejette une entrée invalide (400)', async () => {
    const api = await withVillages()
    const res = await api.post('/api/raid/raids', {}, 'alice')
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe('INVALID_INPUT')
  })

  it('présente les villages des autres joueurs, sans leur niveau (règle 13)', async () => {
    const api = await withVillages()
    const res = await api.get('/api/raid/targets', 'alice')
    const { targets } = (await res.json()) as { targets: Target[] }

    expect(targets).toEqual([
      { playerId: 'bob', villageName: 'Village de bob' },
      { playerId: 'carol', villageName: 'Village de carol' },
    ])
    expect(JSON.stringify(targets)).not.toMatch(/level/i)
  })

  it('refuse un pillage sans village, contre soi-même ou contre un joueur sans village', async () => {
    const api = await withVillages()
    expect((await raid(api, 'dave', 'bob')).body.error.code).toBe('NO_VILLAGE')
    expect((await raid(api, 'alice', 'alice')).body.error.code).toBe('SELF_RAID')
    const unknown = await raid(api, 'alice', 'dave')
    expect(unknown.res.status).toBe(404)
    expect(unknown.body.error.code).toBe('TARGET_NOT_FOUND')
  })

  it("prend la moitié des ressources d'un village moins développé, sans créer ni perdre de ressource", async () => {
    const api = await withVillages()
    await aliceStronger(api)
    const aliceBefore = (await villageOf(api, 'alice')).stock
    const bobBefore = (await villageOf(api, 'bob')).stock

    const { res, body } = await raid(api, 'alice', 'bob')
    expect(res.status).toBe(201)
    // La saga s'est déroulée pendant la requête : le pillage est terminé, sans aucun niveau.
    // Bob avait 120 bois et 62 pierre : il en perd la moitié.
    expect(body.raid).toMatchObject({
      outcome: 'success',
      status: 'completed',
      loot: { wood: 60, stone: 31 },
    })
    expect(JSON.stringify(body.raid)).not.toMatch(/level/i)

    const aliceAfter = (await villageOf(api, 'alice')).stock
    const bobAfter = (await villageOf(api, 'bob')).stock
    expect(bobAfter).toMatchObject({ wood: 60, stone: 31 })
    for (const resource of ['wood', 'stone', 'gold'] as const) {
      expect(aliceAfter[resource] - aliceBefore[resource]).toBe(
        bobBefore[resource] - bobAfter[resource],
      )
    }
  })

  it("fait perdre un niveau à l'attaquant d'un village plus développé, et rien au défenseur", async () => {
    const api = await withVillages()
    await aliceStronger(api)
    await upgrade(api, 'bob', 'mine')
    api.advance(10)
    await upgrade(api, 'alice', 'sawmill')
    // Alice : niveau 4 ; Bob : niveau 3, dont seule la mine dépasse son niveau de départ.
    const aliceBefore = await villageOf(api, 'alice')

    const { body } = await raid(api, 'bob', 'alice')
    expect(body.raid).toMatchObject({
      outcome: 'failure',
      status: 'completed',
      lostBuilding: 'mine',
    })
    expect((await villageOf(api, 'bob')).levels.mine).toBe(0)
    expect(await villageOf(api, 'alice')).toEqual(aliceBefore)
  })

  it('tranche une égalité par le tirage du pillage (règle 7)', async () => {
    // La graine 7 fait réussir un pillage entre villages de même niveau.
    const api = await withVillages({ raidSeed: () => 7 })
    const { body } = await raid(api, 'alice', 'bob')
    expect(body.raid).toMatchObject({ outcome: 'success', status: 'completed' })
  })

  it("refuse de piller le même village plus d'une fois par heure (règle 4)", async () => {
    const api = await withVillages()
    await raid(api, 'alice', 'bob')
    const again = await raid(api, 'alice', 'bob')
    expect(again.res.status).toBe(409)
    expect(again.body.error.code).toBe('TOO_SOON')

    api.advance(60)
    expect((await raid(api, 'alice', 'bob')).res.status).toBe(201)
  })

  it("présente le pillage dans l'historique de l'attaquant et dans celui du défenseur", async () => {
    const api = await withVillages()
    await aliceStronger(api)
    await raid(api, 'alice', 'bob')

    expect(await historyOf(api, 'alice')).toMatchObject([
      { role: 'attacker', opponentVillage: 'Village de bob', outcome: 'success' },
    ])
    expect(await historyOf(api, 'bob')).toMatchObject([
      { role: 'defender', opponentVillage: 'Village de alice', loot: { wood: 60, stone: 31 } },
    ])
    expect(await historyOf(api, 'carol')).toEqual([])
  })

  it('exporte les pillages du joueur, et efface le nom de son village lors de la suppression du compte', async () => {
    const api = await withVillages()
    await aliceStronger(api)
    await raid(api, 'alice', 'bob')

    const exported = async (player: string) =>
      (await (await api.get('/api/account/export', player)).json()).sections.raid
    expect((await exported('alice')).launched).toMatchObject([{ outcome: 'success' }])
    expect((await exported('bob')).suffered).toMatchObject([
      { outcome: 'success', loot: { wood: 60, stone: 31 } },
    ])

    // Alice supprime son compte : Bob ne voit plus le nom de son village dans son historique.
    await api.api.request('/api/account', { method: 'DELETE', headers: { 'x-test-user': 'alice' } })
    expect(await historyOf(api, 'bob')).toMatchObject([{ opponentVillage: 'Village effacé' }])
  })
})
