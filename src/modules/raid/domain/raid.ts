/**
 * Domaine du Pillage, selon le modèle decider. L'état est celui d'un attaquant : les pillages
 * qu'il a lancés, dont au plus un est en cours. Chaque pillage est une saga orchestrée avec
 * le Village, qui prélève, verse ou fait perdre un niveau (domain/saga.ts).
 * Ce fichier est écrit en TypeScript pur : il n'importe aucun autre module.
 */
import { SAME_TARGET_DELAY_MS, TIE_SUCCESS_CHANCE } from './content'
import { pick, seeded } from './random'

/** Quantités de ressources, par nom de ressource (« wood », « stone », « gold »). */
export type Amounts = Partial<Record<string, number>>

/** Niveau de chaque bâtiment d'un village, par nom de bâtiment. */
export type Levels = Record<string, number>

/** Issue d'un pillage, connue dès son lancement. */
export type RaidOutcome = 'success' | 'failure'

/** Avancement d'un pillage : en attente de la réponse du Village, ou terminé. */
export type RaidStatus = 'plundering' | 'penalizing' | 'completed'

/** Ce que le Pillage sait d'un village au moment d'un lancement : les niveaux de ses bâtiments. */
export interface VillageLevels {
  levels: Levels
}

/** Niveau combiné d'un village : la somme des niveaux de ses bâtiments. */
export const combinedLevel = (levels: Levels) =>
  Object.values(levels).reduce((sum, level) => sum + level, 0)

// ---------------------------------------------------------------------------
// État
// ---------------------------------------------------------------------------

export interface Raid {
  raidId: string
  defenderId: string
  outcome: RaidOutcome
  status: RaidStatus
  /** Bâtiment de l'attaquant visé par la perte de niveau ; null en cas de succès, ou si aucun ne peut. */
  penalty: string | null
  /** Ressources prises au défenseur ; null tant que le prélèvement n'a pas eu lieu. */
  loot: Amounts | null
  /** Bâtiment qui a effectivement perdu un niveau ; null si l'échec a été sans perte. */
  lostBuilding: string | null
  launchedAt: number
  completedAt: number | null
}

export interface RaidState {
  attackerId: string
  raids: Record<string, Raid>
  /** Pillage en cours ; null si aucun ne l'est. */
  current: string | null
  /** Instant du dernier pillage lancé contre chaque défenseur. */
  lastRaidAt: Record<string, number>
}

export const initialState: RaidState = { attackerId: '', raids: {}, current: null, lastRaidAt: {} }

// ---------------------------------------------------------------------------
// Événements
// ---------------------------------------------------------------------------

/**
 * Les événements ne contiennent aucun nom de joueur ni de village, seulement des identifiants :
 * les noms seront retrouvés à l'affichage (ADR 0008). Les niveaux comparés sont enregistrés pour
 * expliquer le résultat, mais ne sont jamais présentés à un autre joueur (règle 13).
 */
export type RaidEvent =
  | {
      type: 'RaidLaunched'
      data: {
        raidId: string
        attackerId: string
        defenderId: string
        attackerLevel: number
        defenderLevel: number
        seed: number
        outcome: RaidOutcome
        penalty: string | null
        at: number
      }
    }
  | { type: 'RaidPlundered'; data: { raidId: string; loot: Amounts; at: number } }
  | { type: 'RaidRepelled'; data: { raidId: string; lostBuilding: string | null; at: number } }

// ---------------------------------------------------------------------------
// Commandes
// ---------------------------------------------------------------------------

export type RaidCommand =
  /**
   * Commande du joueur. Les niveaux des deux villages, et les niveaux de départ des bâtiments,
   * sont fournis par la couche application ; un village absent (null) n'a pas été fondé.
   * La graine est tirée par la couche application, et enregistrée dans l'événement.
   */
  | {
      type: 'LaunchRaid'
      raidId: string
      attackerId: string
      defenderId: string
      attacker: VillageLevels | null
      defender: VillageLevels | null
      startingLevels: Levels
      seed: number
    }
  /** Commande de la saga : la réponse du Village à une demande du Pillage. */
  | {
      type: 'RecordTransferResult'
      transferId: string
      outcome: 'withdrawn' | 'refused' | 'deposited' | 'downgraded'
      resources?: Amounts
    }

export type RaidError =
  | { code: 'NO_VILLAGE' }
  | { code: 'SELF_RAID' }
  | { code: 'TARGET_NOT_FOUND' }
  | { code: 'RAID_IN_PROGRESS' }
  | { code: 'TOO_SOON'; retryAt: number }

export type Decision = { ok: true; events: RaidEvent[] } | { ok: false; error: RaidError }

const fail = (error: RaidError): Decision => ({ ok: false, error })
const accept = (...events: RaidEvent[]): Decision => ({ ok: true, events })

// ---------------------------------------------------------------------------
// Identifiants des demandes adressées au Village
// ---------------------------------------------------------------------------

/**
 * Identifiant d'une demande au Village : il désigne l'attaquant, le pillage et l'étape, et sert
 * de clé d'idempotence au Village. Les identifiants de joueur ne contiennent pas de deux-points.
 */
export const transferIdOf = (attackerId: string, raidId: string, step: string) =>
  `${attackerId}:${raidId}:${step}`

/** Attaquant, pillage et étape d'une demande. */
export function parseTransferId(transferId: string) {
  const [attackerId = '', raidId = '', step = ''] = transferId.split(':')
  return { attackerId, raidId, step }
}

