# Scénario de soutenance

Le déroulé suit les critères de validation du sujet. Prévoir environ 20 minutes de démonstration.

## Avant la soutenance

- [ ] **Twingate connecté** sur le PC de démo, et accès vérifié **depuis la salle** : http://10.1.20.73/ doit répondre.
- [ ] **Vidéo de secours** de la démo complète enregistrée : le sujet accepte une démo préenregistrée.
- [ ] Dernier pipeline de `main` vert, production et staging à la même version (pied de page de l'application).
- [ ] Une **branche de fonctionnalité** prête à être proposée en PR (étape 4).
- [ ] Quelques tâches déjà créées dans l'application.
- [ ] Fenêtres ouvertes :

  | Fenêtre | Contenu |
  |---|---|
  | Navigateur | http://10.1.20.73/ (prod), http://10.1.20.73:30300/ (Grafana, dashboard *TaskFlow - Golden signals*, rafraîchissement 10 s), GitHub Actions |
  | Terminal **admin** | `ssh admin@10.1.20.72`, puis `cd ~/taskflow/infra/ansible && git pull` : c'est là qu'on lance Ansible |
  | Terminal **cluster** | `ssh admin@10.1.20.73` : `kubectl` et `helm` disponibles sur le nœud de contrôle |
  | PowerShell local | dossier `taskflow` du dépôt, pour la sonde `.\scripts\check-availability.ps1` |

> Sur k8s-1, `kubectl` fonctionne directement. Pour `helm`, préfixer : `KUBECONFIG=/etc/rancher/k3s/k3s.yaml helm …`

## Chiffres à citer

Tous ont été mesurés le 23/11/2026 :

| Mesure | Résultat |
|---|---|
| Reconstruction complète depuis 3 VM Debian 13 vierges (`site.yml`) | ~10 min, `failed=0` |
| Rolling update en **production réelle** déclenché par la CI, sondé toutes les 0,3 s | 285 puis 349 requêtes, **0 erreur** |
| Déploiement d'une image inexistante | rollback automatique, **0 erreur** côté utilisateurs |
| Auto-scaling sous charge | 2 → 6 pods backend en ~45 s |
| Tests automatisés backend | 16/16 |

## 1. Fonctionnement de l'application (2 min)

- Ouvrir http://10.1.20.73/, créer une tâche, la cocher, la supprimer.
- Montrer le pied de page : version du frontend et du backend (SHA du commit), et nom du pod qui a répondu. En rafraîchissant, la réponse vient d'un autre pod : c'est la répartition de charge.

## 2. Reconstruire l'infrastructure depuis l'IaC (3 min)

- Montrer l'arborescence `infra/ansible` et l'enchaînement de `site.yml` : bootstrap, socle (avec les garde-fous VM et RAM), Docker, k3s, monitoring, application.
- Dans le terminal **admin**, relancer :
  ```bash
  ansible-playbook playbooks/site.yml -e @secrets.yml
  ```
  Le récapitulatif affiche `failed=0` et presque uniquement des `ok` : c'est l'idempotence.
- Montrer la vidéo d'une reconstruction complète depuis des VM vierges, ou détruire puis recréer le worker en direct :
  ```bash
  ssh 10.1.20.74 sudo /usr/local/bin/k3s-agent-uninstall.sh       # le worker quitte le cluster
  ansible-playbook playbooks/site.yml -e @secrets.yml --limit k8s-1,k8s-2
  ```
  Pendant ce temps, la production reste servie par les pods de k8s-1.

## 3. Pipeline CI/CD (3 min)

Ouvrir le dernier run de `main` sur GitHub Actions et montrer :
- `lint` (ESLint, npm audit, hadolint, helm lint, compose, Ansible) et `tests` en parallèle ;
- `build` : 3 images taguées avec le SHA, smoke test de la stack complète, publication sur GHCR (images **privées**) ;
- `Déploiement staging`, exécuté par le **runner self-hosted sur Proxmox**. Montrer ses étapes :
  - « Refuser un déploiement obsolète », qui affiche `OK` ;
  - « Clé SSH chargée », qui affiche l'empreinte ;
  - Ansible ;
- `Déploiement production` : en attente d'**approbation**, puis Ansible et Helm.

## 4. Intégration d'une fonctionnalité et mise à jour en production (5 min)

Exemple de fonctionnalité : la **priorité d'une tâche**.

1. Backend, migration rétrocompatible dans `db.js` :
   ```js
   { id: 2, description: 'priorité des tâches',
     sql: "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'normale'" }
   ```
   Puis ajouter `priority` à `TASK_COLUMNS`, accepter `priority` dans `POST /api/tasks` et ajouter un test.
2. Frontend : ajouter un `<select>` à côté du champ de saisie et un badge dans la liste.
3. Ouvrir une PR : la CI teste sans rien déployer. Montrer que le merge est **bloqué** tant qu'un autre membre n'a pas approuvé et que les 3 checks ne sont pas verts (règle `protection-main`). Un collègue approuve en direct, puis on merge : déploiement en staging, puis approbation de la production.
4. **Avant d'approuver la production**, lancer la sonde dans le PowerShell local :
   ```powershell
   .\scripts\check-availability.ps1 -Url http://10.1.20.73
   ```
   La version bascule de N à N+1. Pendant une dizaine de secondes, les deux versions répondent en alternance, puis seule la nouvelle reste. **0 erreur**. `Ctrl+C` affiche le bilan.

Expliquer pourquoi la migration est rétrocompatible : pendant le rolling update, l'ancienne version ignore la nouvelle colonne, qui a une valeur par défaut.

## 5. Zero-downtime : les filets de sécurité (3 min)

- **Version cassée.** Avec la sonde lancée, dans le terminal **admin** :
  ```bash
  ansible-playbook playbooks/deploy-prod.yml -e @secrets.yml -e image_tag=inexistant -e helm_wait_timeout=90s
  ```
  Les nouveaux pods restent en `ImagePullBackOff`, mais les anciens ne sont jamais retirés (`maxUnavailable: 0`). Au bout de 90 s, `helm --atomic` revient automatiquement à la version précédente, et le playbook se termine en rouge, comme attendu. La sonde reste verte. Dans le terminal **cluster** :
  ```bash
  KUBECONFIG=/etc/rancher/k3s/k3s.yaml helm history taskflow -n taskflow
  ```
- **Version obsolète.** Relancer un ancien run dans GitHub Actions. L'étape « Refuser un déploiement obsolète » le bloque, alors qu'avant ce garde-fou, la production aurait été ramenée en arrière (vécu, voir le README).
- **Bonus infrastructure.** Avec la sonde lancée, dans le terminal **cluster** :
  ```bash
  kubectl drain k8s-2 --ignore-daemonsets --delete-emptydir-data
  kubectl uncordon k8s-2
  ```
  Le PodDisruptionBudget et la répartition sur les 2 nœuds évitent la coupure.

## 6. Auto-scaling (2 min)

Dans le terminal **cluster** :

```bash
kubectl -n taskflow apply -f https://raw.githubusercontent.com/ESGI-M1-DEVOPS/taskflow/main/deploy/k8s/load-generator.yaml
kubectl -n taskflow get hpa -w        # 2 → 6 pods backend en ~45 s (Ctrl+C pour sortir)
kubectl -n taskflow delete deploy load-generator
```

Dans Grafana, observer en même temps la latence, le panneau *Replicas (HPA)* et le CPU des conteneurs (cAdvisor). La redescente à 2 pods prend environ 1 minute après l'arrêt de la charge.

## 7. Supervision et logs (3 min)

- **Dashboard golden signals** : trafic, taux d'erreurs, latence p95/p99, saturation (CPU, mémoire, event loop, replicas).
- **Erreurs.** Dans le PowerShell local :
  ```powershell
  1..20 | ForEach-Object { try { Invoke-WebRequest http://10.1.20.73/api/debug/error -UseBasicParsing } catch {} }
  ```
  Le panneau *Erreurs 5xx* monte.
- **Corrélation.** Dans le terminal **cluster** :
  ```bash
  kubectl -n taskflow delete pod taskflow-db-0
  ```
  - le panneau *Base de données* passe à DOWN ;
  - les pods backend deviennent non prêts ;
  - les logs `level=warn` « base de données injoignable » apparaissent ;
  - tout revient automatiquement.
- **Loki** (Grafana > Explore > Loki) :
  - `{namespace="taskflow", level="error"}` : logs d'erreur de toute l'application ;
  - `{component="frontend"} | json | status >= 400` : requêtes en erreur vues par nginx ;
  - `{component="backend"} |= "injoignable"` : la panne de BDD provoquée juste avant.
- **Alertes** : http://10.1.20.73:30090/alerts, avec les règles par défaut (crash loop, nœud indisponible…).

## 8. Portabilité entre plateformes SysOps (2 min)

- Déployer TaskFlow sur le cluster d'une autre équipe avec la commande `helm upgrade --install` du [contrat d'intégration](CONTRAT-INTEGRATION.md#c-fiche-taskflow), en lui donnant le jeton de lecture des images. Nos images sont privées, mais la plateforme n'a rien de spécial à configurer : c'est la chart qui crée le secret `docker-registry`.
- Déployer l'application d'une autre équipe sur notre cluster, dans son propre namespace, avec un hôte dédié.
- Montrer que son `ServiceMonitor` et ses logs apparaissent dans notre Grafana sans configuration supplémentaire.
