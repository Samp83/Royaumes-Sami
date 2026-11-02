# Bilan technique de Royaumes

- Date : 2026-11-02
- Version examinée : étiquette `eval-fin`, comparée à l'étiquette `td11-fin`
- Auteur : Sami Paris

Ce bilan dresse l'état technique du projet au terme de son développement, à partir de ses
décisions d'architecture, de ses indicateurs de qualité, de sa dette technique et de ses
revues. Il s'adresse à la personne qui reprendrait le projet.

## 1. Le système livré

| Élément | `td11-fin` | `eval-fin` |
| --- | --- | --- |
| Modules métier | 6 | 7 (ajout du Pillage, `raid`) |
| Briques de la plateforme | 9 : `auth`, `cron`, `db`, `event-store`, `http`, `outbox`, `privacy`, `projection`, `realtime` | 9, inchangées |
| Lignes de code, hors tests (`src`, `app`, `scripts`) | 8 353 | 9 857 |
| Fichiers de test, nombre de tests | 33 fichiers, 232 tests | 36 fichiers, 280 tests |
| Commits | 76 | 89 à la fin du développement du module, puis les commits du rendu |
| Hébergement | Vercel (Francfort), base Neon (Francfort) | Inchangé |

| Module | Stockage | Lignes, hors tests |
| --- | --- | --- |
| `realm` | Event Sourcing | 1 209 (1 093 à `td11-fin`) |
| `dungeon` | Event Sourcing, projection des expéditions ouvertes | 2 064 |
| `market` | Event Sourcing, projection des offres, saga | 1 271 |
| `ranking` | Projection du journal | 537 (459 à `td11-fin`) |
| `tavern` | Tables ordinaires | 678 |
| `raid` | Event Sourcing, deux projections, saga | 1 276 |
| `system` | Aucun | 73 |

Le Pillage a demandé de modifier deux modules existants, par leurs entrées prévues : le
Village (deux sujets de messages et deux événements, +116 lignes) et le Classement (une table
et une version de projection, +78 lignes). Aucun autre module n'a été modifié.

## 2. Les décisions d'architecture

| ADR | Décision | Mise à l'épreuve | Bilan |
| --- | --- | --- | --- |
| 0001 | Monolithe modulaire | Extraction du Village (TD11) ; ajout du Pillage | Tenue. Le Pillage s'est ajouté sans aucune importation interne d'un autre module, et sans modifier une règle de dependency-cruiser |
| 0002 | Event Sourcing pour le Village | Pertes de niveau ajoutées par le Pillage | Tenue. Deux événements ajoutés, aucun événement existant modifié ; le coût de relecture d'un village reste faible |
| 0003 | Server-Sent Events alimentés par le journal | Canaux du Donjon, du Classement, du Marché, de la Taverne | Tenue, avec la limite annoncée : deux lectures du journal par seconde et par flux ouvert |
| 0004 | Manches simultanées et échéances paresseuses | Expéditions à quatre joueurs | Tenue. Une expédition abandonnée n'enregistre jamais sa fin, comme prévu |
| 0005 | Intelligence artificielle déterministe | Simulation de centaines d'expéditions | Tenue. L'équilibre à quatre joueurs reste facile, même au niveau difficile |
| 0006 | CQRS et projections rattrapées à la lecture | Trois projections ajoutées ou modifiées par le Pillage | Tenue. Le Classement est passé en version 3 et s'est reconstruit sans intervention |
| 0007 | Saga orchestrée et boîte d'envoi | Réutilisée telle quelle par le Pillage | Tenue. Une seconde saga a été ajoutée sans modifier la plateforme |
| 0008 | Taverne sans Event Sourcing, réécriture ciblée du journal | Pillage conçu avec des références sans copie | Tenue. La recommandation de l'ADR a été suivie : aucun nom dans les événements du Pillage |
| 0009 | Extraction du Village, préparée mais non déployée | Deux nouveaux sujets transmis au service | Tenue. Le module distant transmet les deux nouveaux sujets au service, par deux lignes de `remote.ts` |
| 0010 | Journal d'événements pour le Pillage, un flux par attaquant, sans nom | Lancements simultanés, effacement d'un compte | Tenue. Les règles 3 et 4 tiennent par la seule concurrence optimiste du flux |
| 0011 | Saga du Pillage avec le Village, langage publié lu par le Pillage et le Classement | Exception à l'ADR 0006 (issue décidée sur une projection) | À surveiller. L'exception est limitée et documentée, mais une amélioration simultanée au lancement peut être ignorée |

