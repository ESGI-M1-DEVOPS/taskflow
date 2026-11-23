# Scénario de soutenance

Le déroulé suit les critères de validation du sujet. Prévoir environ 20 minutes de démonstration.

## Avant la soutenance

- [ ] Accès distant au Proxmox vérifié depuis la salle (VPN ou Tailscale) **et** une vidéo de secours enregistrée : le sujet accepte une démo préenregistrée.
- [ ] Pipeline vert sur `main`, production en version N.
- [ ] Une branche de fonctionnalité prête à merger (voir étape 4).
- [ ] Onglets ouverts :
  - application de production ;
  - Grafana (dashboard *TaskFlow - Golden signals*, rafraîchissement 10 s) ;
  - GitHub Actions ;
  - un terminal avec `KUBECONFIG=infra/ansible/kubeconfig-prod.yaml`.
- [ ] Quelques tâches déjà créées dans l'application.

## 1. Fonctionnement de l'application (2 min)

- Ouvrir http://10.1.20.73/, créer une tâche, la cocher, la supprimer.
- Montrer le pied de page : version du frontend et du backend, et nom du pod qui a répondu. En rafraîchissant, la réponse vient d'un autre pod (répartition de charge).

## 2. Reconstruire l'infrastructure depuis l'IaC (3 min)

- Montrer l'arborescence `infra/ansible` et l'enchaînement de `site.yml`.
- Relancer `ansible-playbook playbooks/site.yml -e @secrets.yml` : le résultat `changed=0` (ou presque) prouve l'idempotence.
- Montrer la vidéo d'une reconstruction complète depuis des VM vierges (à enregistrer), ou détruire puis recréer le worker en direct :
  ```bash
  # sur k8s-2 :
  sudo /usr/local/bin/k3s-agent-uninstall.sh
  # depuis le poste d'administration :
  ansible-playbook playbooks/site.yml -e @secrets.yml --limit k8s-2,k8s-1
  ```

## 3. Pipeline CI/CD (3 min)

Ouvrir un run sur GitHub Actions et montrer :
- les jobs `lint` et `tests` en parallèle ;
- le `build` : 3 images taguées avec le SHA, le smoke test, le push sur GHCR ;
- le staging déployé automatiquement ;
- la production en attente d'approbation.

## 4. Intégration d'une fonctionnalité et mise à jour en production (5 min)

Exemple de fonctionnalité : la **priorité d'une tâche**.

1. Backend, migration rétrocompatible dans `db.js` :
   ```js
   { id: 2, description: 'priorité des tâches',
     sql: "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'normale'" }
   ```
   Puis ajouter `priority` à `TASK_COLUMNS`, accepter `priority` dans `POST /api/tasks` et ajouter un test.
2. Frontend : ajouter un `<select>` à côté du champ de saisie et un badge dans la liste.
3. Ouvrir une PR : la CI teste sans rien déployer. Merger : déploiement en staging, puis approbation de la production.
4. **Pendant le déploiement**, lancer `.\scripts\check-availability.ps1 -Url http://10.1.20.73`. La version bascule de N à N+1, avec **0 erreur**.

Expliquer pourquoi la migration est rétrocompatible : pendant le rolling update, l'ancienne version ignore la nouvelle colonne, qui a une valeur par défaut.

## 5. Zero-downtime : le filet de sécurité (2 min)

- Déployer volontairement une version cassée :
  ```bash
  ansible-playbook playbooks/deploy-prod.yml -e @secrets.yml -e image_tag=inexistant
  ```
- Le script de disponibilité reste vert : les anciens pods ne sont jamais retirés (`maxUnavailable: 0`), et `helm --atomic` revient automatiquement à la version précédente. Montrer `helm history taskflow -n taskflow`.
- Bonus infrastructure : `kubectl drain k8s-2 --ignore-daemonsets --delete-emptydir-data` pendant le script de disponibilité. Le PodDisruptionBudget et la répartition sur les 2 nœuds évitent la coupure. Terminer par `kubectl uncordon k8s-2`.

## 6. Auto-scaling (2 min)

```bash
kubectl -n taskflow apply -f deploy/k8s/load-generator.yaml
kubectl -n taskflow get hpa -w        # 2 → 6 pods backend en ~45 s
kubectl -n taskflow delete -f deploy/k8s/load-generator.yaml
```

Dans Grafana, observer en même temps la latence, le panneau *Replicas (HPA)* et le CPU des conteneurs (cAdvisor).

## 7. Supervision et logs (3 min)

- **Dashboard golden signals** : trafic, taux d'erreurs, latence p95/p99, saturation (CPU, mémoire, event loop, replicas).
- **Erreurs** : appeler plusieurs fois `curl http://10.1.20.73/api/debug/error`. Le panneau *Erreurs 5xx* monte.
- **Corrélation** : `kubectl -n taskflow delete pod taskflow-db-0`.
  - Le panneau *Base de données* passe à DOWN ;
  - les pods backend deviennent non prêts ;
  - les logs `level=warn` « base de données injoignable » apparaissent ;
  - tout revient automatiquement.
- **Loki** (Grafana > Explore) :
  - `{namespace="taskflow", level="error"}`
  - `{component="frontend"} | json | status >= 400`
- **Alertes** : Prometheus > Alerts, règles par défaut (crash loop, nœud indisponible).

## 8. Portabilité entre plateformes SysOps (2 min)

- Déployer TaskFlow sur le cluster d'une autre équipe avec la commande `helm upgrade --install` du [contrat d'intégration](CONTRAT-INTEGRATION.md#c-fiche-taskflow).
- Déployer l'application d'une autre équipe sur notre cluster, dans son propre namespace, avec un hôte dédié.
- Montrer que son `ServiceMonitor` et ses logs apparaissent dans notre Grafana sans configuration supplémentaire.
