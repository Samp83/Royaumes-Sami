# ADR-0002 - Event Sourcing comme mode de persistance du Village

- Statut : accepté
- Date : 2026-10-20

## Contexte

Le Village est l'objet central du jeu. Son état (nom, stock de ressources, niveaux des
bâtiments) n'est jamais saisi directement : il évolue par une suite d'actions du joueur,
la fondation puis les améliorations successives des bâtiments. Le domaine exprime déjà
ces actions sous forme d'événements, et sait reconstruire l'état en les rejouant.

Le jeu doit diffuser les changements en temps réel aux joueurs connectés, et construire
des vues de lecture, comme un classement, à partir de l'activité des joueurs.

L'hébergement sans serveur de Vercel impose par ailleurs sa contrainte : plusieurs
instances de l'application peuvent traiter simultanément des requêtes pour un même
village, sans partager de mémoire. Leur seul point commun est la base PostgreSQL.

## Décision

L'état du village n'est pas stocké : il est reconstruit en rejouant ses événements.

Les événements sont enregistrés dans un journal générique de la plateforme, la table
`platform.events`, en ajout seul. Chaque village dispose de son propre flux, nommé
`village-<joueur>`, dans lequel chaque événement porte une version. Le journal ignore la
signification des événements, qu'il conserve sous la forme d'un type et de données JSON.

Les écritures concurrentes sont détectées par la contrainte d'unicité de la base sur le
couple (flux, version). En cas de conflit, la commande est rejouée sur l'état à jour,
au plus trois fois.

Un événement porte toutes les informations nécessaires à son application, comme le coût
payé pour une amélioration.

Le journal est implémenté dans `src/platform/event-store/`, et l'adaptateur du Village
dans `src/modules/realm/infrastructure/event-store-village-repository.ts`.

## Conséquences

### Positives

- Historique complet : le journal conserve tout ce qui s'est produit dans chaque village.
- L'état peut être reconstruit à tout moment, y compris à une version passée, et une
  règle erronée peut être corrigée puis les événements rejoués.
- Les mêmes événements peuvent alimenter la diffusion en temps réel et les vues de
  lecture, sans mécanisme supplémentaire de suivi des modifications.
- Les conflits sont détectés par la base elle-même, quel que soit le nombre d'instances :
  un double clic ne peut pas faire dépenser deux fois les mêmes ressources.
- Le passage à cette persistance n'a demandé qu'un nouvel adaptateur : le domaine et la
  couche application sont inchangés.

### Négatives

- Un événement enregistré ne peut plus être modifié : si sa structure évolue, le code
  doit savoir lire à la fois les anciennes et les nouvelles versions, indéfiniment.
- Chaque chargement relit et rejoue tout le flux : le coût de lecture croît avec le
  nombre d'événements d'un village.
- Une question portant sur tous les villages ne peut pas être posée directement à la
  base : elle exige une vue de lecture dédiée.
- Un journal dont rien n'est supprimé entre en tension avec le droit à l'effacement.
- Au-delà de trois tentatives, une commande en conflit échoue.

## Alternatives écartées

- **Stockage de l'état dans une table propre au module** : plus simple, mais il ne
  conserve que l'état courant et perd la manière dont il a été atteint. La diffusion des
  changements et les vues de lecture exigeraient un mécanisme supplémentaire.
- **Verrouillage pessimiste** : il évite les conflits, mais au prix d'attentes et d'un
  verrou maintenu pendant tout le traitement, ce qui s'accorde mal avec une exécution
  sans serveur. Les conflits étant rares pour un village, les détecter suffit.
- **Vérification de la version par l'application** : elle n'est fiable qu'au sein d'un
  seul processus, et laisse passer deux écritures traitées par deux instances distinctes.

## Réexamen

Cette décision devra être réexaminée si le nombre d'événements par village rend la
reconstruction de l'état coûteuse, ou si les conflits d'écriture deviennent fréquents.

## Usage de l'IA générative

Assistance de Claude (modèle Opus 5.5) pour mise en forme et formulation.
