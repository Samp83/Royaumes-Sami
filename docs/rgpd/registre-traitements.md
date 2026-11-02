# Registre des traitements de données personnelles

Ce registre, prévu par l'article 30 du RGPD, recense les traitements de données personnelles
réalisés par Royaumes. Il est tenu à jour à chaque évolution du jeu qui ajoute, modifie ou
supprime une donnée personnelle, dans le même commit que cette évolution.

- Responsable du traitement : Sami Paris, sami.paris@supdevinci-edu.fr.
- Date de dernière mise à jour : 2026-11-02 (ajout du traitement T8, Pillage).

## Sous-traitants

| Sous-traitant | Rôle | Localisation des données | Garanties à vérifier |
| --- | --- | --- | --- |
| Vercel | Hébergement de l'application, journaux techniques | Région de Francfort (fra1) pour les fonctions | Accord de traitement des données (DPA), transferts hors de l'Union européenne |
| Neon | Hébergement de la base de données | Région de Francfort | Accord de traitement des données (DPA), transferts hors de l'Union européenne |

## Traitements

| N° | Traitement | Finalité | Données | Personnes concernées | Base légale | Durée de conservation | Emplacement |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T1 | Comptes des joueurs | Permettre l'accès au jeu | Nom, adresse électronique, empreinte du mot de passe, date d'inscription | Joueurs | Exécution du contrat (conditions d'utilisation du jeu) | Jusqu'à la suppression du compte | `identity.user`, `identity.account` |
| T2 | Sessions | Maintenir la connexion ; limiter les tentatives de connexion | Adresse IP, navigateur, dates de la session | Joueurs | Exécution du contrat ; intérêt légitime (sécurité) | Jusqu'à l'expiration de la session, ou la suppression du compte | `identity.session` |
| T3 | Activité de jeu | Faire fonctionner le Village, le Donjon, le Marché et le Classement (le Pillage fait l'objet du traitement T8) | Identifiant, nom du joueur, nom du village, actions de jeu | Joueurs | Exécution du contrat | Jusqu'à la suppression du compte ; ensuite, identifiant pseudonymisé et noms remplacés (ADR 0008) | `platform.events`, `platform.outbox`, `ranking`, `dungeon`, `market` |
| T4 | Messagerie de la Taverne | Permettre aux joueurs de discuter | Contenu des messages, auteur, date | Joueurs | Exécution du contrat | Trente jours, ou jusqu'à la suppression du compte | `tavern.messages` |
| T5 | Présence dans la Taverne | Indiquer les joueurs présents | Identifiant, nom, date du dernier signal | Joueurs | Exécution du contrat | Deux minutes après le dernier signal | `tavern.presence` |
| T6 | Registre des effacements | Démontrer la réalisation des effacements | Date de l'effacement, nombre d'événements réécrits ; aucune donnée sur le joueur | Aucune personne identifiable | Obligation légale (responsabilité, article 5) | Illimitée | `platform.erasures` |
| T7 | Journaux techniques | Diagnostiquer les erreurs, assurer la sécurité | Adresse IP, adresses des requêtes, messages d'erreur | Joueurs, visiteurs | Intérêt légitime (sécurité, maintenance) | Durée fixée par l'hébergeur : à vérifier | Vercel |
| T8 | Pillages | Permettre à un joueur d'attaquer le village d'un autre, lui présenter les pillages lancés et subis, et compter ses pillages réussis du jour dans le Classement | Identifiants de l'attaquant et du défenseur, issue, butin, bâtiment perdu, niveaux comparés, date ; nom du village de chaque joueur (copie) ; nombre de pillages réussis par jour | Joueurs | Exécution du contrat | Historique présenté : trente jours. Événements du journal : jusqu'à la suppression du compte, puis identifiant pseudonymisé (ADR 0008, 0010). Nom du village : remplacé à la suppression du compte. Pillages réussis par jour : sans limite (dette DT-012) | `platform.events` (flux `raid-<joueur>`), `platform.outbox`, `raid.raids`, `raid.villages`, `ranking.raids_by_day` |

### Mesures de sécurité du traitement T8

- Les événements du Pillage ne contiennent aucun nom, seulement des identifiants : vérifié par
  une fonction d'aptitude (`src/bootstrap/architecture.test.ts`).
- Les niveaux comparés, enregistrés pour expliquer un résultat, ne sont présentés à aucun
  autre joueur, et les flux du Pillage ne sont diffusés par aucun canal temps réel.
- L'historique d'un joueur ne présente pas l'identifiant de l'adversaire, seulement le nom de
  son village, et la perte de niveau n'est présentée qu'à l'attaquant.
- La durée de trente jours est appliquée à chaque lecture de l'historique, et chaque jour par
  la tâche planifiée `/api/cron/daily`, protégée par un secret.
- Le détail des vérifications figure dans la
  [revue de sécurité du Pillage](../qualite/revue-securite-pillage.md).

## Droits des personnes

| Droit | Mise en œuvre |
| --- | --- |
| Accès et portabilité (articles 15 et 20) | Page « Mes données » : export JSON de toutes les données du joueur |
| Effacement (article 17) | Page « Mes données » : suppression du compte, effective dans tous les modules |
| Rectification (article 16) | Non mis en œuvre : le nom d'un joueur ne peut pas encore être modifié |