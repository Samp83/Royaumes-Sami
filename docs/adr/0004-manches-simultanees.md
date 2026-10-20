# ADR-0004 - Manches simultanées, aux échéances paresseuses, pour les combats du Donjon

- Statut : accepté
- Date : 2026-10-20

## Contexte

Les combats du Donjon réunissent jusqu'à quatre joueurs humains. Ils ne doivent ni
s'attendre indéfiniment, ni être avantagés ou désavantagés par l'ordre dans lequel ils
jouent.

L'hébergement sans serveur de Vercel ne permet ni minuteur en mémoire, ni tâche de fond :
une fonction s'arrête après avoir répondu, et l'instance qui démarre une manche n'est pas
nécessairement celle qui traite la requête suivante. Les tâches planifiées de l'offre
gratuite ne s'exécutent qu'une fois par jour.

L'état d'une expédition est reconstruit à partir de ses événements, à chaque requête
(ADR 0002) : tout calcul, y compris un tirage au sort, doit donner le même résultat à
chaque reconstruction.

Les choix des joueurs doivent rester secrets jusqu'à la résolution de la manche. Une
expédition est un flux partagé, que plusieurs joueurs modifient au même instant.

## Décision

Les héros choisissent leur action simultanément. La manche est résolue lorsque tous les
héros debout ont choisi, ou lorsque son échéance de trente secondes est atteinte ; un
héros qui n'a rien choisi se défend.

L'échéance est une donnée, enregistrée dans l'événement qui ouvre la manche. Une manche
échue est résolue à l'instant de son échéance, et non à l'instant où elle est calculée.

Une lecture calcule la résolution des manches échues sans rien enregistrer. Toute
commande commence par enregistrer cette résolution, puis traite sa propre demande.
Lorsque son compte à rebours atteint zéro, le navigateur envoie une commande d'échéance,
dont le seul rôle est de faire enregistrer la résolution.

Le hasard est tiré dans `decide`, avec un générateur pseudo-aléatoire à graine. La graine
de l'expédition est tirée à sa création ; celle de chaque manche en est dérivée, avec le
numéro de la manche. Les résultats des tirages (salles, dégâts) sont enregistrés dans les
événements, et la graine n'est jamais transmise aux joueurs.

Une action porte le numéro de la manche visée, et elle est refusée si cette manche est
déjà résolue. Une commande en conflit d'écriture est rejouée jusqu'à cinq fois, une fois
par héros et une fois pour la commande d'échéance.

Chaque joueur ne reçoit qu'une vue filtrée, sans les choix des autres héros, et le canal
temps réel d'une expédition ne transmet que le type et la version de chaque événement.

Ces règles sont implémentées dans `src/modules/dungeon/domain/` (`rules.ts`, `random.ts`,
`view.ts`), et le nombre de tentatives dans `src/modules/dungeon/application/dungeon-service.ts`.

## Conséquences

### Positives

- La durée d'une manche ne dépend pas du nombre de joueurs : elle est plafonnée à trente
  secondes, et aucun joueur n'est avantagé par l'ordre de jeu.
- Aucun minuteur, aucune tâche de fond ni aucun service supplémentaire : les échéances
  fonctionnent quelle que soit l'instance qui traite la requête.
- Toute lecture affiche l'état exact de l'expédition, même si la résolution d'une manche
  n'est pas encore enregistrée.
- Les lectures restent sans effet sur le serveur : une consultation ne provoque ni
  écriture, ni conflit de version, ni notification.
- Le hasard est reproductible : la résolution calculée par une lecture est exactement celle
  qui sera enregistrée, et une graine fixée rend les tests exacts.
- La commande d'échéance peut être envoyée plusieurs fois sans effet supplémentaire ; quatre
  héros qui agissent au même instant voient tous leur action enregistrée.

### Négatives

- Si plus aucun joueur ne se manifeste, la résolution n'est jamais enregistrée : le
  journal peut rester en retard sur ce qu'affichent les lectures, et une expédition
  abandonnée en plein combat n'enregistre jamais sa fin.
- Les notifications dépendent des navigateurs : sans navigateur ouvert pour envoyer la
  commande d'échéance, aucun joueur n'est notifié de la résolution d'une manche.
- Le fonctionnement surprend à la lecture du code : une lecture affiche une manche que le
  journal ne contient pas encore, et le navigateur envoie une commande qui n'enregistre
  rien d'autre que cette résolution.
- Le générateur n'est pas cryptographique : la confidentialité de la graine est la seule
  protection contre la prévision des tirages.
- Chaque lecture et chaque commande rejouent la résolution de toutes les manches échues
  depuis le dernier événement enregistré.

## Alternatives écartées

- **Tour par tour strict** : chaque joueur attendrait tous les autres, la durée d'une
  manche croîtrait avec le nombre de joueurs, et le dernier à jouer agirait en connaissant
  le choix des précédents.
- **Minuteur en mémoire ou tâche planifiée** : un minuteur n'a nulle part où s'exécuter
  dans une fonction qui s'arrête après sa réponse, et les tâches planifiées de l'offre
  gratuite, quotidiennes, sont bien trop espacées pour une échéance de trente secondes.
- **Lecture qui enregistre elle-même la résolution** : contraire à la sémantique de GET,
  elle ferait d'une simple consultation une source d'écritures, de conflits de version et
  de notifications.
- **Tirage par `Math.random`, dont seul le résultat serait enregistré** : il suffirait
  pour une résolution enregistrée, mais une manche échue, calculée à chaque lecture avant
  d'être enregistrée, afficherait des dégâts différents à chaque calcul.

## Réexamen

Cette décision devra être réexaminée si la fin d'une expédition abandonnée doit être
enregistrée, si des héros doivent agir sans navigateur ouvert, ou si un service de
planification de tâches compatible avec l'hébergement devient disponible.

## Usage de l'IA générative

Assistance de Claude (modèle Opus 5.5) pour mise en forme et formulation.
