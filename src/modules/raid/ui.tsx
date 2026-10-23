'use client'
import { hc } from 'hono/client'
import { useCallback, useEffect, useState } from 'react'
import { Entity } from '@/ui/entity'
import { look } from '@/ui/theme'
import type { RaidApi } from './api'
import type { Amounts, RaidError, RaidSummary, RaidView, Target } from './contracts'

/** Client HTTP typé, déduit de la sous-application Hono du module. */
const client = hc<RaidApi>('/api/raid')

/** Message affiché au joueur pour chaque erreur. */
const ERRORS: Record<RaidError['code'] | 'INVALID_INPUT', string> = {
  INVALID_INPUT: 'Saisie invalide.',
  NO_VILLAGE: "Fondez d'abord votre village.",
  SELF_RAID: 'Vous ne pouvez pas piller votre propre village.',
  TARGET_NOT_FOUND: "Ce village n'existe pas.",
  RAID_IN_PROGRESS: 'Un pillage est déjà en cours.',
  TOO_SOON: 'Vous avez déjà pillé ce village il y a moins d’une heure.',
}

/** Affiche des quantités de ressources : « 60 bois, 30 pierre », ou « rien ». */
function AmountsText({ amounts }: { amounts: Amounts | null }) {
  const entries = Object.entries(amounts ?? {})
  if (entries.length === 0) return <>rien</>
  return (
    <>
      {entries.map(([resource, amount], index) => (
        <span key={resource}>
          {index > 0 && ', '}
          {amount} <Entity kind={resource} />
        </span>
      ))}
    </>
  )
}

/** Compte rendu d'un pillage de l'historique, du point de vue du joueur qui le consulte. */
function Outcome({ raid }: { raid: RaidSummary }) {
  if (raid.status !== 'completed') return <>en cours</>
  if (raid.role === 'defender') {
    return raid.outcome === 'success' ? (
      <>
        vous avez perdu <AmountsText amounts={raid.loot} />
      </>
    ) : (
      <>repoussé</>
    )
  }
  if (raid.outcome === 'success') {
    return (
      <>
        réussi, butin : <AmountsText amounts={raid.loot} />
      </>
    )
  }
  return raid.lostBuilding ? (
    <>échoué, votre {look(raid.lostBuilding).label.toLowerCase()} perd un niveau</>
  ) : (
    <>échoué, sans perte</>
  )
}

/** Compte rendu immédiat d'un lancement. */
function launchMessage(view: RaidView): string {
  if (view.status !== 'completed') return 'Pillage lancé : résultat en attente.'
  return view.outcome === 'success' ? 'Pillage réussi !' : 'Pillage repoussé.'
}

/** Écran du Pillage : les villages à piller, et l'historique des pillages du joueur. */
export function RaidScreen() {
  const [targets, setTargets] = useState<Target[]>([])
  const [raids, setRaids] = useState<RaidSummary[]>([])
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)
  const [pending, setPending] = useState(false)

  // REQUÊTE : les cibles, et l'historique, dont la consultation distribue la boîte d'envoi.
  const refresh = useCallback(async () => {
    const [targetsRes, raidsRes] = await Promise.all([client.targets.$get(), client.raids.$get()])
    if (targetsRes.ok) setTargets((await targetsRes.json()).targets)
    if (raidsRes.ok) setRaids((await raidsRes.json()).raids)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function launch(defenderId: string) {
    setPending(true)
    setMessage(null)
    const res = await client.raids.$post({ json: { defenderId } })
    const body = await res.json()
    setPending(false)
    if ('error' in body) setMessage({ text: ERRORS[body.error.code], error: true })
    else setMessage({ text: launchMessage(body.raid), error: false })
    await refresh()
  }

  return (
    <>
      <h1>
        <Entity kind="raid" /> Pillage
      </h1>
      <p className="muted">
        Un village moins développé que le vôtre perd la moitié de ses ressources ; un village plus
        développé vous repousse, et l'un de vos bâtiments perd un niveau. Le niveau des autres
        villages ne vous est pas connu.
      </p>
      {message && <p className={message.error ? 'error' : undefined}>{message.text}</p>}

      <section className="panel">
        <h2>Villages à piller</h2>
        {targets.length === 0 ? (
          <p className="muted">Aucun autre village pour le moment.</p>
        ) : (
          <ul>
            {targets.map((target) => (
              <li key={target.playerId}>
                <Entity kind="village" /> {target.villageName}{' '}
                <button type="button" disabled={pending} onClick={() => launch(target.playerId)}>
                  Piller
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel">
        <h2>Historique</h2>
        {raids.length === 0 ? (
          <p className="muted">Aucun pillage.</p>
        ) : (
          <ul>
            {raids.map((raid) => (
              <li key={raid.raidId}>
                {raid.role === 'attacker' ? 'Contre' : 'Par'} {raid.opponentVillage} :{' '}
                <Outcome raid={raid} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}
