# Rendu de l'évaluation

- Auteur : Sami Paris
- Module : `raid` (le Pillage)
- Adresse du déploiement : https://royaumes-sami.vercel.app
- Fiche de cadrage : [fiche-cadrage.md](fiche-cadrage.md)

Un joueur attaque le village d'un autre joueur. Selon les niveaux combinés des deux villages,
il prend la moitié des ressources du défenseur, ou l'un de ses bâtiments perd un niveau.

## Exigences minimales

| N° | Fichiers principaux | Tests qui la vérifient |
| --- | --- | --- |
| E1 | `src/modules/raid/` : `domain/` (`raid.ts`, `saga.ts`, `view.ts`, `content.ts`, `random.ts`), `application/` (`raid-service.ts` et ses trois ports), `infrastructure/` (dépôt, projections, lecteurs, `schema.ts`), `api.ts`, `messages.ts`, `personal-data.ts`, entrées publiques `index.ts`, `contracts.ts`, `ui.tsx` | `pnpm lint:archi` : 0 violation ; `architecture.test.ts` |
| E2 | `src/bootstrap/create-api.ts` (`createRaidModule`, route `/raid`, gestionnaires, contributeur, tâche quotidienne) ; page `app/(jeu)/raid/page.tsx` ; entrée « Pillage » de `src/ui/app-shell.tsx` | Tous les tests de `raid-api.test.ts`, qui passent par l'application assemblée |
| E3 | `domain/raid.ts` : `decide`, `evolve`, `replay`, fonctions pures qui portent les règles 1 à 11 ; `domain/view.ts` : règle 13 | `raid.test.ts` : un test par règle, voir le tableau ci-dessous ; règle `pure-domain` de dependency-cruiser |
| E4 | Journal d'événements, modèle decider, un flux `raid-<joueur>` par attaquant (`infrastructure/event-store-raid-repository.ts`). Modèles de lecture dans le schéma `raid` (`infrastructure/schema.ts`), créé par `drizzle/0013_pillage.sql`. Justification : [ADR 0010](../adr/0010-pillage-stockage.md) | `event-store-raid-repository.test.ts` : « reconstruit l'état d'un attaquant à partir de son flux, avec sa version », « enregistre les messages de la saga avec les événements, dans une même transaction » ; `raid-api.test.ts` : « départage deux lancements simultanés d'un même joueur contre le même village (règles 3 et 4) » ; `architecture.test.ts` : « range chaque table dans le schéma d'une brique de la plateforme ou d'un module » |
| E5 | `create-api.ts` : `app.use('/raid/*', requireUser(auth))` ; `api.ts` : l'attaquant est toujours `c.var.userId` ; `contracts.ts` : schéma `LaunchRaidInput`. Revue : [revue-securite-pillage.md](../qualite/revue-securite-pillage.md) | `raid-api.test.ts` : « refuse les requêtes anonymes (401) », « rejette une entrée invalide (400) », « lance toujours le pillage au nom du joueur connecté, quel que soit le corps de la requête » |
| E6 | Messages de la boîte d'envoi vers le Village : sujets `realm.seize` et `realm.lose-level` ajoutés à `realm/contracts.ts` et traités par `realm/messages.ts`, sujet existant `realm.deposit`, réponses au sujet `raid.transfer-result` (`raid/messages.ts`). Lecture du langage publié du Village (`infrastructure/villages-projection.ts`). Justification : [ADR 0011](../adr/0011-pillage-communication.md) | `realm/messages.test.ts`, bloc « Village - gestionnaires des messages du Pillage » ; `realm/domain/transfers.test.ts`, bloc « Village - prélèvement d'une part et perte de niveau » ; `raid.test.ts` : « ignore une réponse en double ou inattendue » ; `raid-api.test.ts` : « prend la moitié des ressources d'un village moins développé, sans créer ni perdre de ressource » |
| E7 | `src/modules/raid/personal-data.ts` : export des pillages lancés et subis, effacement du nom de village. Aucun nom dans les événements, donc rien à réécrire (ADR 0010). Traitement T8 du [registre](../rgpd/registre-traitements.md) | `raid-api.test.ts` : « exporte les pillages du joueur, et efface le nom de son village lors de la suppression du compte » ; `event-store-raid-repository.test.ts` : « exporte les pillages lancés et subis par le joueur, sans niveau ni autre joueur » ; `architecture.test.ts` : « déclare les données personnelles de chaque module qui conserve des données » |
| E8 | 13 règles et 3 routes : voir les deux tableaux ci-dessous | `raid.test.ts` (19 tests), `raid-api.test.ts` (17 tests), `event-store-raid-repository.test.ts` (3 tests), plus les tests du Village et du Classement cités |
| E9 | `.dependency-cruiser.cjs`, `biome.json` et `vitest.config.ts` inchangés depuis `td11-fin` (`git diff --stat td11-fin -- .dependency-cruiser.cjs`) | `pnpm lint:archi` : 0 violation sur 165 modules ; les 3 fonctions d'aptitude de `architecture.test.ts` réussissent |
| E10 | Déploiement Vercel, base Neon ; migrations `0013_pillage.sql` et `0014_pillages_du_jour.sql` appliquées par `pnpm vercel-build` | `GET /api/raid/targets` sur le déploiement répond 401 sans session : la route existe. Parcours sur le déploiement : voir la section « Vérifications sur le déploiement » |

