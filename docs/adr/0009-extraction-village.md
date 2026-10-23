# ADR-0009 - Extraction du Village en service autonome, préparée mais non déployée

- Statut : accepté
- Date : 2026-10-23

## Contexte

L'ADR 0001 a retenu un monolithe modulaire, en promettant des frontières entre modules
assez strictes pour qu'un module puisse être extrait en service autonome si un besoin réel
apparaissait. Cette promesse n'avait jamais été vérifiée.

Les raisons d'extraire un module sont précises : une montée en charge propre à ce module,
l'autonomie de plusieurs équipes, une cadence de déploiement différente, l'isolation des
pannes ou des failles, ou une technologie que le reste du système n'utilise pas. Aucune ne
s'applique aujourd'hui au jeu, développé par une seule personne et joué par quelques
dizaines de joueurs. Une extraction a en revanche un coût fixe : latence du réseau, pannes
partielles, absence de transaction commune, second déploiement à exploiter, échanges à
authentifier.

Le Village est le meilleur candidat : son domaine ne dépend d'aucun autre module, il ne lit
les données d'aucun autre module, et sa relation avec le Marché passe déjà par les messages
de la saga (ADR 0007). L'inventaire de ses dépendances en révèle toutefois deux qui ne
passent pas par le code, et qu'aucune règle d'architecture ne signale : le Classement et le
canal temps réel lisent ses événements directement dans le journal commun.

## Décision

Le Village peut s'exécuter dans un service autonome, doté de sa propre base, de son propre
journal et de sa propre boîte d'envoi. Le module lui-même est inchangé : le service n'en
est qu'une seconde racine de composition.

L'application devient alors une passerelle : la racine de composition reçoit une version
distante du module Village, de même forme que la version exécutée dans le processus (API,
règle du canal, gestionnaires de messages, données personnelles), mais dont chaque élément
s'adresse au service par HTTP. L'interface continue d'appeler `/api/realm`.

Les messages de la saga franchissent la frontière par une boîte de réception, sans modifier
les garanties de la boîte d'envoi : un message transmis n'est marqué comme traité qu'à la
réception d'une réponse de succès, et il est retenté sinon.

Un relais recopie le flux d'événements publié par le service dans le journal de
l'application, en conservant le flux et la version de chaque événement, où le Classement et
le canal temps réel continuent de le lire. Le relais est idempotent : une copie déjà déposée
est refusée par la contrainte d'unicité du journal.

Les échanges entre les deux processus sont authentifiés par un secret partagé,
`SERVICE_SECRET`, qui n'est jamais versionné.

Le service n'est pas déployé : en production, le Village s'exécute dans l'application. Le
service n'est utilisé que si `REALM_SERVICE_URL` et `SERVICE_SECRET` sont définies, ce qui
n'est le cas que sur le poste de développement.

Le service est assemblé dans `src/services/village/village-service.ts` et démarré par
`scripts/village-service.ts` ; la version distante du module se trouve dans
`src/modules/realm/remote.ts`.

## Conséquences

### Positives

- Les frontières du monolithe modulaire sont démontrées, et non plus supposées : le Village
  s'exécute ailleurs sans qu'aucun autre module ne soit modifié.
- Six tests de contrat vérifient ces frontières à chaque construction, y compris la reprise
  de la saga après une panne du service.
- L'extraction est réversible sans migration de données : il suffit de ne pas définir les
  deux variables d'environnement.
- La boîte de réception et l'authentification entre services appartiennent à la plateforme,
  et serviraient telles quelles à l'extraction d'un autre module.
- Le coût réel d'une extraction est mesuré : environ 150 lignes pour le module distant, et
  moins de 100 pour la racine de composition du service.

### Négatives

- Deux chemins d'exécution du Village doivent être maintenus, l'un dans le processus,
  l'autre distant ; seul le premier est exercé en production.
- Les événements du Village sont copiés dans le journal de l'application, avec une
  cohérence différée : un événement du service n'y apparaît qu'une fois relayé.
- Des raccourcis doivent être traités avant tout déploiement du service, et sont consignés
  au registre de la dette technique : des migrations qui ne lui sont pas propres, un flux
  publié sans pagination, une boîte d'envoi distribuée seulement à la réception d'un message.
- L'authentification par secret partagé est la plus simple possible : le même secret vaut
  dans les deux sens, et sa fuite permettrait de se faire passer pour n'importe quel joueur
  auprès du service.

## Alternatives écartées

- **Déployer le service** : aucune raison d'extraire ne s'applique au jeu, et le coût d'un
  second déploiement, d'une seconde base et d'échanges réseau ne serait compensé par aucun
  bénéfice.
- **Ne pas extraire** : les frontières resteraient une hypothèse, et les dépendances qui ne
  passent pas par le code ne seraient découvertes que le jour où l'extraction deviendrait
  nécessaire.
- **Lecture à distance du flux publié par le Classement et le canal temps réel** : le moteur
  des projections et le temps réel devraient savoir lire deux sources, ce qui modifierait
  la plateforme et le Classement, alors que le relais les laisse inchangés.
- **Extraire le Marché** : sa saga lie son sort à celui du Village, et l'extraire sans le
  Village ne démontrerait pas l'indépendance d'un module.
- **Jeton signé ou TLS mutuel pour authentifier les échanges** : plus robustes, ils
  demandent une gestion de clés ou de certificats que ne justifie pas un service exécuté
  sur le poste de développement.

## Réexamen

Cette décision devra être réexaminée si le Village dépasse le budget du test de charge
alors que les autres modules le respectent, si une seconde équipe prend en charge le
Village, ou si le Village doit être déployé plus souvent que le reste du jeu.

## Usage de l'IA générative

Assistance de Claude (modèle Opus 5.5) pour mise en forme et formulation.
