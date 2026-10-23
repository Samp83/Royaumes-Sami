import { REALM_TOPICS, STARTING_LEVELS } from '@/modules/realm/contracts'
import { withOptimisticRetry } from '@/platform/event-store/retry'
import type { NewMessage } from '@/platform/outbox/outbox'
import { RAID_TOPICS } from '../contracts'
import {
  decide,
  evolve,
  type RaidCommand,
  type RaidError,
  type RaidEvent,
  type RaidState,
} from '../domain/raid'
import { requestsFor, type SagaRequest } from '../domain/saga'
import { type RaidView, toView } from '../domain/view'
import type { RaidRepository } from './raid-repository'
import type { RaidsReader } from './raids-reader'
import type { VillagesReader } from './villages-reader'

/** Résultat d'un lancement : la vue du pillage, ou l'erreur métier. */
export type CommandResult = { ok: true; view: RaidView } | { ok: false; error: RaidError }

export interface RaidServiceOptions {
  /** Distribution de la boîte d'envoi, déclenchée après chaque lancement et chaque consultation. */
  dispatch: () => Promise<unknown>
  /** Horloge de référence ; l'heure réelle par défaut. */
  clock?: () => number
  /** Identifiant d'un nouveau pillage ; un UUID aléatoire par défaut. */
  newId?: () => string
  /** Graine du tirage d'un nouveau pillage ; un entier aléatoire sur 32 bits par défaut. */
  newSeed?: () => number
}

/** Traduit une demande de la saga en message de la boîte d'envoi, adressé au Village. */
function toMessage(request: SagaRequest): NewMessage {
  switch (request.kind) {
    case 'seize':
      return {
        topic: REALM_TOPICS.seize,
        payload: {
          transferId: request.transferId,
          playerId: request.playerId,
          share: request.share,
          replyTo: RAID_TOPICS.transferResult,
        },
      }
    case 'loseLevel':
      return {
        topic: REALM_TOPICS.loseLevel,
        payload: {
          transferId: request.transferId,
          playerId: request.playerId,
          building: request.building,
          replyTo: RAID_TOPICS.transferResult,
        },
      }
    // Le versement du butin ne peut pas échouer : aucune réponse n'est demandée.
    case 'deposit':
      return {
        topic: REALM_TOPICS.deposit,
        payload: {
          transferId: request.transferId,
          playerId: request.playerId,
          resources: request.resources,
        },
      }
  }
}

/** Messages déclenchés par une suite d'événements, appliqués un à un à l'état de l'attaquant. */
function messagesFor(state: RaidState, events: RaidEvent[]): NewMessage[] {
  const messages: NewMessage[] = []
  let current = state
  for (const event of events) {
    current = evolve(current, event)
    for (const request of requestsFor(current, event)) messages.push(toMessage(request))
  }
  return messages
}

/**
 * Service applicatif du Pillage : orchestrateur de la saga d'un pillage avec le Village.
 * Chaque décision est enregistrée avec les messages qu'elle déclenche, dans une même transaction.
 */
export function createRaidService(
  repo: RaidRepository,
  villages: VillagesReader,
  history: RaidsReader,
  {
    dispatch,
    clock = () => Date.now(),
    newId = () => crypto.randomUUID(),
    newSeed = () => crypto.getRandomValues(new Uint32Array(1))[0],
  }: RaidServiceOptions,
) {
  /** Décide et enregistre une commande, avec les messages de la saga ; rejouée en cas de conflit. */
  function process(attackerId: string, command: RaidCommand) {
    return withOptimisticRetry(async () => {
      const { state, version } = await repo.load(attackerId)
      const decision = decide(state, command, clock())
      if (!decision.ok) return decision
      await repo.save(attackerId, version, decision.events, messagesFor(state, decision.events))
      return decision
    })
  }

  /**
   * Lance un pillage. Les niveaux des deux villages sont lus dans la projection du langage
   * publié du Village, rattrapée juste avant : ils peuvent avoir quelques secondes de retard.
   * La boîte d'envoi est ensuite distribuée : dans le cas ordinaire, le pillage est terminé
   * lorsque sa vue est renvoyée.
   */
  async function launch(attackerId: string, defenderId: string): Promise<CommandResult> {
    const raidId = newId()
    const attacker = await villages.levelsOf(attackerId)
    const defender = defenderId === attackerId ? attacker : await villages.levelsOf(defenderId)
    const decision = await process(attackerId, {
      type: 'LaunchRaid',
      raidId,
      attackerId,
      defenderId,
      attacker,
      defender,
      startingLevels: STARTING_LEVELS,
      seed: newSeed(),
    })
    if (!decision.ok) return decision
    await dispatch()
    const { state } = await repo.load(attackerId)
    return { ok: true, view: toView(state.raids[raidId]) }
  }

  /** Villages que le joueur peut viser. */
  const targets = (viewerId: string) => villages.targets(viewerId)

  /**
   * Historique des pillages du joueur. La boîte d'envoi est d'abord distribuée : une saga
   * interrompue reprend dès qu'un joueur consulte le Pillage, comme au Marché.
   */
  async function list(viewerId: string) {
    await dispatch()
    return history.list(viewerId)
  }

  /**
   * Étape de la saga, déclenchée par une réponse du Village. Une erreur métier y est une
   * anomalie : elle est levée, et le message sera retenté.
   */
  async function step(attackerId: string, command: RaidCommand) {
    const decision = await process(attackerId, command)
    if (!decision.ok) throw new Error(`Pillage de ${attackerId} : ${decision.error.code}`)
  }

  return { launch, targets, list, step }
}

/** Type du service, déduit de sa fabrique. */
export type RaidService = ReturnType<typeof createRaidService>