### Les règles de la fiche et leurs tests

| Règle | Test |
| --- | --- |
| 1. Il faut avoir fondé un village | `raid.test.ts` : « refuse un pillage à un joueur qui n'a pas fondé de village (règle 1) » |
| 2. Pas soi-même, ni un joueur sans village | `raid.test.ts` : « refuse de piller son propre village, ou un joueur sans village (règle 2) » |
| 3. Un seul pillage en cours | `raid.test.ts` : « refuse un second pillage tant que le premier est en cours (règle 3) », « permet un nouveau pillage une fois le précédent terminé (règle 3) » |
| 4. Même village : une fois toutes les cinq minutes | `raid.test.ts` et `raid-api.test.ts` : « refuse de piller le même village plus d'une fois toutes les cinq minutes (règle 4) » |
| 5. Niveau supérieur : succès | `raid.test.ts` : « réussit lorsque le niveau combiné de l'attaquant est supérieur (règle 5) » |
| 6. Niveau inférieur : échec | `raid.test.ts` : « échoue lorsque le niveau combiné de l'attaquant est inférieur (règle 6) » |
| 7. Égalité : tirage à graine | `raid.test.ts` : « tranche une égalité par le générateur à graine, et enregistre la graine (règle 7) » ; `raid-api.test.ts` : « tranche une égalité par le tirage du pillage (règle 7) » |
| 8. Moitié du stock, ni créée ni perdue | `raid.test.ts` : « demande au Village la moitié du stock du défenseur », « verse à l'attaquant exactement ce qui a été prélevé, et termine le pillage (règle 8) » ; `transfers.test.ts` : « prélève la moitié de chaque ressource, production comprise, arrondie à l'entier inférieur » |
| 9. Défenseur sans ressource | `raid.test.ts` : « termine un pillage réussi sans butin lorsque le défenseur n'a rien (règle 9) » |
| 10. Perte d'un niveau, jamais sous le départ | `raid.test.ts` : « le tire au sort parmi les bâtiments au-dessus de leur niveau de départ », « n'en désigne aucun lorsque tous sont à leur niveau de départ, ni en cas de succès », « demande au Village de réduire le niveau du bâtiment tiré, puis termine l'échec », « termine un échec sans perte lorsque le Village refuse la perte de niveau » ; `transfers.test.ts` : « refuse de ramener un bâtiment sous son niveau de départ, et retient ce refus » |
| 11. Le défenseur ne perd aucun niveau, l'attaquant aucune ressource | `raid.test.ts` : « ne vise jamais les niveaux du défenseur ni les ressources de l'attaquant (règle 11) » ; `raid-api.test.ts` : « fait perdre un niveau à l'attaquant d'un village plus développé, et rien au défenseur » |
| 12. Pillages réussis du jour au Classement | `raid-api.test.ts` : « présente au Classement les pillages réussis du jour (règle 12) » ; `ranking-projection.test.ts` : « compte les pillages réussis du jour, à l'heure de Paris, sans changer l'ordre » |
| 13. Aucun niveau communiqué à un autre joueur | `raid.test.ts` : « ne présente aucun niveau dans la vue d'un pillage » ; `raid-api.test.ts` : « présente les villages des autres joueurs, sans leur niveau (règle 13) », « n'ouvre aucun canal temps réel sur les flux du Pillage (403) » |

