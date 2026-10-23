import { describe, expect, it } from 'vitest'
import { SAME_TARGET_DELAY_MS } from './content'
import {
  decide,
  evolve,
  initialState,
  type Levels,
  type RaidCommand,
  type RaidEvent,
  type RaidState,
  replay,
} from './raid'
import { requestsFor } from './saga'
import { toView } from './view'

const T0 = Date.UTC(2026, 0, 1)
const STARTING: Levels = { sawmill: 1, quarry: 1, mine: 0 }

// Graines choisies pour leur premier tirage : 0,012 avec la graine 7, 0,627 avec la graine 1.
const SEED_TIE_WIN = 7
const SEED_TIE_LOSS = 1

/** Village de niveaux donnés ; aux niveaux de départ, son niveau combiné est 2. */
const village = (levels: Levels = {}) => ({ levels: { ...STARTING, ...levels } })

/** Lancement d'un pillage d'Alice (niveau 3) contre Bob (niveau 2), sauf indication contraire. */
type LaunchRaid = Extract<RaidCommand, { type: 'LaunchRaid' }>
const launch = (overrides: Partial<LaunchRaid> = {}): LaunchRaid => ({
  type: 'LaunchRaid',
  raidId: 'r1',
  attackerId: 'alice',
  defenderId: 'bob',
  attacker: village({ mine: 1 }),
  defender: village(),
  startingLevels: STARTING,
  seed: SEED_TIE_WIN,
  ...overrides,
})

/** Événement RaidLaunched produit par un lancement accepté. */
function launched(command: RaidCommand, state: RaidState = initialState, now = T0) {
  const decision = decide(state, command, now)
  if (!decision.ok) throw new Error(decision.error.code)
  return decision.events[0] as Extract<RaidEvent, { type: 'RaidLaunched' }>
}

describe('Pillage - qui peut piller qui', () => {
  it("refuse un pillage à un joueur qui n'a pas fondé de village (règle 1)", () => {
    expect(decide(initialState, launch({ attacker: null }), T0)).toEqual({
      ok: false,
      error: { code: 'NO_VILLAGE' },
    })
  })

  it('refuse de piller son propre village, ou un joueur sans village (règle 2)', () => {
    expect(decide(initialState, launch({ defenderId: 'alice' }), T0)).toEqual({
      ok: false,
      error: { code: 'SELF_RAID' },
    })
    expect(decide(initialState, launch({ defender: null }), T0)).toEqual({
      ok: false,
      error: { code: 'TARGET_NOT_FOUND' },
    })
  })

  it('refuse un second pillage tant que le premier est en cours (règle 3)', () => {
    const state = replay([launched(launch())])
    expect(state.current).toBe('r1')
    expect(decide(state, launch({ raidId: 'r2', defenderId: 'carol' }), T0)).toEqual({
      ok: false,
      error: { code: 'RAID_IN_PROGRESS' },
    })
  })

  it("refuse de piller le même village plus d'une fois par heure (règle 4)", () => {
    // Alice a pillé Bob à T0, et ce pillage est terminé.
    const state: RaidState = { ...initialState, attackerId: 'alice', lastRaidAt: { bob: T0 } }

    expect(decide(state, launch(), T0 + SAME_TARGET_DELAY_MS - 1)).toEqual({
      ok: false,
      error: { code: 'TOO_SOON', retryAt: T0 + SAME_TARGET_DELAY_MS },
    })
    // Un autre village peut être pillé aussitôt, et le même au bout d'une heure.
    expect(decide(state, launch({ defenderId: 'carol' }), T0).ok).toBe(true)
    expect(decide(state, launch(), T0 + SAME_TARGET_DELAY_MS).ok).toBe(true)
  })
})

