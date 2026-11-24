# Scénario de soutenance : fiche d'exécution

Toutes les commandes sont à copier-coller telles quelles. Chaque bloc indique **dans quel terminal** le lancer. Prévoir environ 25 minutes de démonstration.

## Ordre conseillé

Le pipeline met environ 8 à 10 minutes entre la PR et la production. On **lance donc la démo 4 en premier** (création de la PR), puis on enchaîne les démos 1, 2 et 3 pendant que la CI tourne, avant de revenir finir la démo 4.

| Ordre | Démo | Critère de la grille | Durée |
| --- | --- | --- | --- |
| 1 | [4. Fonctionnalité](#démo-4--intégrer-une-fonctionnalité-et-la-livrer-en-production), étapes 1 à 3 (créer la PR) | Contraintes de production, CI/CD | 3 min |
| 2 | [1. Application](#démo-1--lapplication-fonctionne) | Architecture | 2 min |
| 3 | [2. Reconstruire l'infra](#démo-2--reconstruire-linfrastructure-depuis-le-code) | Ansible (6 pts) | 4 min |
| 4 | [3. Pipeline](#démo-3--le-pipeline-cicd) | CI/CD | 2 min |
| 5 | [4. Fonctionnalité](#démo-4--intégrer-une-fonctionnalité-et-la-livrer-en-production), étapes 4 à 7 (merge, prod) | Contraintes de production | 4 min |
| 6 | [5. Filets de sécurité](#démo-5--les-filets-de-sécurité) | Contraintes de production | 4 min |
| 7 | [6. Auto-scaling](#démo-6--lauto-scaling) | Kubernetes, contraintes de production | 3 min |
| 8 | [7. Supervision](#démo-7--supervision-et-logs) | Observabilité | 3 min |
| 9 | [8. Portabilité](#démo-8--portabilité-entre-plateformes-sysops) | Inter-équipes | 2 min |

## Chiffres à citer

Mesurés en conditions réelles les 23 et 24/11/2026 :

| Mesure | Résultat |
| --- | --- |
| Reconstruction complète depuis 3 VM Debian 13 vierges (`site.yml`) | ~10 min, `failed=0` |
| Rolling update en **production réelle** déclenché par la CI, sondé toutes les 0,3 s | 285, 349 puis 778 requêtes, **0 erreur** |
| Déploiement d'une image inexistante | Retour automatique à la version précédente, **0 erreur** côté utilisateurs |
| Auto-scaling sous charge | 2 → 6 pods backend en ~45 s |
| Tests automatisés du backend | 16/16 |

---

## Préparation (30 minutes avant)

### Les 3 terminaux et le navigateur

| Nom | Où | À ouvrir |
| --- | --- | --- |
| **LOCAL** | PowerShell sur le PC de démo | `cd` dans le dossier `taskflow` du dépôt |
| **ADMIN** | SSH sur staging-1 | Lance Ansible |
| **CLUSTER** | SSH sur k8s-1 | Lance `kubectl` et `helm` |
| **Navigateur** | 4 onglets | Prod, Grafana, Prometheus, GitHub Actions |

**Terminal ADMIN :**

```bash
ssh admin@10.1.20.72
cd ~/taskflow && git pull && cd infra/ansible
```

**Terminal CLUSTER :**

```bash
ssh admin@10.1.20.73
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
```

**Navigateur :**
- http://10.1.20.73/ (application de production)
- http://10.1.20.73:30300/ (Grafana : *Dashboards > TaskFlow - Golden signals*, période « Last 15 minutes », rafraîchissement 10 s)
- http://10.1.20.73:30090/alerts (Prometheus)
- https://github.com/ESGI-M1-DEVOPS/taskflow/actions

### Vérifications

1. **Twingate connecté**, et les 3 VM joignables. Terminal **LOCAL** :

   ```powershell
   foreach ($ip in '10.1.20.72','10.1.20.73','10.1.20.74') { "{0} : {1}" -f $ip, (Test-NetConnection $ip -Port 22 -WarningAction SilentlyContinue).TcpTestSucceeded }
   ```

   Attendu : `True` pour les 3.

2. **Production et staging à la même version.** Terminal **LOCAL** :

   ```powershell
   foreach ($u in 'http://10.1.20.73','http://10.1.20.72:8080') { $v = Invoke-RestMethod "$u/api/version"; "$u -> $($v.version) ($($v.hostname))" }
   ```

   Attendu : le même SHA des deux côtés, égal au dernier commit de `main`.

3. **Cluster en bonne santé.** Terminal **CLUSTER** :

   ```bash
   kubectl get nodes
   kubectl -n taskflow get pods -o wide
   kubectl -n taskflow get hpa
   ```

   Attendu : 2 nœuds `Ready`, tous les pods `Running`, et des pourcentages de CPU affichés (pas `<unknown>`).

4. **Ansible joint les 3 VM.** Terminal **ADMIN** :

   ```bash
   ansible all -m ping
   ```

   Attendu : 3 × `SUCCESS`.

5. **Dernier pipeline de `main` vert** dans l'onglet GitHub Actions.

6. **Quelques tâches dans l'application.** Terminal **LOCAL** :

   ```powershell
   'Préparer la soutenance','Relire le contrat d''intégration','Vérifier Grafana' | ForEach-Object { Invoke-RestMethod http://10.1.20.73/api/tasks -Method Post -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes((@{ title = $_ } | ConvertTo-Json))) } | Out-Null
   ```

7. **Un collègue prêt à approuver la PR** de la démo 4, depuis son propre compte GitHub : l'auteur ne peut pas approuver sa propre PR.

---

## Démo 1 : l'application fonctionne

**Critère :** conception et architecture.

1. Dans l'onglet de l'application (http://10.1.20.73/) : créer une tâche, la cocher, la supprimer.
2. Montrer le pied de page : version du frontend et du backend (SHA du commit), et nom du pod qui a répondu.
3. Montrer la répartition de charge entre les pods. Terminal **LOCAL** :

   ```powershell
   1..8 | ForEach-Object { (Invoke-RestMethod http://10.1.20.73/api/version).hostname }
   ```

   **Attendu :** deux noms de pods backend différents, qui alternent.

**À dire :** la requête passe par l'Ingress, le frontend nginx puis le backend Node.js, qui lit PostgreSQL. Les deux pods backend tournent sur deux machines différentes.

---

## Démo 2 : reconstruire l'infrastructure depuis le code

**Critère :** automatisation et reproductibilité avec Ansible (6 pts).

### 2.1 Relancer tout le playbook (idempotence)

Montrer d'abord `infra/ansible/playbooks/site.yml` dans VS Code, avec l'enchaînement bootstrap, socle, Docker, k3s, monitoring, application. Puis, terminal **ADMIN** :

```bash
ansible-playbook playbooks/site.yml -e @secrets.yml
```

**Attendu :**
- la ligne `Version qui va être déployée` affiche `image_tag=<SHA> (conservée : version déjà déployée)` : la relance ne change pas la version servie ;
- le récapitulatif final affiche `failed=0` sur les 3 VM, avec très peu de `changed`.

**À dire :** le même fichier a construit la plateforme depuis des VM vierges en une dizaine de minutes. Relancé, il ne change que ce qui diffère de l'état voulu.

### 2.2 Optionnel : recréer le nœud k8s-2 en direct

Cette étape modifie le cluster : ne la faire que si la répétition s'est bien passée. Sinon, montrer la vidéo de secours.

1. Retirer le nœud. Terminal **ADMIN** :

   ```bash
   ssh 10.1.20.74 sudo /usr/local/bin/k3s-agent-uninstall.sh
   ```

2. Le supprimer du cluster. Sans cette étape, k3s refuse son retour, car il garde l'ancien mot de passe du nœud. Terminal **CLUSTER** :

   ```bash
   kubectl delete node k8s-2
   kubectl get nodes
   ```

   **Attendu :** k8s-1 seul. Les pods de k8s-2 sont relancés sur k8s-1, et l'application répond toujours.

3. Le reconstruire avec Ansible. Terminal **ADMIN** :

   ```bash
   ansible-playbook playbooks/site.yml -e @secrets.yml --limit k8s-1,k8s-2
   ```

4. Vérifier. Terminal **CLUSTER** :

   ```bash
   kubectl get nodes
   ```

   **Attendu :** k8s-1 et k8s-2 `Ready`.

---

## Démo 3 : le pipeline CI/CD

**Critère :** CI/CD (transverse).

Dans l'onglet GitHub Actions, ouvrir le dernier run de `main` et montrer :

1. `Lint & analyse statique` et `Tests automatisés`, exécutés en parallèle sur les serveurs de GitHub.
2. `Build, smoke test & publication des images` : 3 images taguées avec le SHA, test de la stack complète, publication sur GHCR (images privées).
3. `Déploiement staging`, exécuté par le **runner self-hosted** sur staging-1. Ouvrir le job et montrer ses étapes :
   - « Refuser un déploiement obsolète » affiche `OK : <SHA> est bien le dernier commit de main` ;
   - « Préparer la clé SSH » affiche `Clé SSH chargée : 256 SHA256:KgnU1Uci…` ;
   - « Ansible - mise à jour du staging ».
4. `Déploiement production`, avec la mention de l'approbation donnée, puis Ansible et Helm.

---

## Démo 4 : intégrer une fonctionnalité et la livrer en production

**Critère :** contraintes de production (mise à jour sans coupure) et CI/CD.

La fonctionnalité : un **compteur de tâches restantes** sous le titre de l'application.

### Étapes 1 à 3 : à lancer en tout début de démo

1. Créer la branche. Terminal **LOCAL** :

   ```powershell
   git switch main
   git pull
   git switch -c feature/compteur-taches
   ```

2. Modifier deux fichiers dans VS Code.

   `app/frontend/public/index.html`, ajouter la ligne `remaining` sous le sous-titre :

   ```html
         <p class="subtitle">Les tâches de l'équipe, déployées en continu.</p>
         <p id="remaining" class="subtitle"></p>
   ```

   `app/frontend/public/app.js`, dans la fonction `render`, ajouter la ligne `remaining` juste après `empty.hidden` :

   ```js
     empty.hidden = tasks.length > 0;
     document.getElementById('remaining').textContent = `${tasks.filter((t) => !t.done).length} tâche(s) restante(s)`;
   ```

3. Commiter et pousser. Terminal **LOCAL** :

   ```powershell
   git add app/frontend/public/index.html app/frontend/public/app.js
   git commit -m "Frontend : compteur de tâches restantes"
   git push -u origin feature/compteur-taches
   ```

   Ouvrir le lien affiché par `git push` (`.../pull/new/feature/compteur-taches`), puis **Create pull request**.

   **À montrer :** le bouton de merge est bloqué. Il manque l'approbation d'un autre membre, et les 3 vérifications de la CI tournent.

Pendant que la CI tourne (2 à 3 min), passer aux démos 1, 2 et 3.

### Étapes 4 à 7 : revenir quand la CI de la PR est verte

4. Le collègue approuve la PR depuis son compte : *Files changed > Review changes > Approve > Submit review*.
5. Cliquer sur **Merge pull request**, puis **Confirm merge**. Dans GitHub Actions, le pipeline de `main` démarre : lint, tests, build, puis staging (4 à 5 min).
6. **Avant d'approuver la production**, lancer la sonde de disponibilité. Terminal **LOCAL** :

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\scripts\check-availability.ps1 -Url http://10.1.20.73
   ```

   Elle affiche une ligne par requête, avec la version et le pod qui a répondu.
7. Dans le run, cliquer sur **Review deployments**, cocher `production`, puis **Approve and deploy**.

**Attendu :**
- la sonde voit la version passer de l'ancien SHA au nouveau. Pendant une dizaine de secondes, les deux alternent, puis seul le nouveau reste ;
- `Ctrl+C` affiche le bilan : **0 erreur** ;
- en rafraîchissant l'application, le compteur « N tâche(s) restante(s) » apparaît, et le pied de page affiche le nouveau SHA.

**À dire :** Kubernetes ajoute un pod de la nouvelle version, attend qu'il soit prêt, puis retire un ancien pod, qui termine ses requêtes en cours. À aucun moment il n'y a moins de pods prêts.

---

## Démo 5 : les filets de sécurité

**Critère :** contraintes de production.

### 5.1 Une version cassée ne casse pas la production

1. Lancer la sonde. Terminal **LOCAL** :

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\scripts\check-availability.ps1 -Url http://10.1.20.73
   ```

2. Déployer une image qui n'existe pas. Terminal **ADMIN** :

   ```bash
   ansible-playbook playbooks/deploy-prod.yml -e @secrets.yml -e image_tag=inexistant -e helm_wait_timeout=90s
   ```

3. Pendant l'attente, montrer les pods. Terminal **CLUSTER** :

   ```bash
   kubectl -n taskflow get pods
   ```

   **Attendu :** un nouveau pod en `ImagePullBackOff`, tandis que les anciens pods restent `Running`.

4. Au bout de 90 s, le playbook se termine **en rouge** : c'est voulu, Helm est revenu en arrière tout seul. Terminal **CLUSTER** :

   ```bash
   helm history taskflow -n taskflow --max 3
   ```

   **Attendu :** une révision `failed`, suivie d'une révision `Rollback to …`.

5. `Ctrl+C` sur la sonde : **0 erreur**. Vérifier que la version servie n'a pas changé. Terminal **LOCAL** :

   ```powershell
   (Invoke-RestMethod http://10.1.20.73/api/version).version
   ```

### 5.2 Une ancienne version ne peut pas être redéployée

1. Dans GitHub Actions, ouvrir un **ancien** run de `main`, c'est-à-dire pas le dernier.
2. Ouvrir son job **Déploiement staging**, puis le relancer seul : **Re-run this job**.

**Attendu :** le job échoue en quelques secondes à l'étape « Refuser un déploiement obsolète », avec le message `déploiement d'une version obsolète refusé`.

**À dire :** ce garde-fou vient d'un incident réel. Une relance d'un vieux run avait ramené la production en arrière.

### 5.3 Maintenance d'un nœud sans coupure

1. Lancer la sonde (voir 5.1, étape 1).
2. Vider le nœud k8s-2. Terminal **CLUSTER** :

   ```bash
   kubectl drain k8s-2 --ignore-daemonsets --delete-emptydir-data --timeout=120s
   kubectl -n taskflow get pods -o wide
   ```

   **Attendu :** tous les pods de l'application sont sur k8s-1, et la sonde reste verte. Le PodDisruptionBudget garde toujours au moins un pod disponible.

3. Remettre le nœud en service :

   ```bash
   kubectl uncordon k8s-2
   kubectl get nodes
   ```

---

## Démo 6 : l'auto-scaling

**Critère :** Kubernetes et contraintes de production.

1. Lancer le générateur de charge et regarder le HPA. Terminal **CLUSTER** :

   ```bash
   kubectl -n taskflow apply -f https://raw.githubusercontent.com/ESGI-M1-DEVOPS/taskflow/main/deploy/k8s/load-generator.yaml
   kubectl -n taskflow get hpa taskflow-backend -w
   ```

   **Attendu :** le CPU dépasse 60 %, et la colonne `REPLICAS` passe de 2 à 6 en ~45 s. `Ctrl+C` pour arrêter l'affichage.

2. Montrer les 6 pods répartis sur les 2 nœuds :

   ```bash
   kubectl -n taskflow get pods -o wide -l app.kubernetes.io/component=backend
   ```

3. Dans Grafana, montrer les panneaux *Replicas (HPA)*, *Saturation CPU* et *Latence*.

4. Arrêter la charge et regarder la redescente :

   ```bash
   kubectl -n taskflow delete deploy load-generator
   kubectl -n taskflow get hpa taskflow-backend -w
   ```

   **Attendu :** retour à 2 pods en 1 à 2 minutes.

---

## Démo 7 : supervision et logs

**Critère :** observabilité et supervision.

1. **Dashboard.** Dans Grafana, *Dashboards > TaskFlow - Golden signals* : présenter les 4 signaux (latence, trafic, erreurs, saturation) et l'état de la base.

2. **Provoquer des erreurs.** Terminal **LOCAL** :

   ```powershell
   1..30 | ForEach-Object { try { Invoke-WebRequest http://10.1.20.73/api/debug/error -UseBasicParsing | Out-Null } catch {} }
   ```

   **Attendu :** sous 30 s, le panneau *Erreurs 5xx* monte.

3. **Retrouver ces erreurs dans les logs.** Dans Grafana, *Explore*, choisir la source **Loki**, passer en mode *Code*, puis lancer :

   ```text
   {namespace="taskflow", level="error"}
   ```

   **Attendu :** les lignes « erreur non gérée », horodatées, avec la pile d'appels. Filtrer par composant avec `{component="backend"}`.

4. **Corrélation d'une panne de base.** Pendant ce temps, le service est réellement coupé : la base est une instance unique, c'est une limite assumée. Terminal **CLUSTER** :

   ```bash
   kubectl -n taskflow delete pod taskflow-db-0
   kubectl -n taskflow get pods -w
   ```

   **Attendu :**
   - Grafana : le panneau *Base de données* passe à DOWN ;
   - les pods backend passent `0/1` (non prêts) ;
   - Loki : `{component="backend"} |= "injoignable"` montre « base de données injoignable » au même moment ;
   - après 20 à 30 s, la base est recréée et tout redevient vert. `Ctrl+C` pour arrêter l'affichage.

5. **Alertes.** Ouvrir http://10.1.20.73:30090/alerts : règles par défaut (pod qui redémarre en boucle, nœud injoignable…).

---

## Démo 8 : portabilité entre plateformes SysOps

**Critère :** intégration inter-équipes.

**Notre application sur le cluster d'une autre équipe**, depuis un poste qui a leur kubeconfig et Helm :

```bash
git clone https://github.com/ESGI-M1-DEVOPS/taskflow.git
helm upgrade --install taskflow taskflow/deploy/helm/taskflow -n taskflow --create-namespace \
  --set image.owner=esgi-m1-devops --set image.tag=<SHA du dernier commit de main> \
  --set registryAuth.username=Poliaqt --set registryAuth.password=<jeton de lecture GHCR> \
  --set db.password=<mot de passe au choix> \
  --set ingress.host=taskflow.<IP de leur nœud>.nip.io
```

**L'application d'une autre équipe sur notre cluster.** Terminal **CLUSTER**, avec leur chart et leurs valeurs :

```bash
kubectl create namespace <equipe>
helm upgrade --install <appli> <chemin de leur chart> -n <equipe> --set ingress.host=<appli>.10.1.20.73.nip.io
kubectl -n <equipe> get pods
```

**À montrer :** leur application répond, et ses métriques et ses logs apparaissent dans notre Grafana sans configuration supplémentaire. Le contrat d'intégration ([CONTRAT-INTEGRATION.md](CONTRAT-INTEGRATION.md)) est ce qui rend ces deux commandes possibles.

---

## Remise en état après la démo

Terminal **CLUSTER** :

```bash
kubectl uncordon k8s-2                                    # si la démo 5.3 a été interrompue
kubectl -n taskflow delete deploy load-generator --ignore-not-found
kubectl get nodes
kubectl -n taskflow get pods -o wide
```

Terminal **LOCAL**, pour vérifier les versions :

```powershell
foreach ($u in 'http://10.1.20.73','http://10.1.20.72:8080') { $v = Invoke-RestMethod "$u/api/version"; "$u -> $($v.version)" }
```

Si la démo 4 n'a pas été mergée, supprimer la branche :

```powershell
git switch main
git branch -D feature/compteur-taches
git push origin --delete feature/compteur-taches
```

---

## Plan B

| Problème le jour J | Réaction |
| --- | --- |
| Twingate ou le réseau de la salle ne passe pas | Passer la vidéo de secours, et montrer le code et les runs GitHub Actions, qui restent accessibles |
| La CI de la PR est lente | Continuer avec les démos 5 à 8, et revenir à la démo 4 ensuite |
| Le collègue ne peut pas approuver la PR | Montrer le blocage du merge, puis montrer un run passé où la production a été déployée |
| `check-availability.ps1` refuse de se lancer | Utiliser la forme `powershell -ExecutionPolicy Bypass -File …` donnée plus haut |
| Une démo laisse le cluster dans un état inattendu | Section « Remise en état », puis `ansible-playbook playbooks/site.yml -e @secrets.yml` depuis le terminal ADMIN : la version déployée est conservée |
