# ADR-0011 - Communication du Pillage : saga orchestrée avec le Village, lecture du langage publié par le Pillage et le Classement

- Statut : accepté
- Date : 2026-10-23

## Contexte

Le Pillage a besoin de données qui appartiennent au Village : le nom et les niveaux des
villages, pour présenter les cibles et décider de l'issue d'un pillage. Ses effets portent
aussi sur des données du Village : prendre la moitié du stock du défenseur et la verser à
l'attaquant, ou faire perdre un niveau à un bâtiment de l'attaquant. Seul le Village calcule
un stock, qui dépend de sa production, et seul il modifie un village (ADR 0001).

Le Classement doit présenter, pour chaque joueur, le nombre de pillages réussis du jour. Il
n'accepte aucune commande, et ne lit que le journal.

Une transaction ne modifie jamais les données que d'un seul module, et une opération qui en
concerne plusieurs est une saga orchestrée, dont les messages passent par la boîte d'envoi. 
Les décisions s'appuient sur le modèle d'écriture, et non sur un modèle de lecture.
Chaque module range ses tables dans son propre schéma.

Le Village peut être extrait dans un service autonome : toute communication avec
lui doit fonctionner dans les deux cas.

## Décision

### Village vers Pillage : lecture du langage publié (bonus B4)

Une projection du Pillage, `raid-villages`, construit la table `raid.villages` (nom et
niveaux de chaque village) à partir des événements du Village : `VillageFounded`,
`BuildingUpgraded` et `BuildingDowngraded`. Les niveaux de départ, absents de l'événement de
fondation, sont publiés par les contrats du Village. La projection a son point de reprise et
sa version, comme toute projection du projet. Le Pillage ne lit jamais les tables du Village.

Les cibles présentées à un joueur ne contiennent que l'identifiant et le nom du village, jamais
ses niveaux.

**Exception à l'ADR 0006.** L'issue d'un pillage est décidée sur les niveaux lus dans cette
projection, et non sur le modèle d'écriture du Village. L'exception est limitée :

- la projection est rattrapée juste avant chaque lancement : seuls les événements du Village
  en cours d'écriture à cet instant peuvent manquer ;
- seule l'issue est décidée ainsi : les effets sur les données sont décidés par le Village,
  sur son propre modèle d'écriture. Il calcule la moitié du stock au moment du prélèvement, et
  vérifie de nouveau qu'un bâtiment dépasse son niveau de départ avant de le réduire.

### Pillage vers Village : saga orchestrée, par messages

Le Pillage orchestre la saga d'un pillage ; le Village en est un participant qui ignore tout
des pillages. Ses contrats publient deux sujets nouveaux, utilisables par tout autre module :

- `realm.seize` prélève une part du stock d'un village, arrondie à l'entier inférieur, et
  répond en indiquant les quantités prélevées ;
- `realm.lose-level` réduit de 1 le niveau d'un bâtiment, ou répond par un refus s'il est à son
  niveau de départ.

Le butin est versé à l'attaquant par le sujet existant `realm.deposit`. Le Village répond au
sujet `raid.transfer-result` indiqué dans chaque demande. Lancer un pillage étant gratuit,
aucune étape n'est compensable : le prélèvement est le pivot, le versement et la perte de
niveau sont repris jusqu'au succès.

Les garanties sont celles de l'ADR 0007 :

- **livraison au moins une fois** : chaque demande est enregistrée dans la boîte d'envoi, dans
  la même transaction que l'événement du Pillage qui la déclenche ;
- **idempotence** : chaque demande porte un identifiant, `attaquant:pillage:étape`, que le
  Village retient ; une demande déjà traitée ne produit ni effet ni réponse. Côté Pillage,
  seule la réponse attendue par le pillage en cours le fait avancer ;
- **cohérence différée** : la boîte d'envoi est distribuée après chaque lancement et chaque
  consultation de l'historique, et chaque jour par la tâche planifiée. Dans le cas ordinaire,
  le pillage est terminé lorsque la réponse du lancement parvient au joueur.

Le Village extrait transmet les deux nouveaux sujets à son service, comme les deux anciens.

### Pillage vers Classement : lecture du langage publié

