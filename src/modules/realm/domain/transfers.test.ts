import { describe, expect, it } from 'vitest'
import { decide, evolve, initialState, replay, type VillageCommand } from './village'

const T0 = Date.UTC(2026, 0, 1)
const MINUTE = 60_000

// Village fondé à T0 : 100 bois et 50 pierre ; la scierie produit 10 bois par minute.
const founded = replay([{ type: 'VillageFounded', data: { name: 'Valombre', at: T0 } }])

const withdraw = (transferId: string, wood: number): VillageCommand => ({
  type: 'WithdrawResources',
  transferId,
  resources: { wood },
})

/** Applique une commande acceptée, et renvoie le nouvel état. */
function play(state: typeof founded, command: VillageCommand, now: number) {
  const decision = decide(state, command, now)
  if (!decision.ok) throw new Error(decision.error.code)
  return decision.events.reduce(evolve, state)
}

describe('Village - mouvements de ressources', () => {
  it('prélève les ressources lorsque le stock suffit, production comprise', () => {
    // Une minute après la fondation, le stock de bois est de 110.
    const decision = decide(founded, withdraw('t1', 105), T0 + MINUTE)
    expect(decision).toEqual({
      ok: true,
      events: [
        {
          type: 'ResourcesWithdrawn',
          data: { transferId: 't1', resources: { wood: 105 }, at: T0 + MINUTE },
        },
      ],
    })
    expect(play(founded, withdraw('t1', 105), T0 + MINUTE).stock.wood).toBe(5)
  })

  it('refuse le prélèvement lorsque le stock ne suffit pas, et enregistre le refus', () => {
    const decision = decide(founded, withdraw('t1', 130), T0)
    expect(decision).toEqual({
      ok: true,
      events: [
        { type: 'WithdrawalRefused', data: { transferId: 't1', missing: { wood: 30 }, at: T0 } },
      ],
    })
    const state = play(founded, withdraw('t1', 130), T0)
    expect(state.stock.wood).toBe(100)
    expect(state.transfers).toEqual({ t1: 'refused' })
  })

  it('ignore un mouvement déjà traité, quelle que soit son issue', () => {
    const withdrawn = play(founded, withdraw('t1', 60), T0)
    expect(decide(withdrawn, withdraw('t1', 60), T0)).toEqual({ ok: true, events: [] })

    // Un prélèvement refusé reste refusé, même si le stock suffit désormais.
    const refused = play(founded, withdraw('t2', 130), T0)
    expect(decide(refused, withdraw('t2', 130), T0 + 10 * MINUTE)).toEqual({
      ok: true,
      events: [],
    })
  })

  it('verse les ressources à un village fondé', () => {
    const command: VillageCommand = {
      type: 'DepositResources',
      transferId: 't1',
      resources: { stone: 30 },
    }
    const state = play(founded, command, T0)
    expect(state.stock.stone).toBe(80)
    expect(decide(state, command, T0)).toEqual({ ok: true, events: [] })
  })

  it("refuse un versement à un village qui n'est pas fondé", () => {
    const command: VillageCommand = {
      type: 'DepositResources',
      transferId: 't1',
      resources: { stone: 30 },
    }
    expect(decide(initialState, command, T0)).toEqual({
      ok: false,
      error: { code: 'NOT_FOUNDED' },
    })
  })

  it("refuse un prélèvement dans un village qui n'est pas fondé, et retient ce refus", () => {
    const refused = play(initialState, withdraw('t1', 10), T0)
    expect(refused.transfers).toEqual({ t1: 'refused' })

    // La fondation ultérieure du village conserve la trace du refus.
    const later = evolve(refused, { type: 'VillageFounded', data: { name: 'Valombre', at: T0 } })
    expect(decide(later, withdraw('t1', 10), T0)).toEqual({ ok: true, events: [] })
  })
})

describe('Village - prélèvement d’une part et perte de niveau', () => {
  const seize = (transferId: string): VillageCommand => ({
    type: 'SeizeShare',
    transferId,
    share: 0.5,
  })
  const loseLevel = (transferId: string, building: 'sawmill' | 'mine'): VillageCommand => ({
    type: 'LoseLevel',
    transferId,
    building,
  })

  it("prélève la moitié de chaque ressource, production comprise, arrondie à l'entier inférieur", () => {
    // Une minute et demie après la fondation : 115 bois, 59 pierre, aucun or.
    expect(decide(founded, seize('t1'), T0 + 1.5 * MINUTE)).toEqual({
      ok: true,
      events: [
        {
          type: 'ResourcesWithdrawn',
          data: { transferId: 't1', resources: { wood: 57, stone: 29 }, at: T0 + 1.5 * MINUTE },
        },
      ],
    })
    const state = play(founded, seize('t1'), T0 + 1.5 * MINUTE)
    expect(state.stock).toMatchObject({ wood: 58, stone: 30 })
    // Un doublon ne prélève pas une seconde fois.
    expect(decide(state, seize('t1'), T0 + 2 * MINUTE)).toEqual({ ok: true, events: [] })
  })

  it("ne prélève rien dans un village qui n'est pas fondé", () => {
    expect(decide(initialState, seize('t1'), T0)).toEqual({
      ok: true,
      events: [{ type: 'ResourcesWithdrawn', data: { transferId: 't1', resources: {}, at: T0 } }],
    })
  })

  it("réduit de 1 le niveau d'un bâtiment au-dessus de son niveau de départ", () => {
    const upgraded = evolve(founded, {
      type: 'BuildingUpgraded',
      data: { building: 'mine', toLevel: 1, cost: {}, at: T0 },
    })
    const state = play(upgraded, loseLevel('t1', 'mine'), T0 + MINUTE)
    expect(state.levels.mine).toBe(0)
    expect(state.transfers).toEqual({ t1: 'downgraded' })
    // La mine a produit au niveau 1 jusqu'à la perte de niveau : 2 or en une minute.
    expect(state.stock.gold).toBe(2)
    expect(decide(state, loseLevel('t1', 'mine'), T0 + MINUTE)).toEqual({ ok: true, events: [] })
  })

  it('refuse de ramener un bâtiment sous son niveau de départ, et retient ce refus', () => {
    // La scierie est au niveau 1, son niveau de départ.
    expect(decide(founded, loseLevel('t1', 'sawmill'), T0)).toEqual({
      ok: true,
      events: [
        { type: 'LevelLossRefused', data: { transferId: 't1', building: 'sawmill', at: T0 } },
      ],
    })
    const state = play(founded, loseLevel('t1', 'sawmill'), T0)
    expect(state.levels.sawmill).toBe(1)
    expect(state.transfers).toEqual({ t1: 'refused' })
  })
})
