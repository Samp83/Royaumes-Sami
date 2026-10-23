import { z } from 'zod'
import type { MessageHandler } from '@/platform/outbox/outbox'
import type { RaidService } from './application/raid-service'
import { RAID_TOPICS } from './contracts'
import { parseTransferId } from './domain/raid'

/** Réponse du Village à une demande du Pillage (son type TransferResult, vérifié ici). */
const TransferResultMessage = z.object({
  transferId: z.string().min(1),
  outcome: z.enum(['withdrawn', 'refused', 'deposited', 'downgraded']),
  resources: z.record(z.string(), z.number()).optional(),
})

/**
 * Gestionnaires des messages adressés au Pillage : les réponses du Village, qui font progresser
 * la saga. Comme ceux du Marché, ils ne font que traduire un message en appel au service.
 */
export function createRaidHandlers(service: RaidService): Record<string, MessageHandler> {
  return {
    [RAID_TOPICS.transferResult]: async (message) => {
      const { transferId, outcome, resources } = TransferResultMessage.parse(message.payload)
      // L'identifiant de la demande a été construit par le Pillage : il désigne l'attaquant.
      const { attackerId } = parseTransferId(transferId)
      await service.step(attackerId, {
        type: 'RecordTransferResult',
        transferId,
        outcome,
        resources,
      })
    },
  }
}