// ---------------------------------------------------------------------------
// evolve
// ---------------------------------------------------------------------------

export function evolve(state: RaidState, event: RaidEvent): RaidState {
  switch (event.type) {
    case 'RaidLaunched': {
      const { raidId, attackerId, defenderId, outcome, penalty, at } = event.data
      const raid: Raid = {
        raidId,
        defenderId,
        outcome,
        status: outcome === 'success' ? 'plundering' : 'penalizing',
        penalty,
        loot: null,
        lostBuilding: null,
        launchedAt: at,
        completedAt: null,
      }
      return {
        attackerId,
        raids: { ...state.raids, [raidId]: raid },
        current: raidId,
        lastRaidAt: { ...state.lastRaidAt, [defenderId]: at },
      }
    }

    case 'RaidPlundered':
    case 'RaidRepelled': {
      const raid = state.raids[event.data.raidId]
      const completed: Raid = {
        ...raid,
        status: 'completed',
        completedAt: event.data.at,
        ...(event.type === 'RaidPlundered'
          ? { loot: event.data.loot }
          : { lostBuilding: event.data.lostBuilding }),
      }
      return {
        ...state,
        raids: { ...state.raids, [raid.raidId]: completed },
        current: state.current === raid.raidId ? null : state.current,
      }
    }
  }
}

export const replay = (events: RaidEvent[]) => events.reduce(evolve, initialState)

// ---------------------------------------------------------------------------
// decide
// ---------------------------------------------------------------------------

export function decide(state: RaidState, command: RaidCommand, now: number): Decision {
  switch (command.type) {
    case 'LaunchRaid':
      return launch(state, command, now)
    case 'RecordTransferResult':
      return recordTransferResult(state, command, now)
  }
}

function launch(
  state: RaidState,
  command: Extract<RaidCommand, { type: 'LaunchRaid' }>,
  now: number,
): Decision {
  const { raidId, attackerId, defenderId, attacker, defender, startingLevels, seed } = command

  // Règles 1 à 4 : qui peut piller qui, et quand.
  if (!attacker) return fail({ code: 'NO_VILLAGE' })
  if (defenderId === attackerId) return fail({ code: 'SELF_RAID' })
  if (!defender) return fail({ code: 'TARGET_NOT_FOUND' })
  if (state.current) return fail({ code: 'RAID_IN_PROGRESS' })
  const last = state.lastRaidAt[defenderId]
  if (last !== undefined && now < last + SAME_TARGET_DELAY_MS) {
    return fail({ code: 'TOO_SOON', retryAt: last + SAME_TARGET_DELAY_MS })
  }

  // Règles 5 à 7 : l'issue, tirée au sort en cas d'égalité, avec le générateur du pillage.
  const random = seeded(seed)
  const attackerLevel = combinedLevel(attacker.levels)
  const defenderLevel = combinedLevel(defender.levels)
  const succeeds =
    attackerLevel === defenderLevel ? random() < TIE_SUCCESS_CHANCE : attackerLevel > defenderLevel

  // Règle 10 : le bâtiment qui perdra un niveau, parmi ceux qui dépassent leur niveau de départ.
  // Les bâtiments sont triés par nom : le tirage ne dépend pas de l'ordre de leur lecture.
  const candidates = Object.keys(attacker.levels)
    .filter((building) => attacker.levels[building] > (startingLevels[building] ?? 0))
    .sort()
  const penalty = !succeeds && candidates.length > 0 ? pick(random, candidates) : null

  const launched: RaidEvent = {
    type: 'RaidLaunched',
    data: {
      raidId,
      attackerId,
      defenderId,
      attackerLevel,
      defenderLevel,
      seed,
      outcome: succeeds ? 'success' : 'failure',
      penalty,
      at: now,
    },
  }
  // Un échec sans bâtiment à pénaliser est terminé aussitôt : il n'y a rien à demander au Village.
  return !succeeds && !penalty
    ? accept(launched, { type: 'RaidRepelled', data: { raidId, lostBuilding: null, at: now } })
    : accept(launched)
}

/**
 * Réponse du Village. Seule la réponse attendue par le pillage en cours le fait progresser ;
 * toute autre réponse (doublon, confirmation du versement du butin) est ignorée.
 */
function recordTransferResult(
  state: RaidState,
  result: Extract<RaidCommand, { type: 'RecordTransferResult' }>,
  now: number,
): Decision {
  const { raidId, step } = parseTransferId(result.transferId)
  const raid = state.raids[raidId]
  if (!raid || state.current !== raidId) return accept()

  // Règles 8 et 9 : le Village a prélevé la part du défenseur, éventuellement nulle.
  if (raid.status === 'plundering' && step === 'seize' && result.outcome === 'withdrawn') {
    return accept({
      type: 'RaidPlundered',
      data: { raidId, loot: result.resources ?? {}, at: now },
    })
  }

  // Règle 10 : le Village a réduit le niveau du bâtiment, ou l'a refusé si le bâtiment était
  // revenu entre-temps à son niveau de départ.
  if (raid.status === 'penalizing' && step === 'penalty') {
    const lostBuilding = result.outcome === 'downgraded' ? raid.penalty : null
    return accept({ type: 'RaidRepelled', data: { raidId, lostBuilding, at: now } })
  }

  return accept()
}