La projection du Classement lit les événements `RaidPlundered` et retrouve l'attaquant par le
préfixe de flux publié par les contrats du Pillage. Sa version passe de 2 à 3, afin qu'elle
soit reconstruite. Elle compte les pillages réussis de chaque joueur, jour par jour à l'heure
de Paris, dans une nouvelle table de son propre schéma, `ranking.raids_by_day`. Le lecteur du
Classement présente le compte du jour, sans changer l'ordre du classement.

Cette table est créée par une migration propre au Classement, distincte de celle du Pillage,
qui ne crée que le schéma `raid`. C'est le Classement qui la possède, la remplit et la lit.

### Deux modules partenaires (bonus B6)

Le Pillage communique ainsi avec deux modules existants : le Village, dans les deux sens, et
le Classement, qui lit ses événements.

## Conséquences

### Positives

- Le Village ne connaît aucune règle du Pillage : il prélève, verse ou réduit un niveau à la
  demande, et ses deux nouveaux sujets pourraient servir à un autre module sans modification.
- Une panne à n'importe quel moment de la saga ne crée ni ne perd aucune ressource : le butin
  versé est exactement ce que le Village a prélevé.
- Les effets d'un pillage reposent sur l'état réel du Village : une moitié de stock calculée au
  moment du prélèvement, une perte de niveau revérifiée.
- Le Pillage ignore l'existence du Classement, et le Classement ne reçoit aucune commande.
- La communication fonctionne avec le Village dans le processus comme avec le Village extrait.

### Négatives

- L'issue peut reposer sur des niveaux en retard de quelques instants, si le défenseur ou
  l'attaquant améliore un bâtiment au moment du lancement. Avec le Village extrait, ce retard
  s'ajoute à celui du relais des événements.
- Une saga interrompue laisse le pillage en cours, et l'attaquant ne peut en lancer un autre
  qu'une fois qu'elle reprend : à la consultation suivante de l'historique, ou le lendemain.
- Le Village publie de nouveaux sujets, dont les gestionnaires doivent rester idempotents ; la
  réponse à tout prélèvement contient désormais les quantités prélevées.
- Le Classement dépend du langage publié du Pillage, comme du Village et du Donjon : un
  changement de l'événement `RaidPlundered` ou du nom des flux passerait inaperçu sans
  réexamen de ses lecteurs.
- Le schéma du Classement reçoit une table par module qu'il présente : chaque nouvelle colonne
  du classement fondée sur un autre module demande une migration du Classement.

## Alternatives écartées

- **Demander les niveaux au Village par message, avant de décider** : la saga gagnerait une
  étape, le lancement deviendrait asynchrone, et la réponse serait de toute façon périmée dès
  son envoi, le Village continuant d'évoluer.
- **Relire les flux du Village et les rejouer dans le Pillage** : il faudrait reprendre les
  règles d'évolution d'un village, qui appartiennent au domaine du Village.
- **Laisser le Village décider de l'issue** : les règles du Pillage (comparaison, égalité,
  tirage) passeraient dans le domaine du Village, qui dépendrait d'un autre module.
- **Saga chorégraphiée**, le Village réagissant aux événements du Pillage : le Village devrait
  connaître les pillages, et le déroulement ne se lirait plus en un seul endroit (ADR 0007).
- **Compteur des pillages du jour dans le schéma du Pillage, lu par le Classement** : un module
  ne lit jamais les tables d'un autre.
- **Messages du Pillage au Classement** : le Classement deviendrait un module à commandes, alors
  qu'il n'est qu'un modèle de lecture reconstructible à partir du journal (ADR 0006).

## Réexamen

Cette décision devra être réexaminée si les niveaux changent assez souvent pour que le retard
de la projection se perçoive dans les issues, si le Village extrait est déployé en production,
ou si le Classement doit présenter des données de plusieurs autres modules.

## Usage de l'IA générative

Assistance de Claude (modèle Opus 5.5) pour génération de blocs Typescript et la rédaction de cet
ADR. Vérification : relecture complète du code et de la documentation, exécution des tests automatisés (pnpm verify) et tests manuels des fonctionnalités dans le jeu.
