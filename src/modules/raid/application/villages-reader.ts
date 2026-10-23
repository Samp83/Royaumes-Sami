import type { Target } from '../contracts'
import type { VillageLevels } from '../domain/raid'

/**
 * Port de lecture des villages, défini par la couche application. Il est mis en œuvre par une
 * projection du langage publié du Village : les niveaux qu'il renvoie peuvent avoir quelques
 * secondes de retard sur le Village lui-même.
 */
export interface VillagesReader {
  /** Niveaux du village d'un joueur ; null s'il n'en a pas fondé. */
  levelsOf(playerId: string): Promise<VillageLevels | null>

  /** Villages que le joueur viewerId peut viser : ceux des autres joueurs, sans leurs niveaux. */
  targets(viewerId: string): Promise<Target[]>
}
