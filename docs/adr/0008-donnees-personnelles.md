# ADR-0008 - Stockage classique pour la Taverne, et réécriture ciblée des champs personnels du journal pour l'effacement

- Statut : accepté
- Date : 2026-10-21

## Contexte

La Taverne offre une messagerie commune à tous les joueurs et la liste des joueurs
présents. Ses données sont personnelles et destinées à disparaître : un message est
supprimé trente jours après sa publication, et la présence d'un joueur n'est conservée que
le temps de sa visite. Aucune décision ne dépend de leur historique, et aucun autre module
ne les lit.

Les droits d'accès, de portabilité et d'effacement (RGPD, articles 15, 17 et 20) portent sur
le jeu entier : les données d'un joueur se trouvent dans tous les modules, dans le journal,
la boîte d'envoi et les tables de lecture.

Le nom des joueurs a été copié dans des événements du Donjon et du Marché, et le nom de
leur village dans ceux du Village, pour que chaque module puisse les afficher. Ces
événements appartiennent parfois à des flux partagés avec d'autres joueurs, comme une
expédition commune ou une offre acceptée.

Le journal est en ajout seul : aucun événement n'est jamais modifié ni supprimé (ADR 0002),
et les projections en dépendent (ADR 0006).

## Décision

La Taverne n'utilise pas l'Event Sourcing. Ses données sont conservées dans des tables
ordinaires, dans le schéma `tavern`, dont les lignes sont supprimées à l'expiration de leur
durée de conservation. Son canal temps réel est alimenté par une source fournie par le
module, et non par le journal.

La présence repose sur un signal périodique, envoyé par le navigateur toutes les trente
secondes. La table de présence ne contient qu'une ligne par joueur présent, supprimée à son
départ ou deux minutes après son dernier signal ; aucun historique des connexions n'est
constitué.

Les durées de conservation sont appliquées à la lecture, et chaque jour par la route des
tâches quotidiennes (`/api/cron/daily`).

Chaque module déclare ses données personnelles par un contributeur, qui exporte les données
du joueur, réécrit ses propres événements et efface ses propres tables. La plateforme ne
connaît aucun module.

L'effacement réécrit, dans les événements du joueur, les seuls champs de nom, remplacés par
« Joueur effacé » ou « Village effacé ». Le type, la version, la position et les autres
données des événements sont inchangés. Cette réécriture passe par une fonction unique de la
plateforme, la seule du projet qui modifie un événement enregistré, et elle est consignée
dans le registre `platform.erasures`, qui indique la date et le nombre d'événements
réécrits, sans aucune donnée sur le joueur.

L'identité est effacée en dernier, et chaque étape est idempotente : un effacement
interrompu peut être relancé par le joueur lui-même.

L'identifiant du joueur reste dans le journal : une fois l'identité effacée, plus aucune
table ne le relie à une personne.

L'effacement est implémenté dans `src/platform/privacy/`, et chaque contributeur dans le
fichier `personal-data.ts` de son module.

## Conséquences

### Positives

- Le joueur exerce lui-même ses droits d'accès, de portabilité et d'effacement, sans
  intervention de quiconque.
- L'effacement n'altère ni les états reconstruits, ni l'historique des autres joueurs : une
  expédition commune reste rejouable, aux noms près.
- Les durées de conservation sont respectées même sans aucune activité, grâce à la tâche
  quotidienne.
- La Taverne est plus simple que si elle avait suivi le modèle des autres modules : ni
  événements, ni projection, ni reconstruction.
- Aucun historique des connexions n'est constitué : la présence ne conserve que ce que sa
  finalité exige.

### Négatives

- La règle de l'ajout seul du journal souffre désormais une exception, que toute
  modification future du journal devra respecter strictement : seuls les champs personnels,
  par la seule fonction prévue.
- Le coût d'un effacement et d'un export croît avec la taille du journal, puisque les
  événements du joueur sont recherchés dans tout le journal.
- Chaque nouvel événement crée une obligation : déclarer ses champs personnels dans le
  contributeur de son module, faute de quoi ils échapperont à l'effacement, sans aucune
  erreur.
- L'identifiant conservé dans le journal n'est qu'un pseudonyme : sa protection dépend de la
  destruction effective de tout lien avec la personne, dans toutes les tables.
- Le canal temps réel de la Taverne ne lit pas le journal : la plateforme du temps réel doit
  savoir lire une seconde sorte de source.

## Alternatives écartées

- **Event Sourcing pour la Taverne** : les messages sont destinés à disparaître, ce qui
  obligerait à lutter en permanence contre un journal conçu pour ne rien supprimer, alors que
  leur historique n'a aucune valeur et qu'aucun autre module ne le lit.
- **Suppression des flux du joueur** : impossible pour les flux partagés, dont la
  suppression détruirait l'historique des autres joueurs.
- **Effacement cryptographique** (une clé par joueur, détruite à l'effacement) : il imposerait
  le chiffrement et le déchiffrement dans chaque module et chaque projection, et ne
  s'applique pas aux événements déjà enregistrés en clair.
- **Références sans copie** (seul l'identifiant dans les événements, le nom retrouvé à
  l'affichage) : la meilleure conception pour l'avenir, mais elle ne règle pas le cas des
  événements déjà enregistrés.
- **Service externe de présence**, comme une base clé-valeur en mémoire : un service
  supplémentaire, contraire à l'offre gratuite, pour une donnée qu'une table suffit à tenir.

## Réexamen

Cette décision devra être réexaminée lors de la conception d'un nouveau module, pour lequel
les références sans copie devraient être préférées dès l'origine, si la taille du journal
rend l'effacement trop long pour une requête, ou si la doctrine sur l'anonymisation des
identifiants pseudonymes évolue.

## Usage de l'IA générative

Assistance de Claude (modèle Opus 5.5) pour mise en forme et formulation.
