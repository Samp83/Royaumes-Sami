# ADR-0006 - Modèles de lecture séparés du modèle d'écriture, tenus par des projections rattrapées à la lecture

- Statut : accepté
- Date : 2026-10-21

## Contexte

Certaines lectures traversent les flux du journal : le classement des joueurs, qui
résume leur activité dans le Village et le Donjon, et la liste des expéditions ouvertes.
Calculées par rejeu à chaque consultation, elles relisent l'essentiel du journal, et leur
coût croît avec l'historique du jeu, sans limite (dette DT-005).

Le journal est conçu pour l'écriture : il répond bien à la question « que s'est-il passé
dans ce flux ? », mais mal à une question qui porte sur tous les flux, comme « quels sont
les dix meilleurs joueurs ? ».

L'hébergement ne permet aucun processus permanent (ADR 0004) : aucun processus de fond ne
peut surveiller le journal, et les tâches planifiées de l'offre gratuite ne s'exécutent
qu'une fois par jour.

Le journal attribue à chaque événement une position globale, croissante mais non
continue : deux insertions simultanées ne sont pas nécessairement validées dans l'ordre de
leurs positions, et une insertion annulée laisse une position inutilisée (ADR 0002).

## Décision

Les lectures transversales s'appuient sur des modèles de lecture, des tables placées dans
le schéma PostgreSQL de leur module (`ranking.players`, `dungeon.open_games`). Les
décisions s'appuient toujours sur le modèle d'écriture, le journal, qui reste la seule
source de vérité.

Chaque modèle de lecture est tenu à jour par une projection, qui applique les événements
du journal dans l'ordre global. Son point de reprise, la position du dernier événement
traité, est enregistré dans la table `platform.projections`.

Une projection est rattrapée au moment de sa consultation, juste avant de répondre. Le
rattrapage a lieu dans une seule transaction, qui met à jour les tables et le point de
reprise ensemble, et verrouille ce point de reprise : un second rattrapage simultané
attend la fin du premier.

Le rattrapage s'arrête devant une position manquante tant que l'événement qui la suit a
moins de cinq secondes ; au-delà, la position manquante est considérée comme celle d'une
insertion annulée.

Chaque projection porte une version, enregistrée avec son point de reprise. Une version
du code plus élevée que celle des tables provoque leur reconstruction à partir du journal ;
une version moins élevée interdit toute écriture.

Le classement est annoncé aux navigateurs par un canal global et discret, qui transmet la
position des événements suivis par la projection, tous flux confondus, sans leurs données.
L'interface relit le classement jusqu'à ce que la projection ait atteint la position
annoncée.

Le moteur des projections est implémenté dans `src/platform/projection/`, et les
projections dans l'infrastructure des modules Classement et Donjon.

## Conséquences

### Positives

- Le coût d'une consultation dépend du nombre d'événements nouveaux depuis la dernière,
  et non de l'historique du jeu.
- Les modules qui écrivent ne savent rien des projections qui les lisent : le Village et
  le Donjon ignorent l'existence du Classement.
- Une nouvelle information est calculée pour tout le passé, sans migration de données : il
  suffit de compléter la projection et d'augmenter sa version.
- Une erreur dans une projection se corrige dans le code, puis par une reconstruction, sans
  jamais corriger de données.
- Aucune tâche de fond ni opération manuelle n'est nécessaire, y compris après un
  déploiement : la reconstruction a lieu au premier rattrapage.

### Négatives

- La cohérence n'est qu'à terme : un modèle de lecture peut avoir quelques secondes de
  retard sur le journal, en particulier devant une position manquante.
- La reconstruction a lieu pendant une consultation, dont la durée est limitée sur
  Vercel : elle devient impossible au-delà d'une certaine taille du journal.
- Après un retour à une version précédente de l'application, une projection dont la
  version a été augmentée cesse d'avancer jusqu'au déploiement suivant.
- Les projections dépendent du langage publié des autres modules : un événement modifié ou
  ajouté sans réexamen de ses lecteurs passe inaperçu, comme l'ont montré les compagnons,
  longtemps absents du décompte des héros de la liste des expéditions ouvertes.
- Une consultation peut écrire dans la base, et la première consultation après une longue
  inactivité paie seule le rattrapage.

## Alternatives écartées

- **Mise à jour des modèles de lecture dans la commande, par le module qui écrit** : le
  modèle serait à jour dès la réponse, mais chaque module devrait connaître toutes les
  projections qui dépendent de lui, contrairement à l'encapsulation des modules.
- **Tâche planifiée** : sur l'offre gratuite, elle ne s'exécute qu'une fois par jour, ce
  qui laisserait le classement en retard d'une journée.
- **Processus de fond abonné au journal** : aucun processus permanent ne peut s'exécuter
  sur l'hébergement retenu.
- **Vue matérialisée de PostgreSQL** : chaque rafraîchissement la recalcule entièrement,
  et son coût croît donc, comme le rejeu, avec l'historique du jeu.
- **Maintien du calcul par rejeu** : le coût de chaque consultation continuerait de croître
  avec l'historique, sans limite.

## Réexamen

Cette décision devra être réexaminée si la durée d'une reconstruction approche la durée
maximale d'une fonction, si le nombre de consultations simultanées fait du verrou du point
de reprise un goulet d'étranglement, ou si une lecture doit être strictement à jour.

## Usage de l'IA générative

Assistance de Claude (modèle Opus 5.5) pour mise en forme et formulation.