### Les routes et leurs tests

| Route | Tests de `raid-api.test.ts` |
| --- | --- |
| `GET /api/raid/targets` | « présente les villages des autres joueurs, sans leur niveau (règle 13) » ; « refuse les requêtes anonymes (401) » |
| `GET /api/raid/raids` | « présente le pillage dans l'historique de l'attaquant et dans celui du défenseur » ; « ne présente la perte de niveau qu'à l'attaquant » ; « ne présente plus un pillage de plus de 30 jours, et le supprime de l'historique chaque jour » ; « refuse les requêtes anonymes (401) » |
| `POST /api/raid/raids` | « prend la moitié des ressources... » ; « fait perdre un niveau à l'attaquant... » ; « refuse un pillage sans village, contre soi-même ou contre un joueur sans village » ; « rejette une entrée invalide (400) » ; « lance toujours le pillage au nom du joueur connecté... » ; « refuse les requêtes anonymes (401) » |

## Bonus revendiqués

| N° | Description | Fichiers | Tests | Documentation |
| --- | --- | --- | --- | --- |
| B2 | Tâche quotidienne propre au module : elle supprime de l'historique les pillages de plus de trente jours. Le même seuil est appliqué à chaque lecture | `application/raid-service.ts` (`purge`, `list`) ; `infrastructure/drizzle-raids-reader.ts` (`removeOlderThan`) ; `index.ts` (`dailyTask`) ; `create-api.ts` (`raid: raid.dailyTask`) | `raid-api.test.ts` : « ne présente plus un pillage de plus de 30 jours, et le supprime de l'historique chaque jour » | [ADR 0010](../adr/0010-pillage-stockage.md), section « Conservation de l'historique » ; [architecture.md](../architecture.md), section « Déploiement » ; README, « Données personnelles » |
| B4 | Deux modèles de lecture tenus par des projections, chacune avec son point de reprise dans `platform.projections` et sa version : `raid-villages` (nom et niveaux des villages, à partir du langage publié du Village) et `raid-history` (historique des pillages lancés et subis) | `infrastructure/villages-projection.ts`, `raids-projection.ts`, `drizzle-villages-reader.ts`, `drizzle-raids-reader.ts`, `schema.ts` ; `drizzle/0013_pillage.sql` | `raid-api.test.ts` : « présente les villages des autres joueurs, sans leur niveau (règle 13) », « présente le pillage dans l'historique de l'attaquant et dans celui du défenseur », « exporte les pillages du joueur, et efface le nom de son village... » (nom relu dans la projection des villages) | [ADR 0011](../adr/0011-pillage-communication.md), section « Village vers Pillage » ; [ADR 0010](../adr/0010-pillage-stockage.md) ; README, « Base de données » |
| B6 | Communication avec deux modules existants. Le Village, dans les deux sens : saga par la boîte d'envoi, lecture de ses événements. Le Classement : sa projection lit `RaidPlundered` (version 3) et compte les pillages réussis du jour dans `ranking.raids_by_day` | `realm/contracts.ts`, `realm/messages.ts`, `realm/domain/village.ts` ; `raid/messages.ts` ; `ranking/infrastructure/ranking-projection.ts`, `schema.ts`, `drizzle-ranking-reader.ts` ; `drizzle/0014_pillages_du_jour.sql` | `realm/messages.test.ts` (bloc Pillage) ; `raid-api.test.ts` : « présente au Classement les pillages réussis du jour (règle 12) », « annonce les pillages réussis sur le canal du Classement, sans leurs données » ; `ranking-projection.test.ts` : « compte les pillages réussis du jour, à l'heure de Paris, sans changer l'ordre » | [ADR 0011](../adr/0011-pillage-communication.md), sections « Pillage vers Classement » et « Deux modules partenaires » ; [architecture.md](../architecture.md), diagramme de séquence |
| B8 | Fonction d'aptitude : les événements du Pillage ne contiennent aucun nom de joueur ni de village. Elle produit les trois sortes d'événements, puis échoue si l'un d'eux contient un nom ou une clé destinée à un nom | `src/bootstrap/architecture.test.ts` | `architecture.test.ts` : « n'enregistre aucun nom de joueur ni de village dans les événements du Pillage » | [ADR 0010](../adr/0010-pillage-stockage.md), section « Fonction d'aptitude » ; [architecture.md](../architecture.md) ; README, « Données personnelles » |

