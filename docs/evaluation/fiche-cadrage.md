# Fiche de cadrage : Pillage

- Auteur : Sami Paris
- Date : 2026-10-23
- Nom technique du module : `raid`

## L'idée

Un joueur peut lancer un pillage contre le village d'un autre joueur. Le résultat dépend
du développement des deux villages : si le niveau combiné des bâtiments de l'attaquant
dépasse celui du défenseur, l'attaquant s'empare de la moitié des ressources du défenseur ;
s'il est inférieur, l'attaquant est repoussé et l'un de ses bâtiments perd un niveau ; en cas
d'égalité, 50% de chance de réussite ou défaite.

Le pillage permet de réduire le temps nécessaire pour développer son village tout en encourageant la compétition entre les joueurs.

## Les règles métier

Le niveau combiné d'un village est la somme des niveaux de ses trois bâtiments (scierie,
carrière, mine).

1. Seul un joueur qui a fondé un village peut lancer un pillage.
2. La cible est le village fondé d'un autre joueur : un joueur ne peut pas se piller
   lui-même, ni piller un joueur sans village.
3. Un joueur n'a qu'un pillage en cours à la fois : il ne peut en lancer un nouveau tant que
   le précédent n'est pas terminé.
4. Un joueur ne peut pas piller le même village plus d'une fois par heure.
5. Si le niveau combiné de l'attaquant est strictement supérieur à celui du défenseur, le
   pillage réussit.
6. Si le niveau combiné de l'attaquant est strictement inférieur à celui du défenseur, le
   pillage échoue.
7. En cas d'égalité, le pillage réussit ou échoue avec une chance sur deux. Le tirage utilise
   un générateur à graine : le résultat est enregistré, et reste le même à chaque relecture.
8. Un pillage réussi prélève la moitié de chaque ressource du défenseur, telle qu'elle est au
   moment du prélèvement, arrondie à l'entier inférieur, et la verse à l'attaquant. Aucune
   ressource n'est créée ni perdue.
9. Un défenseur sans ressource ne perd rien : le pillage réussit, sans butin.
10. Un pillage échoué réduit de 1 le niveau d'un bâtiment de l'attaquant, tiré au sort parmi
    ceux dont le niveau dépasse leur niveau de départ (scierie 1, carrière 1, mine 0). Un
    bâtiment n'est jamais ramené sous son niveau de départ ; si aucun ne peut l'être,
    l'échec est sans perte.
11. Le défenseur ne perd jamais de niveau, et l'attaquant ne perd jamais de ressource.
12. Le Classement présente, pour chaque joueur, le nombre de pillages réussis au cours du jour
    en cours (heure de Paris).
13. Le niveau d'un village, combiné ou bâtiment par bâtiment, n'est jamais communiqué à un
    autre joueur, ni avant ni après un pillage : l'attaquant ne connaît que le résultat.

## Les commandes et les lectures

| Action du joueur | Commande ou lecture | Route envisagée |
| --- | --- | --- |
| Voir les villages qu'il peut piller, sans leur niveau | Lecture | `GET /api/raid/targets` |
| Lancer un pillage contre un village | Commande | `POST /api/raid/raids` |
| Suivre ses pillages, lancés et subis, et leur résultat | Lecture | `GET /api/raid/raids` |
| Consulter le classement des pillages réussis du jour | Lecture | `GET /api/ranking/raids` |

## Le stockage envisagé

Journal d'événements, selon le modèle decider. Un pillage a une valeur de jeu durable : son
résultat doit pouvoir être expliqué à un joueur qui le conteste, et le Classement compte les
pillages réussis à partir de leurs événements, comme il compte les expéditions gagnées. Un
flux par attaquant, `raid-<joueur>`, permet de faire respecter les règles 3 et 4 par la
concurrence optimiste du journal, sans lire d'autre flux.

## La communication avec les modules existants

- **Village vers Pillage, par lecture du langage publié** : une projection du module tient les
  niveaux et le nom de chaque village à partir des événements `VillageFounded`,
  `BuildingUpgraded` et du nouvel événement de perte de niveau. Elle est rattrapée juste avant
  le lancement d'un pillage, qui compare les niveaux qu'elle contient.
- **Pillage vers Village, par messages de la boîte d'envoi** : une saga orchestrée par le
  Pillage demande au Village de prélever la moitié du stock du défenseur, puis de verser le
  butin à l'attaquant, ou de réduire le niveau d'un bâtiment de l'attaquant. Le Village reçoit
  deux nouveaux sujets dans ses contrats : le prélèvement d'une part du stock, dont la réponse
  indique les quantités prélevées, et la perte d'un niveau. Le versement utilise le sujet
  existant `realm.deposit`. Les gestionnaires restent idempotents.
- **Pillage vers Classement, par lecture du langage publié** : la projection du Classement lit
  les événements de pillage réussi du Pillage, et sa version est augmentée afin qu'elle soit
  reconstruite.

## Les données personnelles

- L'identifiant de l'attaquant et celui du défenseur, dans les événements et les messages du
  module. Les événements ne contiennent aucun nom : le nom d'un village est retrouvé à
  l'affichage.
- Le nom de chaque village, dans la table de la projection des cibles.
- Les pillages réussis par jour de chaque joueur, dans la table du Classement.

Le contributeur `personal-data.ts` exporte les pillages lancés et subis par le joueur, et
efface son nom de village dans la table des cibles.

## Les bonus visés

1. B4 : la projection des niveaux et des noms de villages, avec son point de reprise et sa
   version.
2. B6 : une communication avec deux modules existants, le Village et le Classement.
3. B2 : la limite d'un pillage par heure contre un même village, appliquée sans tâche de fond.
4. B8 : une fonction d'aptitude qui vérifie que les événements du Pillage ne contiennent aucun
   nom de joueur ni de village.
