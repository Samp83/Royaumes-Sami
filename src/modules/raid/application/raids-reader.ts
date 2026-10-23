import type { RaidSummary } from '../contracts'

/** Port de lecture de l'historique des pillages, défini par la couche application. */
export interface RaidsReader {
  /** Pillages lancés et subis par le joueur viewerId, du plus récent au plus ancien. */
  list(viewerId: string): Promise<RaidSummary[]>
}