## 3. La qualité

| Caractéristique | Indicateur | `td11-fin` | `eval-fin` | Appréciation |
| --- | --- | --- | --- | --- |
| Adéquation fonctionnelle | Tests réussis | 232 sur 232 | 280 sur 280 | Bonne. Chacune des 13 règles de la fiche de cadrage est citée par au moins un test |
| Adéquation fonctionnelle | Couverture des lignes des domaines | 100 % (Village, Marché, Taverne), 99,6 % (Donjon) | Inchangée ; Pillage : 100 % | Bonne |
| Maintenabilité | Couverture des lignes, tout le code | 75,0 % (1 176 sur 1 568) | 76,3 % (1 400 sur 1 834) | En légère hausse. Les interfaces React (`ui.tsx`, `src/ui`) ne sont pas couvertes |
| Maintenabilité | Couverture des branches | 64,2 % | 65,6 % | En légère hausse |
| Maintenabilité | Règles d'architecture (dependency-cruiser) | 8 règles, 0 violation (143 modules) | 8 règles, 0 violation (165 modules) | Bonne. Aucune règle modifiée |
| Maintenabilité | Fonctions d'aptitude | 2 | 3 | Ajout : aucun nom dans les événements du Pillage |
| Efficacité des performances | p99 des lectures, budget de 500 ms | De 181 à 310 ms (5 scénarios, `perf/apres.json`) | Non mesuré à nouveau : les lectures existantes sont inchangées, et le test de charge ne couvre pas le Pillage | Budget respecté au TD11. Les lectures du Pillage ne sont pas mesurées : elles rattrapent jusqu'à deux projections, et devraient être ajoutées au test de charge |
| Fiabilité | Tests de concurrence, de reprise et d'idempotence | Journal, boîte d'envoi, Marché, service extrait | Plus : lancements simultanés, réponses en double du Village | Bonne |
| Fiabilité | Messages abandonnés | Signalés par la tâche quotidienne, relancés par `scripts/dead-letters.ts` | Inchangé | Un pillage dont un message est abandonné bloque son attaquant (DT-011) |
| Sécurité | Exigences des revues de sécurité | Voir la section 5 | Revue du Pillage : 19 exigences, 15 conformes, 4 en risque accepté | Les revues des TD4, TD6 et TD9 ne sont pas terminées |
| Flexibilité | Extraction d'un module ; changement de base | Village extrait en local ; PGlite et Neon | Inchangé ; le Pillage fonctionne avec le Village dans le processus ou extrait | Bonne |

Mesures réalisées le 2026-11-02 par `pnpm test:coverage` et `pnpm lint:archi`, sur chacune des
deux étiquettes. Les tests sont comptés par Vitest.

## 4. La dette technique

| Indicateur | Valeur |
| --- | --- |
| Entrées consignées | 13 (DT-001 à DT-013) |
| Entrées remboursées, dont à l'échéance prévue | 7, toutes à l'échéance prévue |
| Entrées ouvertes | 6 : trois du service Village extrait (DT-008 à DT-010), trois du Pillage (DT-011 à DT-013) |

