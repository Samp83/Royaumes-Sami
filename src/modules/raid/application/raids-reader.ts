import type { RaidSummary } from '../contracts'

/** Port de l'historique des pillages, défini par la couche application. */
export interface RaidsReader {
  /** Pillages lancés et subis par le joueur viewerId depuis l'instant since, du plus récent au plus ancien. */
  list(viewerId: string, since: number): Promise<RaidSummary[]>

  /**
   * Supprime de l'historique les pillages lancés avant l'instant before, et renvoie leur nombre.
   * Seul l'historique, modèle de lecture, est concerné : le journal conserve les événements.
   */
  removeOlderThan(before: number): Promise<number>
}
