/**
 * Étapes de la saga d'un pillage : pour chaque événement, les demandes à adresser au Village.
 * Le domaine décide de ces demandes ; le service les traduira en messages de la boîte d'envoi.
 */
import { LOOT_SHARE } from './content'
import { type Amounts, type RaidEvent, type RaidState, transferIdOf } from './raid'

/** Demande produite par une étape de la saga. */
export type SagaRequest =
  /** Prélever une part du stock du défenseur : la réponse indique les quantités prises. */
  | { kind: 'seize'; transferId: string; playerId: string; share: number }
  /** Réduire le niveau d'un bâtiment de l'attaquant : la réponse indique si c'est fait. */
  | { kind: 'loseLevel'; transferId: string; playerId: string; building: string }
  /** Verser le butin à l'attaquant : le versement ne peut pas échouer, aucune réponse n'est attendue. */
  | { kind: 'deposit'; transferId: string; playerId: string; resources: Amounts }

/** Demandes déclenchées par un événement ; l'état reçu est celui qui suit l'événement. */
export function requestsFor(state: RaidState, event: RaidEvent): SagaRequest[] {
  const id = (step: string) => transferIdOf(state.attackerId, event.data.raidId, step)

  switch (event.type) {
    // 1. Lancement : prélèvement chez le défenseur, ou perte de niveau chez l'attaquant.
    // Règle 11 : le défenseur ne perd jamais de niveau, l'attaquant jamais de ressource.
    case 'RaidLaunched': {
      const { outcome, defenderId, attackerId, penalty } = event.data
      if (outcome === 'success') {
        return [{ kind: 'seize', transferId: id('seize'), playerId: defenderId, share: LOOT_SHARE }]
      }
      return penalty
        ? [
            {
              kind: 'loseLevel',
              transferId: id('penalty'),
              playerId: attackerId,
              building: penalty,
            },
          ]
        : []
    }

    // 2. Butin pris : versement à l'attaquant de ce qui a été prélevé, s'il y a quelque chose.
    case 'RaidPlundered':
      return Object.keys(event.data.loot).length > 0
        ? [
            {
              kind: 'deposit',
              transferId: id('loot'),
              playerId: state.attackerId,
              resources: event.data.loot,
            },
          ]
        : []

    // Échec : la perte de niveau a déjà eu lieu, ou n'était pas possible.
    case 'RaidRepelled':
      return []
  }
}