describe("Pillage - l'issue", () => {
  it("réussit lorsque le niveau combiné de l'attaquant est supérieur (règle 5)", () => {
    // La graine ne joue aucun rôle : il n'y a pas d'égalité.
    expect(launched(launch({ seed: SEED_TIE_LOSS }))).toEqual({
      type: 'RaidLaunched',
      data: {
        raidId: 'r1',
        attackerId: 'alice',
        defenderId: 'bob',
        attackerLevel: 3,
        defenderLevel: 2,
        seed: SEED_TIE_LOSS,
        outcome: 'success',
        penalty: null,
        at: T0,
      },
    })
  })

  it("échoue lorsque le niveau combiné de l'attaquant est inférieur (règle 6)", () => {
    const event = launched(launch({ attacker: village(), defender: village({ mine: 1 }) }))
    expect(event.data).toMatchObject({ attackerLevel: 2, defenderLevel: 3, outcome: 'failure' })
  })

  it('tranche une égalité par le générateur à graine, et enregistre la graine (règle 7)', () => {
    const tie = { attacker: village(), defender: village() }
    const won = launched(launch({ ...tie, seed: SEED_TIE_WIN }))
    const lost = launched(launch({ ...tie, seed: SEED_TIE_LOSS }))
    expect(won.data).toMatchObject({ outcome: 'success', seed: SEED_TIE_WIN })
    expect(lost.data).toMatchObject({ outcome: 'failure', seed: SEED_TIE_LOSS })

    // La même graine donne toujours le même résultat, et la relecture le conserve.
    expect(launched(launch({ ...tie, seed: SEED_TIE_WIN }))).toEqual(won)
    expect(replay([won]).raids.r1.outcome).toBe('success')
  })
})

describe('Pillage - le bâtiment qui perdra un niveau (règle 10)', () => {
  it('le tire au sort parmi les bâtiments au-dessus de leur niveau de départ', () => {
    // Alice : scierie 2 et mine 1, niveau 4 ; Bob : niveau 5. Candidats, par nom : mine, scierie.
    const command = launch({
      attacker: village({ sawmill: 2, mine: 1 }),
      defender: village({ sawmill: 2, quarry: 2, mine: 1 }),
    })
    // Premier tirage : 0,627 avec la graine 1, soit le second candidat ; 0,012 avec la graine 7.
    expect(launched({ ...command, seed: SEED_TIE_LOSS }).data.penalty).toBe('sawmill')
    expect(launched({ ...command, seed: SEED_TIE_WIN }).data.penalty).toBe('mine')
  })

  it("n'en désigne aucun lorsque tous sont à leur niveau de départ, ni en cas de succès", () => {
    const atStart = launched(launch({ attacker: village(), defender: village({ mine: 1 }) }))
    expect(atStart.data).toMatchObject({ outcome: 'failure', penalty: null })
    expect(launched(launch()).data).toMatchObject({ outcome: 'success', penalty: null })
  })
})

/** Applique une commande acceptée ; renvoie le nouvel état, les événements et les demandes de la saga. */
function play(state: RaidState, command: RaidCommand, now = T0) {
  const decision = decide(state, command, now)
  if (!decision.ok) throw new Error(decision.error.code)
  let current = state
  const requests = []
  for (const event of decision.events) {
    current = evolve(current, event)
    requests.push(...requestsFor(current, event))
  }
  return { state: current, events: decision.events, requests }
}

/** Réponse du Village à une demande du pillage r1 d'Alice. */
const reply = (
  step: string,
  outcome: 'withdrawn' | 'refused' | 'deposited' | 'downgraded',
  resources?: Record<string, number>,
): RaidCommand => ({
  type: 'RecordTransferResult',
  transferId: `alice:r1:${step}`,
  outcome,
  resources,
})

// Pillages lancés : un succès (Alice 3 contre Bob 2), et un échec qui coûtera un niveau de mine
// à Alice (Alice 3 contre Bob 4, seule la mine d'Alice dépasse son niveau de départ).
const success = play(initialState, launch())
const failure = play(initialState, launch({ defender: village({ mine: 2 }) }))