Total revendiqué : 4 points. Les autres bonus ne sont pas revendiqués. En particulier, B5 ne
l'est pas : lancer un pillage est gratuit, et aucune étape de sa saga n'est compensable
(ADR 0011).

## Écarts avec la fiche de cadrage

Aucun. Une précision sur la règle 12 : un pillage réussi est compté le jour où le butin est
pris (événement `RaidPlundered`), qui est dans le cas ordinaire l'instant même du lancement.

## Indicateurs au rendu

| Indicateur | À l'étiquette `td11-fin` | Au rendu |
| --- | --- | --- |
| Nombre de tests | 232, dans 33 fichiers | 280, dans 36 fichiers |
| Couverture des lignes | 75,0 % | 76,3 % |
| Violations des règles d'architecture | 0 | 0 |

Mesures du 2026-11-02 sur les deux étiquettes, par `pnpm test:coverage` et `pnpm lint:archi`.
Aucun test existant n'a été supprimé ni affaibli : une seule assertion existante a changé, dans
`realm/messages.test.ts`, et elle est devenue plus précise (la réponse à un prélèvement contient
désormais les quantités prélevées). Le détail figure dans le
[bilan technique](../bilan-technique.md).

## Vérifications avant le rendu

- [x] `pnpm verify` réussit.
- [x] `pnpm build` compile l'application et vérifie ses types.
- [x] `git ls-files .data` n'affiche rien ; aucun secret n'est versionné.
- [x] Chaque commentaire `DETTE TECHNIQUE` du Pillage correspond à une entrée du registre
  (DT-011 à DT-013).

## Vérifications sur le déploiement

- [x] Le Pillage fonctionne à deux joueurs : un pillage réussi, un pillage repoussé, le refus
  d'un second pillage du même village avant cinq minutes.
- [x] Les modules existants fonctionnent : fondation d'un village, expédition, échange au
  Marché, message dans la Taverne.
- [x] Un compte de test ayant utilisé le Pillage télécharge ses données, qui contiennent la
  section `raid`, puis est supprimé.
- [x] La colonne « Pillages du jour » du Classement compte le pillage réussi.

## Usage de l'IA générative

Assistance de Claude (modèle Opus 5.5) pour génération de blocs Typescript et la rédaction de documenttion et ce rendu.md. Vérification : relecture complète du code et de la documentation, exécution des tests automatisés (pnpm verify) et tests manuels des fonctionnalités dans le jeu aussi bien en local que sur l'environnement de production.
