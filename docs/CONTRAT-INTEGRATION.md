# Contrat d'intégration DevOps ↔ SysOps

Le sujet exige que **tout conteneur de n'importe quelle équipe DevOps puisse être déployé sur n'importe quelle plateforme SysOps**. Ce document propose les règles communes à valider entre toutes les équipes. Notre équipe tient les deux rôles : la partie A décrit ce que notre plateforme garantit, la partie B ce que nous attendons des applications, et nos propres images respectent la partie B.

> Proposition de l'équipe TaskFlow, version 1 du 23/11/2026. À amender ensemble.

## A. Ce que fournit la plateforme (SysOps)

| # | Garantie | Notre implémentation |
|---|---|---|
| A1 | Cluster Kubernetes ≥ 1.30, au moins 2 nœuds, architecture `linux/amd64` | k3s, 2 VM Proxmox |
| A2 | Un namespace par équipe et un kubeconfig fourni à l'équipe | `kubectl create namespace <equipe>` |
| A3 | Ingress HTTP sur le port 80, classe par défaut (pas besoin de `ingressClassName`) | Traefik (inclus dans k3s) |
| A4 | Routage par nom d'hôte quand plusieurs applications cohabitent | `<appli>.<IP>.nip.io` |
| A5 | StorageClass par défaut pour les volumes persistants (ReadWriteOnce) | `local-path` |
| A6 | metrics-server disponible : les HPA sur CPU et mémoire fonctionnent | inclus dans k3s |
| A7 | Prometheus Operator : tout `ServiceMonitor`, quel que soit son namespace, est collecté | kube-prometheus-stack |
| A8 | Grafana : toute ConfigMap portant le label `grafana_dashboard: "1"` est importée comme dashboard | sidecar Grafana, tous namespaces |
| A9 | Les logs stdout/stderr de tous les pods sont centralisés et interrogeables par namespace, pod, conteneur et niveau | Loki + Alloy |
| A10 | Accès en lecture à Grafana pour chaque équipe | NodePort 30300 |
| A11 | Images privées acceptées : secret `docker-registry` dans le namespace de l'équipe, référencé par `imagePullSecrets` | standard Kubernetes |

## B. Ce que doit respecter un conteneur applicatif (DevOps)

| # | Règle | Pourquoi |
|---|---|---|
| B1 | Image accessible depuis la plateforme, `linux/amd64` : registry publique, **ou** registry privée avec un identifiant **en lecture seule** fourni à l'équipe qui déploie | La plateforme n'a pas à connaître les comptes des autres équipes ; un jeton en lecture seule limite le risque |
| B2 | Tag **immuable** (SHA du commit ou version SemVer) ; `latest` interdit en production | Rollback et traçabilité |
| B3 | Toute la configuration passe par des **variables d'environnement** (adresses, identifiants, niveau de log) | Aucune adresse propre à une plateforme dans l'image |
| B4 | Aucun secret dans l'image ; les secrets sont injectés au déploiement (Secret Kubernetes) | Sécurité, portabilité |
| B5 | Exécution **non-root** avec **UID numérique** (`USER 1000`, pas `USER node`) | Sinon Kubernetes ne peut pas vérifier `runAsNonRoot` (vécu sur ce projet) |
| B6 | Écoute sur un port > 1024, documenté | Compatible non-root |
| B7 | Sondes HTTP : **liveness** (le process vit) et **readiness** (prêt à servir, dépendances OK) | Rolling update sans coupure |
| B8 | Arrêt **gracieux** sur SIGTERM en moins de 30 s (fin des requêtes en cours) | Zero-downtime |
| B9 | Conteneurs applicatifs **sans état** : l'état est dans une base de données ou un volume déclaré | Scaling horizontal |
| B10 | Logs sur **stdout**, en JSON de préférence, avec un champ `level` (`info`, `warn`, `error`) | Centralisation et filtrage par gravité |
| B11 | Métriques Prometheus sur `/metrics` (recommandé), au minimum compteur et histogramme des requêtes HTTP | Golden signals |
| B12 | Requêtes et limites CPU/mémoire déclarées | Nécessaire au HPA et au partage du cluster |
| B13 | Livraison sous forme de **chart Helm** (de préférence) ou de manifests, où image, tag, hôte et secrets sont paramétrables | Déploiement en une commande sur toute plateforme |

## C. Fiche TaskFlow

Images **privées** : `ghcr.io/esgi-m1-devops/taskflow-{frontend,backend}:<sha>` et `ghcr.io/esgi-m1-devops/taskflow-db:<version>`. Nous fournissons à l'équipe qui déploie un jeton GitHub en lecture seule (`read:packages`), à passer à la chart. Elle crée elle-même le secret `docker-registry`.

| Image | Port | Variables d'environnement | Santé | Métriques |
|---|---|---|---|---|
| taskflow-frontend | 8080 | `BACKEND_URL` (ex. `http://taskflow-backend:3000`), `APP_VERSION` | `GET /healthz` | (logs JSON nginx) |
| taskflow-backend | 3000 | `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD` (ou `DATABASE_URL`), `LOG_LEVEL`, `DEBUG_ENDPOINTS`, `SHUTDOWN_DELAY_MS` | liveness `GET /health`, readiness `GET /ready` | `GET /metrics` |
| taskflow-db | 5432 | `POSTGRES_PASSWORD` (obligatoire), `POSTGRES_DB`, `POSTGRES_USER` | `pg_isready` | (postgres-exporter possible) |

Déploiement sur n'importe quelle plateforme conforme à la partie A :

```bash
helm upgrade --install taskflow deploy/helm/taskflow \
  -n taskflow --create-namespace \
  --set image.owner=esgi-m1-devops --set image.tag=<sha> \
  --set registryAuth.username=<login GitHub> --set registryAuth.password=<jeton lecture> \
  --set db.password=<secret> \
  --set ingress.host=taskflow.<IP>.nip.io
```

La chart s'adapte à la plateforme : le `ServiceMonitor` n'est créé que si le CRD Prometheus Operator existe, et la classe d'Ingress et la StorageClass sont celles par défaut, sauf si on les précise.