describe('Pillage - le butin (règles 8 et 9)', () => {
  it('demande au Village la moitié du stock du défenseur', () => {
    expect(success.requests).toEqual([
      { kind: 'seize', transferId: 'alice:r1:seize', playerId: 'bob', share: 0.5 },
    ])
    expect(success.state.raids.r1.status).toBe('plundering')
  })

  it("verse à l'attaquant exactement ce qui a été prélevé, et termine le pillage (règle 8)", () => {
    const { state, requests } = play(
      success.state,
      reply('seize', 'withdrawn', { wood: 60, stone: 31 }),
    )
    expect(requests).toEqual([
      {
        kind: 'deposit',
        transferId: 'alice:r1:loot',
        playerId: 'alice',
        resources: { wood: 60, stone: 31 },
      },
    ])
    expect(state.raids.r1).toMatchObject({ status: 'completed', loot: { wood: 60, stone: 31 } })
    expect(state.current).toBeNull()
  })

  it("termine un pillage réussi sans butin lorsque le défenseur n'a rien (règle 9)", () => {
    const { state, requests } = play(success.state, reply('seize', 'withdrawn', {}))
    expect(state.raids.r1).toMatchObject({ outcome: 'success', status: 'completed', loot: {} })
    expect(requests).toEqual([])
  })
})

describe('Pillage - la perte de niveau (règle 10)', () => {
  it("demande au Village de réduire le niveau du bâtiment tiré, puis termine l'échec", () => {
    expect(failure.requests).toEqual([
      { kind: 'loseLevel', transferId: 'alice:r1:penalty', playerId: 'alice', building: 'mine' },
    ])
    const { state } = play(failure.state, reply('penalty', 'downgraded'))
    expect(state.raids.r1).toMatchObject({
      outcome: 'failure',
      status: 'completed',
      lostBuilding: 'mine',
    })
    expect(state.current).toBeNull()
  })

  it('termine un échec sans perte lorsque le Village refuse la perte de niveau', () => {
    const { state } = play(failure.state, reply('penalty', 'refused'))
    expect(state.raids.r1).toMatchObject({ status: 'completed', lostBuilding: null })
  })

  it("termine aussitôt un échec lorsqu'aucun bâtiment ne peut perdre de niveau", () => {
    const { state, events, requests } = play(
      initialState,
      launch({ attacker: village(), defender: village({ mine: 1 }) }),
    )
    expect(events.map((e) => e.type)).toEqual(['RaidLaunched', 'RaidRepelled'])
    expect(requests).toEqual([])
    expect(state.raids.r1).toMatchObject({ status: 'completed', lostBuilding: null })
  })
})

describe('Pillage - la saga', () => {
  it("ne vise jamais les niveaux du défenseur ni les ressources de l'attaquant (règle 11)", () => {
    const all = [...success.requests, ...failure.requests]
    expect(all.map((r) => [r.kind, r.playerId])).toEqual([
      ['seize', 'bob'],
      ['loseLevel', 'alice'],
    ])
  })

  it('permet un nouveau pillage une fois le précédent terminé (règle 3)', () => {
    const done = play(success.state, reply('seize', 'withdrawn', {})).state
    expect(decide(done, launch({ raidId: 'r2', defenderId: 'carol' }), T0).ok).toBe(true)
  })

  it('ignore une réponse en double ou inattendue', () => {
    const done = play(success.state, reply('seize', 'withdrawn', { wood: 60 })).state
    expect(decide(done, reply('seize', 'withdrawn', { wood: 60 }), T0)).toEqual({
      ok: true,
      events: [],
    })
    expect(decide(success.state, reply('penalty', 'downgraded'), T0)).toEqual({
      ok: true,
      events: [],
    })
    expect(decide(done, reply('loot', 'deposited'), T0)).toEqual({ ok: true, events: [] })
  })
})

describe('Pillage - ce que voit le joueur (règle 13)', () => {
  it("ne présente aucun niveau dans la vue d'un pillage", () => {
    const view = toView(success.state.raids.r1)
    expect(view).toMatchObject({ raidId: 'r1', outcome: 'success', status: 'plundering' })
    expect(JSON.stringify(view)).not.toMatch(/level/i)
  })
})
