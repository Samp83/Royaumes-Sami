# Revue de sécurité du Pillage : contrôle d'accès, secret des niveaux et intégrité de la saga

- Date : 2026-11-02
- Périmètre : API du module Pillage (`/api/raid`), saga avec le Village (sujets `realm.seize`,
  `realm.lose-level`, `realm.deposit` et `raid.transfer-result`), canaux temps réel, tâche
  quotidienne, contributeur de données personnelles.
- Références : OWASP Top 10 (A01 Broken Access Control, A04 Insecure Design, A08 Software and
  Data Integrity Failures) ; RGPD, articles 5, 15 et 17.

Les tests cités se trouvent dans `src/bootstrap/raid-api.test.ts` (API), sauf mention contraire.

| N° | Exigence | Vérification | Constat | Statut |
| --- | --- | --- | --- | --- |
| P1 | Toute route du Pillage refuse une requête anonyme | Test « refuse les requêtes anonymes (401) » ; `app.use('/raid/*', requireUser(auth))` dans `create-api.ts` | Les trois routes répondent 401 sans session | Conforme |
| P2 | Un joueur ne lance un pillage qu'en son propre nom | Test « lance toujours le pillage au nom du joueur connecté, quel que soit le corps de la requête » ; lecture de `api.ts` | Un champ `attackerId` ajouté au corps est retiré par la validation : l'attaquant est toujours `c.var.userId` | Conforme |
| P3 | Le corps d'un lancement est validé avant tout traitement | Test « rejette une entrée invalide (400) » ; schéma `LaunchRaidInput` (`contracts.ts`) | Un corps sans `defenderId` donne 400 `INVALID_INPUT`. Une cible inconnue donne 404, une cible absente ou soi-même 409 | Conforme |
| P4 | Le niveau d'un village n'est jamais communiqué à un autre joueur (règle 13) | Tests « présente les villages des autres joueurs, sans leur niveau (règle 13) » et « prend la moitié des ressources... » (réponse sans `level`) ; test du domaine « ne présente aucun niveau dans la vue d'un pillage » (`raid.test.ts`) | Les cibles, la réponse au lancement et l'historique ne contiennent aucun niveau | Conforme |
| P5 | La perte de niveau de l'attaquant n'est présentée qu'à lui | Test « ne présente la perte de niveau qu'à l'attaquant » | Le défenseur voit l'échec, avec `lostBuilding` à `null` ; l'attaquant voit le bâtiment perdu | Conforme |
| P6 | Les événements du Pillage, qui contiennent les niveaux comparés et la graine, ne sont diffusés à personne | Test « n'ouvre aucun canal temps réel sur les flux du Pillage (403) » | Aucune règle d'accès ne couvre le préfixe `raid-` : l'accès fermé par défaut de `channel-policy.ts` refuse le flux, y compris à son propriétaire | Conforme |
| P7 | Le canal global du Classement annonce les pillages réussis sans leurs données | Test « annonce les pillages réussis sur le canal du Classement, sans leurs données » | `RaidPlundered` est transmis avec `data: {}` : ni butin, ni identifiant de pillage | Conforme |
| P8 | Le joueur ne choisit ni ne prévoit l'issue d'une égalité | `git grep -n raidSeed -- src` ; lecture de `raid-service.ts` | La graine est tirée par `crypto.getRandomValues` sur le serveur. L'option `raidSeed`, qui la fixe, n'est passée que par `testing.ts` : `server.ts` ne la fournit pas | Conforme |
| P9 | Deux lancements simultanés ne contournent pas les règles 3 et 4 | Test « départage deux lancements simultanés d'un même joueur contre le même village (règles 3 et 4) » | Un lancement aboutit (201), l'autre est refusé (409) ; Bob n'est pillé qu'une fois | Conforme |
| P10 | Un pillage ne crée ni ne détruit de ressources | Test « prend la moitié des ressources d'un village moins développé, sans créer ni perdre de ressource » ; test du domaine « verse à l'attaquant exactement ce qui a été prélevé, et termine le pillage (règle 8) » | Le butin versé est exactement la quantité prélevée par le Village, calculée sur son propre état | Conforme |
| P11 | Un message remis plusieurs fois n'a d'effet qu'une fois | Test « n'a qu'un effet, et ne répond qu'une fois, lorsqu'un message est remis deux fois » (`realm/messages.test.ts`) ; test « ignore une réponse en double ou inattendue » (`raid.test.ts`) | Le Village retient l'identifiant `attaquant:pillage:étape` ; le Pillage n'avance que sur la réponse attendue par le pillage en cours | Conforme |
| P12 | Aucun joueur ne peut provoquer un mouvement de ressources hors de la saga | Lecture de `api.ts` : aucune route n'écrit dans la boîte d'envoi ; `/api/internal` n'est monté qu'avec le service Village extrait, derrière le secret partagé | Seul le service, à partir des événements décidés par le domaine, produit des messages | Conforme |
| P13 | La tâche quotidienne de purge n'est accessible qu'avec le secret | Test « refuse une requête sans le secret attendu, et reste fermée sans secret configuré (401) » (`cron-api.test.ts`) ; `git grep -n CRON_SECRET` | La purge est inscrite dans la tâche quotidienne (`raid: raid.dailyTask`). Le secret n'est pas versionné : `server.ts` le lit dans l'environnement, et les tests utilisent une constante qui leur est propre | Conforme |
| P14 | L'export contient les pillages du joueur, sans niveau ni identité de l'autre joueur | Test « exporte les pillages du joueur, et efface le nom de son village lors de la suppression du compte » ; test « exporte les pillages lancés et subis par le joueur, sans niveau ni autre joueur » (`event-store-raid-repository.test.ts`) | Les sections `launched` et `suffered` ne contiennent ni niveau, ni identifiant de l'adversaire | Conforme |
| P15 | Aucun nom n'est enregistré dans les événements du Pillage | Fonction d'aptitude « n'enregistre aucun nom de joueur ni de village dans les événements du Pillage » (`architecture.test.ts`) | Les trois sortes d'événements ne contiennent que des identifiants : l'effacement n'a rien à réécrire dans le journal | Conforme |
| P16 | Après l'effacement d'un compte, plus rien ne relie ses données du Pillage à une personne | Lecture de `personal-data.ts` ; ADR 0008 et 0010 | Le nom du village est remplacé dans `raid.villages`. L'identifiant reste dans le nom du flux, dans les événements et dans `raid.raids` : il n'est plus relié à aucun compte, mais reste un pseudonyme | Risque accepté |
| P17 | La réussite ou l'échec d'un pillage ne permet pas de reconstituer les niveaux d'un défenseur | Test « refuse de piller le même village plus d'une fois toutes les cinq minutes (règle 4) » ; règle 10 de la fiche de cadrage | L'issue révèle par nature une comparaison de niveaux. Elle est freinée par le délai de cinq minutes et par le coût d'un échec, sans être supprimée : c'est le principe du jeu | Risque accepté |
| P18 | Un défenseur ne peut pas être pillé sans limite | Lecture de `SAME_TARGET_DELAY_MS` (`content.ts`) ; README, « Limites actuelles » | Un joueur plus développé peut piller le même village toutes les cinq minutes, en prenant chaque fois la moitié de ce qui reste. Aucun bouclier ne protège un village récemment pillé | Risque accepté |
| P19 | Une saga interrompue ne bloque pas un attaquant indéfiniment | Lecture de `raid.ts` (DT-011) ; ADR 0011 | Un message abandonné laisse le pillage en cours : l'attaquant ne peut plus piller jusqu'à la relance du message par `scripts/dead-letters.ts`. Aucune ressource n'est perdue | Risque accepté |

## Synthèse

Sur 19 exigences, 15 sont conformes, aucune n'est non conforme, et 4 sont en risque accepté.

Cinq tests ont été ajoutés pour cette revue : P2, P5, P6, P7 et P9 ne reposaient jusque-là
que sur la lecture du code.

Les risques acceptés relèvent du principe du jeu (P17, P18) ou de choix déjà consignés : la
pseudonymisation du journal (P16, ADR 0008) et la dette DT-011 (P19).

Actions décidées :

1. DT-011 : borner la durée d'un pillage en cours, par une échéance enregistrée dans
   `RaidLaunched`, comme celles du Donjon (ADR 0004). Échéance : premier pillage bloqué en
   production.
2. P18 : si les joueurs s'en plaignent, ajouter une règle de protection du défenseur, par
   exemple un délai minimal entre deux pillages subis, tous attaquants confondus. Elle
   demanderait de lire l'historique du défenseur, donc un ADR.
3. P16 : réexaminer avec la doctrine sur l'anonymisation, comme prévu par l'ADR 0008.
