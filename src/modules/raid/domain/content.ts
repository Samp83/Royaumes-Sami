/**
 * Contenu du Pillage : les valeurs d'équilibrage. Ce fichier ne contient que des données.
 * Les règles qui les utilisent se trouvent dans raid.ts : rééquilibrer le jeu ne demande
 * de modifier qu'ici.
 */

/** Part de chaque ressource du défenseur prélevée par un pillage réussi : la moitié. */
export const LOOT_SHARE = 0.5

/** Délai minimal entre deux pillages d'un même village par un même joueur, en millisecondes. */
export const SAME_TARGET_DELAY_MS = 60 * 60_000

/** Probabilité de succès d'un pillage lorsque les deux villages ont le même niveau combiné. */
export const TIE_SUCCESS_CHANCE = 0.5
