# ADR-0010 - Journal d'événements pour le Pillage, un flux par attaquant, sans aucun nom dans les événements

- Statut : accepté
- Date : 2026-10-23

## Contexte

Le Pillage permet à un joueur d'attaquer le village d'un autre joueur. L'issue dépend des
niveaux combinés des bâtiments des deux villages, tirée au sort en cas d'égalité ; un succès prend la
moitié des ressources du défenseur, un échec fait perdre un niveau d'un bâtiment à l'attaquant. Un pillage
a une valeur de jeu durable : son résultat doit pouvoir être expliqué au joueur qui le
conteste, et le Classement compte les pillages réussis de chaque joueur.

Deux règles limitent les lancements d'un même joueur : un seul pillage en cours à la fois,
et pas plus d'un pillage contre le même village toutes les cinq minutes. Plusieurs instances
de l'application peuvent traiter au même instant deux lancements d'un même joueur.

Un joueur consulte les pillages qu'il a lancés, mais aussi ceux qu'il a subis, qui ont été
lancés par d'autres joueurs.

Le Classement ne lit que le journal. Les données personnelles d'un nouveau module
doivent être conçues pour l'effacement dès l'origine : l'ADR 0008 recommande les références
sans copie, c'est-à-dire des identifiants plutôt que des noms dans les événements.

## Décision

Le Pillage utilise le journal d'événements, selon le modèle decider. Chaque attaquant a son
propre flux, `raid-<joueur>`, qui contient tous les pillages qu'il a lancés. Ses trois
événements sont `RaidLaunched`, `RaidPlundered` et `RaidRepelled`.

Les deux règles de lancement sont vérifiées par `decide` sur l'état de ce seul flux : le
pillage en cours, et l'instant du dernier pillage contre chaque village. Deux lancements
simultanés d'un même joueur sont départagés par la concurrence optimiste du journal
(ADR 0002) : le second est rejoué sur l'état à jour, et refusé.

L'issue est décidée au lancement. Le tirage d'une égalité, et celui du bâtiment qui perdra un
niveau, sont faits dans `decide` avec un générateur à graine ; la graine et les résultats
sont enregistrés dans `RaidLaunched`, comme au Donjon. Les niveaux comparés y sont aussi enregistrés, pour expliquer le résultat, mais ne sont jamais présentés à un autre joueur.

Les événements ne contiennent que des identifiants, jamais un nom de joueur ou de village :
les noms sont retrouvés à l'affichage. Le contributeur aux droits des joueurs n'a donc rien à
réécrire dans le journal lors d'un effacement.

Le module tient deux modèles de lecture dans son propre schéma `raid` : la table des
villages, construite à partir du langage publié du Village, et l'historique des
pillages, construit à partir de ses propres événements. Ce dernier réunit les pillages subis
par un joueur, rangés dans les flux de leurs attaquants. Les deux sont tenus par des
projections rattrapées à la lecture.

### Conservation de l'historique (bonus B2)

L'historique présenté aux joueurs est limité à trente jours : un pillage plus ancien n'est
plus lu, et une tâche quotidienne propre au module le supprime de la table de l'historique. Le journal conserve les événements, conformément à la règle de l'ajout seul (ADR 0002).

### Fonction d'aptitude (bonus B8)

L'absence de nom dans les événements est vérifiée par une fonction d'aptitude
(`src/bootstrap/architecture.test.ts`). Elle joue un pillage réussi et un pillage échoué,
puis échoue si un événement du Pillage contient un nom de village, ou une clé destinée à un
nom.

Le domaine est implémenté dans `src/modules/raid/domain/`, l'adaptateur du journal et les
projections dans `src/modules/raid/infrastructure/`.

## Conséquences

### Positives

- Chaque pillage reste explicable : les niveaux comparés, la graine et le résultat des
  tirages sont enregistrés, et la relecture donne toujours la même issue.
- Les deux règles de lancement tiennent quel que soit le nombre d'instances, sans verrou ni
  lecture d'un autre flux.
- Le Classement compte les pillages réussis à partir du journal, comme les expéditions
  gagnées, sans que le Pillage ait à le connaître.
- L'effacement d'un compte ne réécrit aucun événement du Pillage : il ne touche que le nom de
  village copié dans la table des villages. La fonction d'aptitude empêche qu'un nom soit
  ajouté plus tard à un événement sans que personne ne s'en aperçoive.
- Les décisions sont des fonctions pures, testées sans base de données, de manière exacte
  avec une graine fixée.

### Négatives

- Les pillages subis ne sont lisibles que par une projection : leur affichage a la cohérence
  à terme d'un modèle de lecture.
- La conservation de trente jours ne porte que sur l'historique présenté : le journal garde
  les événements de tous les pillages. Ce n'est pas un effacement, et le registre des
  traitements doit le dire.
- Une reconstruction de la projection de l'historique y replace les pillages de plus de
  trente jours, jusqu'à la tâche quotidienne suivante ; ils restent toutefois exclus de la
  lecture.
- L'état d'un attaquant se reconstruit à partir de tous ses pillages : son coût croît avec
  leur nombre, et l'instant du dernier pillage contre chaque village est conservé sans limite.
- L'identifiant d'une demande adressée au Village contient l'identifiant de l'attaquant,
  séparé par des deux-points : un identifiant de joueur ne doit jamais en contenir.

## Alternatives écartées

- **Tables classiques, une ligne par pillage** : les deux règles de lancement exigeraient une
  transaction et un verrou sur les pillages d'un joueur, et le Classement, qui ne lit que le
  journal, ne pourrait compter les pillages réussis qu'en recevant des messages du Pillage.
  Les messages de la saga ne pourraient pas non plus être enregistrés dans la même
  transaction que l'état du pillage par le mécanisme du journal (ADR 0007).
- **Un flux par pillage**, comme une offre du Marché : vérifier qu'un joueur n'a aucun
  pillage en cours, ou qu'il n'a pas pillé le même village récemment, demanderait de lire
  tous ses flux, sans que la concurrence optimiste d'un flux unique puisse départager deux
  lancements simultanés.
- **Un flux par défenseur** : il départagerait les pillages subis par un même village, mais
  ni la règle du pillage en cours ni celle du délai, qui portent sur l'attaquant.
- **Suppression des événements de plus de trente jours** : contraire à la règle de l'ajout
  seul (ADR 0002), elle ferait aussi perdre au Classement et à l'export les pillages anciens.

## Réexamen

Cette décision devra être réexaminée si le nombre de pillages lancés par un même joueur rend
la reconstruction de son état coûteuse, ce qui appellerait un instantané de l'état, si la
durée de conservation doit s'appliquer au journal lui-même, ou si un pillage doit réunir
plusieurs attaquants, ce qu'un flux par attaquant ne permet pas.

## Usage de l'IA générative

Assistance de Claude (modèle Opus 5.5) pour génération de blocs Typescript et la rédaction de cet
ADR. Vérification : relecture complète du code et de la documentation, exécution des tests automatisés (pnpm verify) et tests manuels des fonctionnalités dans le jeu.
