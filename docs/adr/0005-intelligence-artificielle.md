# ADR-0005 - Intelligence artificielle déterministe, exécutée dans le domaine, sans tâche de fond

- Statut : accepté
- Date : 2026-10-21

## Contexte

Le besoin : des monstres dont le comportement dépend d'un niveau de difficulté, et des compagnons qui permettent de jouer seul.

L'hébergement ne permet aucun processus permanent (ADR 0004).

L'état d'une expédition est reconstruit à partir de ses événements, et une manche peut être calculée lors d'une lecture sans être enregistrée (ADR 0002 et 0004).

## Décision

Les décisions de l'intelligence artificielle sont des fonctions pures du domaine, appelées
au moment de la résolution d'une manche : les actions des compagnons sont décidées au
début de la résolution, et la cible de chaque monstre lors de son attaque.

Elles ne tirent au sort qu'au moyen du générateur de la manche. Leurs résultats, actions
des compagnons comprises, sont enregistrés dans l'événement `RoundResolved`.

Le comportement des monstres est isolé derrière un port de stratégie, `MonsterStrategy`,
dont chaque niveau de difficulté fournit une mise en œuvre : une cible tirée au hasard au
niveau facile, des attaques concentrées au niveau difficile. Le niveau est enregistré dans
l'événement `GameCreated` ; les expéditions enregistrées sans ce champ reçoivent le niveau
facile à la lecture.

Un compagnon n'agit que si au moins un joueur a choisi une action pour la manche ; sinon,
il se défend. Il ne prend jamais de tour d'exploration, et une expédition dont tous les
joueurs sont tombés est perdue, même si un compagnon est encore debout.

L'équilibre du jeu est mesuré par la simulation d'expéditions complètes, jouées en mémoire
par des joueurs simulés, et protégé par des tests statistiques.

Les stratégies sont implémentées dans `src/modules/dungeon/domain/monster-strategies.ts`,
le compagnon dans `companion.ts`, et la simulation dans `simulation.ts`.

## Conséquences

### Positives

- Aucune nouvelle brique d'architecture : l'intelligence artificielle s'insère dans la
  résolution des manches, sans processus permanent ni tâche de fond.
- Les décisions sont reproductibles : la même manche produit toujours les mêmes
  décisions, qu'elle soit calculée lors d'une lecture ou enregistrée par une commande.
- La relecture d'une expédition n'exécute jamais l'intelligence artificielle : une
  modification de son comportement ne change pas les parties déjà jouées.
- Ajouter un niveau de difficulté consiste à écrire une nouvelle stratégie, sans modifier
  les règles du combat.
- Les décisions se testent sans base de données ni serveur, de manière exacte avec une
  graine fixée, et sur de nombreuses graines pour vérifier invariants et tendances, sans
  test instable.
- L'équilibre du jeu est réglé à partir de mesures : des centaines d'expéditions complètes sont simulées en quelques secondes.

### Négatives

- Un personnage piloté par l'ordinateur ne peut ni réagir entre deux échéances, ni agir
  de sa propre initiative : il n'agit qu'au moment de la résolution d'une manche.
- La qualité de l'équilibre dépend de la règle suivie par les joueurs simulés, qui ne
  jouent ni comme des joueurs expérimentés ni comme des débutants.
- Chaque nouveau champ d'un événement doit être facultatif et recevoir une valeur par
  défaut à la lecture, puisque les événements déjà enregistrés ne peuvent pas être modifiés.
- Le calcul des décisions s'ajoute à chaque lecture d'une expédition dont des manches
  sont échues : une intelligence artificielle coûteuse ralentirait toutes les lectures.
- Un compagnon ne joue pas à la place d'un joueur absent : une expédition abandonnée est
  perdue, même avec des compagnons.

## Alternatives écartées

- **Boucle de jeu exécutée par un processus permanent** : aucun processus ne s'exécute
  entre deux requêtes sur l'hébergement retenu, et un serveur permanent supplémentaire
  serait contraire aux critères du projet.
- **Décisions prises par le navigateur d'un joueur** : le navigateur ne connaît pas
  l'état complet de l'expédition, et ne doit pas le connaître ; un joueur pourrait de plus
  modifier les décisions de ses compagnons ou des monstres.
- **Recalcul des décisions lors de la relecture, plutôt que leur enregistrement** : toute
  modification ultérieure d'une stratégie changerait le déroulement des parties déjà
  jouées, et la relecture d'une expédition exécuterait l'intelligence artificielle.

## Réexamen

Cette décision devra être réexaminée si un personnage doit agir en temps réel, entre deux
échéances, ou si une intelligence artificielle devient trop coûteuse en calcul pour être
exécutée lors d'une lecture.

## Usage de l'IA générative

Assistance de Claude (modèle Opus 5.5) pour mise en forme et formulation.
