import { Hono } from 'hono'
import type { AppEnv } from '@/platform/http/types'
import { validateJson } from '@/platform/http/validate'
import type { RaidService } from './application/raid-service'
import { LaunchRaidInput, type RaidError } from './contracts'

/** Code HTTP associé à chaque erreur métier. */
const STATUS: Record<RaidError['code'], 404 | 409> = {
  NO_VILLAGE: 409,
  SELF_RAID: 409,
  TARGET_NOT_FOUND: 404,
  RAID_IN_PROGRESS: 409,
  TOO_SOON: 409,
}

/**
 * Sous-application Hono du module Pillage, montée sur /api/raid.
 * L'attaquant est toujours le joueur que l'authentification a identifié : seule la cible
 * est indiquée dans la requête.
 */
export function createRaidApi(service: RaidService) {
  return (
    new Hono<AppEnv>()
      // Villages que le joueur peut viser, sans leurs niveaux.
      .get('/targets', async (c) => c.json({ targets: await service.targets(c.var.userId) }))

      // Pillages lancés et subis par le joueur.
      .get('/raids', async (c) => c.json({ raids: await service.list(c.var.userId) }))

      // Lancement d'un pillage.
      .post('/raids', validateJson(LaunchRaidInput), async (c) => {
        const result = await service.launch(c.var.userId, c.req.valid('json').defenderId)
        return result.ok
          ? c.json({ raid: result.view }, 201)
          : c.json({ error: result.error }, STATUS[result.error.code])
      })
  )
}

/** Type de la sous-application, utilisé par le client typé de l'interface. */
export type RaidApi = ReturnType<typeof createRaidApi>
