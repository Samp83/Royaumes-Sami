import type { NewMessage } from '@/platform/outbox/outbox'
import type { RaidEvent, RaidState } from '../domain/raid'

/** Port de persistance des pillages d'un attaquant, défini par la couche application. */
export interface RaidRepository {
  /** Charge l'état d'un attaquant, reconstruit à partir de ses événements, et sa version. */
  load(attackerId: string): Promise<{ state: RaidState; version: number }>

  /**
   * Enregistre de nouveaux événements, et les messages de la saga qu'ils déclenchent,
   * dans une même transaction. Une ConcurrencyError est levée en cas de conflit de version.
   */
  save(
    attackerId: string,
    expectedVersion: number,
    events: RaidEvent[],
    messages: NewMessage[],
  ): Promise<void>
}