Analyse : toute la dette des TD a été remboursée à l'échéance prévue. La dette ouverte est de
deux natures. Celle du service Village (DT-008 à DT-010) ne pèse que si le service est
déployé, ce que rien ne justifie aujourd'hui (ADR 0009). Celle du Pillage est réelle en
production : DT-011 peut bloquer un attaquant, DT-012 conserve sans limite une donnée
personnelle, et DT-013 cache des cibles au-delà de cent villages. Chaque entrée est signalée
dans le code par un commentaire `DETTE TECHNIQUE`.

## 5. Les revues

| Revue | Exigences | Conformes | Non conformes ou en risque accepté | Actions ouvertes |
| --- | --- | --- | --- | --- |
| Sécurité de l'authentification | 16 | 3 constatées (S6, S12, S16) | 13 non constatées | Consigner les constats de S1 à S5, S7 à S11, S13 à S15 |
| Sécurité du Donjon | 14 | Non constatées | 14 non constatées | Consigner les constats |
| Sécurité du Marché | 10 | Non constatées | 10 non constatées | Consigner les constats |
| Conformité au RGPD | 10 | Non constatées | 10 non constatées | Consigner les constats ; mettre DT-012 en conformité |
| Sécurité du Pillage | 19 | 15 | 4 en risque accepté (P16 à P19) | DT-011 ; protection du défenseur (P18) |

Les revues des TD4, TD6, TD9 et TD10 définissent leurs exigences et leurs vérifications, mais
la plupart de leurs constats n'ont pas été consignés. Les tests qu'elles citent existent et
réussissent : c'est la trace de la revue qui manque, et non la vérification.

## 6. Risques et recommandations

| N° | Risque | Signe avant-coureur | Recommandation |
| --- | --- | --- | --- |
| 1 | La charge de la base croît avec le nombre de flux temps réel ouverts (ADR 0003) | Latence des lectures en hausse aux heures de pointe, alors que le journal grossit peu | Mesurer avec le test de charge en ajoutant des flux ouverts ; envisager LISTEN/NOTIFY si l'hébergement le permet |
| 2 | La reconstruction d'une projection et l'effacement d'un compte parcourent tout le journal, pendant une requête | Durée d'une reconstruction approchant la limite de 300 s d'une fonction Vercel | Reconstruire par lots hors requête, et indexer les événements par joueur avant d'atteindre ce seuil |
| 3 | Un pillage bloqué par un message abandonné empêche son attaquant de jouer (DT-011) | Avertissement « message(s) abandonné(s) » dans les journaux de la tâche quotidienne | Borner la durée d'un pillage en cours par une échéance paresseuse, comme au Donjon |
| 4 | Les pillages réussis par jour sont conservés sans limite (DT-012) | Croissance de `ranking.raids_by_day` | Supprimer les jours passés dans la tâche quotidienne, ou ne garder que le jour en cours |
| 5 | Les constats des revues antérieures ne sont pas consignés | Une régression de sécurité passerait sans trace de revue | Compléter les quatre revues, puis les tenir à jour à chaque évolution du module concerné |

## 7. Conclusion

L'architecture a tenu l'épreuve d'un module ajouté après coup. Le Pillage communique avec deux
modules existants, par une saga et par la lecture de leur langage publié, sans aucune
importation interne et sans modification des règles de dépendance. La plateforme n'a pas
changé : journal, boîte d'envoi et projections ont suffi. Les indicateurs progressent
légèrement : 48 tests de plus, une couverture en hausse, aucune violation.

Les points faibles sont connus et consignés : une dette réelle du Pillage en production
(DT-011, DT-012), et des revues de sécurité antérieures restées sans constats. La priorité
d'un repreneur serait de traiter DT-011, puis de compléter ces revues.

## Usage de l'IA générative

Claude (modèle Opus 5.5) a assisté la rédaction de ce bilan, à partir des mesures
réalisées sur les deux étiquettes (`pnpm test:coverage`, `pnpm lint:archi`, comptage des lignes
par `git`). Vérification : chaque valeur a été relevée sur les commandes exécutées, et chaque
affirmation rapprochée de l'ADR, du registre ou du test cité.
