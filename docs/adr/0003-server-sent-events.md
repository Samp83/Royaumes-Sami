# ADR-0003 - Server-Sent Events, alimentés par le journal d'événements, pour le temps réel

- Statut : accepté
- Date : 2026-10-20

## Contexte

Les joueurs doivent être informés des changements sans recharger leur page : entre les
onglets ou les appareils d'un même joueur pour le Village, et entre les participants
d'une même partie pour le Donjon. Le protocole HTTP ne permet pas au serveur d'envoyer de
lui-même une information au navigateur.

Les actions des joueurs passent déjà par l'API, au moyen de requêtes HTTP ordinaires,
authentifiées par un cookie de session. Seules les notifications ont besoin d'un canal
du serveur vers le navigateur.

L'hébergement impose ses contraintes : la durée d'exécution d'une fonction Vercel est
plafonnée, à 300 secondes dans la configuration du projet ; plusieurs instances de
l'application traitent les requêtes sans partager de mémoire ; l'offre gratuite exclut
toute infrastructure supplémentaire, comme un serveur permanent ou un service de
messagerie.

Le projet dispose d'un journal d'événements dont chaque flux porte des versions
croissantes et uniques (ADR 0002).

## Décision

Les changements sont diffusés par des Server-Sent Events, sur la route
`/api/stream/<canal>`.

Un canal correspond exactement à un flux du journal. L'identifiant de chaque message est
la version de l'événement : après une interruption, le navigateur renvoie le dernier
identifiant reçu dans l'en-tête `Last-Event-ID`, et le flux reprend à la version suivante.

Le flux ne conserve aucun état en mémoire : il relit le journal toutes les demi-secondes
et transmet les événements apparus depuis la lecture précédente. Il se ferme de lui-même
au bout de 240 secondes, et le navigateur s'y reconnecte. Une route de repli,
`/api/stream/<canal>/events`, renvoie en une seule réponse les événements postérieurs à
une version donnée.

L'accès est réservé aux joueurs connectés, et chaque module déclare la règle d'accès à
ses canaux. Un canal qu'aucune règle ne couvre est refusé.

L'interface relit sa vue auprès de l'API à chaque notification, plutôt que d'appliquer
elle-même le contenu des événements.

Le temps réel est implémenté dans `src/platform/realtime/`, et la règle d'accès du canal
du Village dans `src/modules/realm/index.ts`.

## Conséquences

### Positives

- Les Server-Sent Events sont du HTTP ordinaire : ils traversent les serveurs mandataires
  et les pare-feu sans configuration, et le cookie de session est joint au flux comme à
  toute autre requête.
- Le navigateur se reconnecte de lui-même ; grâce aux versions du journal, aucun
  événement n'est perdu ni reçu deux fois après une interruption.
- N'importe quelle instance peut servir n'importe quel joueur : la fermeture volontaire
  et la reconnexion sont sans effet pour le joueur, et compatibles avec la durée
  d'exécution plafonnée.
- Aucune infrastructure supplémentaire : la base PostgreSQL suffit.
- La vue affichée est toujours celle que calcule le serveur, et un canal peut ne
  transmettre qu'un signal lorsque le contenu des événements ne doit pas être connu de
  tous les abonnés.
- Un nouveau module diffuse ses changements en déclarant seulement la règle d'accès à
  ses canaux.

### Négatives

- Chaque flux ouvert produit deux lectures du journal par seconde, que des événements
  apparaissent ou non : le nombre de lectures croît avec le nombre de joueurs connectés
  et d'onglets ouverts.
- Un événement est reçu jusqu'à une demi-seconde après son enregistrement, et jusqu'à
  environ une seconde et demie s'il survient pendant une reconnexion.
- Chaque flux maintient une fonction Vercel en exécution pendant toute sa durée, ce qui
  consomme le quota de l'offre gratuite.
- La communication est unidirectionnelle : une action du joueur reste une requête HTTP
  distincte.
- Chaque notification provoque une relecture complète de la vue, donc une reconstruction
  de l'état à partir de ses événements.

## Alternatives écartées

- **WebSocket** : la communication est bidirectionnelle, mais une fonction Vercel n'est
  pas conçue pour maintenir des connexions permanentes, et leur prise en charge y était
  expérimentale. Toute connexion serait de toute façon interrompue au terme de la durée
  d'exécution, et un serveur de WebSocket exigerait un hébergement permanent
  supplémentaire.
- **Interrogation périodique par le navigateur** : simple, mais elle impose un compromis
  défavorable : un intervalle court multiplie les requêtes HTTP, un intervalle long
  retarde l'information. Elle reste disponible en repli.
- **Mécanisme de notification partagé entre instances** (LISTEN/NOTIFY de PostgreSQL,
  service de messagerie comme Redis) : il supprimerait la relecture périodique, mais
  exige une connexion permanente à la base ou un service supplémentaire, incompatibles
  avec l'hébergement sans serveur et l'offre gratuite.

## Réexamen

Cette décision devra être réexaminée si le nombre de joueurs connectés simultanément
rend les lectures du journal pesantes pour la base, si un besoin de communication du
navigateur vers le serveur à très faible délai apparaît, ou si l'hébergeur prend en
charge les WebSocket de manière stable.

## Usage de l'IA générative

Assistance de Claude (modèle Opus 5.5) pour mise en forme et formulation.
