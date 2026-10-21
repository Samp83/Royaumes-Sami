# ADR-0007 - Sagas orchestrées et boîte d'envoi transactionnelle pour les opérations qui concernent plusieurs modules

- Statut : accepté
- Date : 2026-10-21

## Contexte

Le besoin : un échange du Marché modifie les données du Marché et celles de deux villages, et ne doit ni créer ni perdre de ressources.

Seul le Village décide de ce qui arrive à un village : vérifier un stock demande de
calculer la production accumulée selon le catalogue des bâtiments, et le Marché ne peut ni
connaître ces règles, ni écrire dans les flux d'un village (règle d'encapsulation des
modules, ADR 0001). L'extraction d'un module dans un service doté de sa propre base doit
par ailleurs rester possible (ADR 0001).

L'hébergement ne permet aucun processus permanent (ADR 0004). Une fonction peut être
interrompue à tout moment, au terme de sa durée maximale ou sur un conflit de version :
entre l'enregistrement d'un événement et l'envoi d'une demande à un autre module, une
panne laisserait le système incohérent.

## Décision

Une transaction ne modifie jamais les données que d'un seul module.

Une opération qui concerne plusieurs modules est une saga : une suite d'étapes, chacune
locale à un module. Ses étapes sont identifiées : la mise de côté des ressources du
vendeur est compensable, le prélèvement des ressources de l'acheteur est le pivot, et les
versements et restitutions sont repris jusqu'au succès. Une compensation est un mouvement
nouveau, comme une restitution, et non l'effacement d'un mouvement passé.

La saga est orchestrée par le module qui porte l'opération, ici le Marché. Les
participants ne connaissent pas la saga : le Village sait seulement prélever et verser des
ressources, et répond à l'adresse de retour indiquée dans chaque demande.

Les messages sont enregistrés dans la boîte d'envoi de la plateforme, la table
`platform.outbox`, dans la même transaction que les événements qui les déclenchent. Un
message peut être différé : l'expiration d'une offre, au bout de vingt-quatre heures, est
un message remis à l'échéance.

La distribution est garantie au moins une fois. Un message réservé reçoit un bail de
trente secondes, au terme duquel il redevient disponible si son traitement n'est pas
confirmé ; un échec est retenté avec un recul exponentiel, plafonné à une heure ; le
message est abandonné après dix tentatives.

Chaque gestionnaire est idempotent, grâce à une clé d'idempotence choisie par le
demandeur : le Village retient les identifiants des mouvements qu'il a déjà réalisés, et
ignore une demande dont l'identifiant lui est connu.

La distribution a lieu après chaque commande et chaque consultation du Marché, et chaque
jour par une tâche planifiée de Vercel, qui appelle `/api/outbox/dispatch` avec un secret
(`CRON_SECRET`).

La boîte d'envoi est implémentée dans `src/platform/outbox/`, la saga dans
`src/modules/market/domain/saga.ts`, et les mouvements de ressources dans le service du
Village.

## Conséquences

### Positives

- Aucun module n'écrit dans les données d'un autre : le Marché ignore les règles du
  Village, et la frontière entre modules reste intacte.
- Une panne à n'importe quel moment ne perd ni ne duplique aucune ressource : un message
  ne peut être perdu, et un message remis deux fois n'a d'effet qu'une fois.
- Le Village peut servir d'autres demandeurs, comme un impôt ou une récompense, sans
  modification.
- La boîte d'envoi sert aussi de minuterie : l'expiration d'une offre ne demande aucune
  tâche de fond.
- Le déroulement de la saga se lit en un seul endroit, l'orchestrateur.
- Aucune transaction ne s'étend sur deux modules : leur extraction reste possible sans
  réécrire l'échange.

### Négatives

- Des états intermédiaires sont visibles des joueurs, comme une offre en réservation ou en
  règlement, et l'interface doit savoir les présenter.
- La latence dépend de l'activité : une saga interrompue ne reprend qu'à la consultation
  suivante du Marché, ou le lendemain par la tâche planifiée.
- Chaque gestionnaire doit être idempotent, et ses doublons doivent être testés : un
  gestionnaire qui ne l'est pas produirait des effets en double sans aucune erreur.
- Les messages abandonnés après dix tentatives restent dans la table, sans qu'aucun outil
  ne permette encore de les examiner (dette DT-007).
- La table de la boîte d'envoi grandit sans limite, les messages traités étant conservés.

## Alternatives écartées

- **Transaction unique englobant les données des deux modules** : le Marché devrait
  connaître les événements et les règles du Village, les données de deux villages seraient
  verrouillées pendant l'échange, et l'extraction d'un module deviendrait impossible sans
  réécrire l'échange.
- **Transaction distribuée par validation en deux phases** : peu disponible dans les
  services hébergés, elle rend chaque base dépendante de la disponibilité des autres, et
  maintient des verrous pendant toute la coordination.
- **Appel direct du Village par le Marché, sans boîte d'envoi** : quel que soit l'ordre des
  deux écritures, une panne entre elles laisse une offre bloquée en réservation ou des
  ressources disparues.
- **Saga chorégraphiée** : le Village devrait réagir aux événements du Marché, et donc les
  connaître, et le déroulement de l'échange ne se reconstituerait qu'en lisant tous les
  participants.
- **Journal d'événements utilisé comme boîte d'envoi** : un message est une demande
  adressée à un destinataire, et non un fait, et sa distribution doit suivre, message par
  message, le nombre de tentatives et la dernière erreur, ce qu'un point de reprise ne
  permet pas.

## Réexamen

Cette décision devra être réexaminée si un module est extrait dans un service distinct, ce
qui demanderait une boîte d'envoi par base et un transport entre services, si le volume de
messages justifie un courtier de messages dédié, ou si la latence de la distribution
déclenchée par les requêtes ne satisfait plus les besoins.

## Usage de l'IA générative

Assistance de Claude (modèle Opus 5.5) pour mise en forme et formulation.
