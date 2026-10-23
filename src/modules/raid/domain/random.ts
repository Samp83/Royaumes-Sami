/**
 * Générateur pseudo-aléatoire à graine : la même graine produit toujours la même suite.
 * C'est le générateur du Donjon (mulberry32). Il est repris ici, et non importé, parce que le
 * domaine d'un module n'importe que son propre répertoire.
 * Ce générateur n'est pas cryptographique : connaître la graine permet de prévoir les tirages.
 */

/** Générateur : chaque appel renvoie un nombre de l'intervalle [0, 1[. */
export type Random = () => number

/** Crée un générateur à partir d'une graine, selon l'algorithme mulberry32. */
export function seeded(seed: number): Random {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Élément tiré au sort dans une liste non vide. */
export const pick = <T>(random: Random, items: readonly T[]): T =>
  items[Math.floor(random() * items.length)]
