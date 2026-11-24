# Démo de soutenance : version courte

Programme retenu avec le prof : **démo 1, démo 2.1, démos 3 + 4, démo 6 et démo 7**, plus, à sa demande, **l'hébergement de l'application d'une autre équipe** (démo 8). Environ 21 minutes. Les commandes sont à copier-coller ; chaque bloc indique son terminal. La fiche complète, avec toutes les démos, est dans [DEMO.md](DEMO.md).

## Déroulé

Les temps sont indicatifs : à recaler pendant la répétition.

| Temps | Démo | En parallèle |
| --- | --- | --- |
| 0:00 | [1. L'application](#1-lapplication-fonctionne-2-min) | — |
| 0:02 | [2.1 Relancer `site.yml`](#21-reconstruire-linfrastructure-depuis-le-code-4-min) | Le playbook tourne : on le commente pendant ce temps |
| 0:06 | [3 + 4. Relecture, merge, pipeline](#3--4-pipeline-cicd-et-livraison-dune-fonctionnalité) | Le pipeline de `main` démarre (~5 min jusqu'au staging) |
| 0:08 | [7. Les 4 golden signals](#7a-les-4-golden-signals-3-min) | Le pipeline avance |
| 0:12 | [4 (fin). Sonde + approbation de la production](#4-fin--livrer-en-production-sans-coupure-3-min) | Rolling update en production |
| 0:15 | [6 + 7. Auto-scaling observé dans Grafana](#6--7-auto-scaling-observé-dans-grafana-4-min) | — |
| 0:19 | [8. L'application d'une autre équipe](#8-héberger-lapplication-dune-autre-équipe-3-min) | — |

---

## Avant la soutenance (30 min avant)

### Terminaux et onglets

| Nom | Où | Ouverture |
| --- | --- | --- |
| **LOCAL** | PowerShell sur le PC de démo | `cd` dans le dossier `taskflow` du dépôt |
| **ADMIN** | staging-1 | `ssh admin@10.1.20.72` puis `cd ~/taskflow && git pull && cd infra/ansible` |
| **CLUSTER** | k8s-1 | `ssh admin@10.1.20.73` puis `export KUBECONFIG=/etc/rancher/k3s/k3s.yaml` |
| **QRCODE** | k8s-2 | `ssh admin@10.1.20.74` puis `cd ~/qrcode` |

Onglets du navigateur :
- http://10.1.20.73/ : l'application en production ;
- http://10.1.20.74:8081/ : l'application de l'autre équipe (générateur de QR codes) ;
- http://10.1.20.73:30300/ : Grafana, *Dashboards > TaskFlow - Golden signals*, période « Last 15 minutes », rafraîchissement 10 s ;
- https://github.com/ESGI-M1-DEVOPS/taskflow/actions ;
- https://github.com/ESGI-M1-DEVOPS/taskflow/pulls.

### Vérifications

1. **Production et staging à la même version.** Terminal **LOCAL** :

   ```powershell
   foreach ($u in 'http://10.1.20.73','http://10.1.20.72:8080') { $v = Invoke-RestMethod "$u/api/version"; "$u -> $($v.version) ($($v.hostname))" }
   ```

2. **Cluster en bonne santé.** Terminal **CLUSTER** :

   ```bash
   kubectl get nodes
   kubectl -n taskflow get pods -o wide
   kubectl -n taskflow get hpa
   ```

   Attendu : 2 nœuds `Ready` (k8s-1 `control-plane`, k8s-2 `worker`), tous les pods `Running`, des pourcentages de CPU (pas `<unknown>`).

3. **Aucun run de `main` en attente d'approbation** dans GitHub Actions. Le pipeline n'exécute qu'un run à la fois sur `main` : un run qui attend « Review deployments » bloquerait celui de la démo en file d'attente. S'il y en a un, l'approuver, ou cliquer sur **Review deployments > Reject**.

4. **Quelques tâches dans l'application.** Terminal **LOCAL** :

   ```powershell
   'Préparer la soutenance','Relire le contrat d''intégration','Vérifier Grafana' | ForEach-Object { Invoke-RestMethod http://10.1.20.73/api/tasks -Method Post -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes((@{ title = $_ } | ConvertTo-Json))) } | Out-Null
   ```

5. **L'application de l'autre équipe répond.** Terminal **QRCODE** :

   ```bash
   sudo docker compose ps
   ```

   Attendu : `qrcode` en `Up … (healthy)`. Sinon : `sudo docker compose up -d`.

### Préparer la pull request de la fonctionnalité, sans la merger

La branche `feature/compteur-taches` est déjà sur GitHub. Elle ajoute un compteur « N tâche(s) restante(s) » sous le titre de l'application, en 2 lignes.

1. Ouvrir https://github.com/ESGI-M1-DEVOPS/taskflow/pull/new/feature/compteur-taches, puis **Create pull request**.
2. Attendre que les 3 vérifications passent au vert, en 3 minutes environ : *Lint & analyse statique*, *Tests automatisés*, *Build, smoke test & publication des images*.
3. **Ne pas approuver, ne pas merger.** Le bouton de merge doit afficher *Review required*.
4. Le collègue qui approuvera pendant la démo doit être connecté à **son** compte GitHub. L'auteur d'une PR ne peut pas l'approuver lui-même.

---

## 1. L'application fonctionne (2 min)

1. Dans l'onglet de l'application : créer une tâche, la cocher, la supprimer.
2. Montrer le pied de page : version du frontend et du backend (SHA du commit), et nom du pod qui a répondu.
3. Montrer la répartition de charge entre les pods. Terminal **LOCAL** :

   ```powershell
   1..8 | ForEach-Object { (Invoke-RestMethod http://10.1.20.73/api/version).hostname }
   ```

   **Attendu :** deux noms de pods backend qui alternent.

**À dire :** la requête passe par l'Ingress, le frontend nginx puis le backend Node.js, qui lit PostgreSQL. Les deux pods backend tournent sur deux machines différentes.

---

## 2.1 Reconstruire l'infrastructure depuis le code (4 min)

Montrer `infra/ansible/playbooks/site.yml` dans VS Code. L'enchaînement : prérequis, socle (avec les garde-fous VM et RAM), Docker, k3s, monitoring, application. Puis, terminal **ADMIN** :

```bash
ansible-playbook playbooks/site.yml -e @secrets.yml
```

Pendant qu'il tourne, expliquer l'inventaire (`inventories/proxmox/hosts.yml`) et les rôles.

**Attendu :**
- la ligne `Version qui va être déployée` affiche `image_tag=<SHA> (conservée : version déjà déployée)` ;
- le récapitulatif final affiche `failed=0` sur les 3 VM, avec très peu de `changed`.

**À dire :** ce même fichier a construit la plateforme depuis des VM vierges en une dizaine de minutes. Relancé, il ne change que ce qui diffère de l'état voulu, et ne touche pas à la version de l'application.

**Attendre la fin du playbook avant de merger la PR de l'étape suivante.**

---

## 3 + 4. Pipeline CI/CD et livraison d'une fonctionnalité

### 3 + 4 (début) : relecture et merge (2 min)

1. Ouvrir la PR **Frontend : compteur de tâches restantes**, puis montrer :
   - l'onglet *Files changed* : 2 lignes ajoutées ;
   - les 3 vérifications au vert : le code a été analysé, testé, et l'application complète démarrée par un smoke test ;
   - le merge **bloqué** par *Review required* (règle `protection-main`).
2. Le collègue approuve depuis son compte : *Files changed > Review changes > Approve > Submit review*.
3. Cliquer sur **Merge pull request**, puis **Confirm merge**.
4. Ouvrir l'onglet GitHub Actions. Le pipeline de `main` démarre. Expliquer les jobs :
   - `Lint & analyse statique` et `Tests automatisés`, en parallèle sur les serveurs de GitHub ;
   - `Build, smoke test & publication des images` : 3 images taguées avec le SHA du merge, poussées sur GHCR (privé) ;
   - `Déploiement staging`, exécuté par le **runner** sur staging-1. Il affiche « Refuser un déploiement obsolète : OK » et l'empreinte de la clé SSH, puis lance Ansible ;
   - `Déploiement production`, qui attendra une approbation.

Le pipeline met ~5 min pour arriver au staging : passer à la démo 7 en attendant.

### 4 (fin) : livrer en production sans coupure (3 min)

Revenir quand le run affiche **Review deployments** (staging vert, production en attente).

1. Vérifier que le staging a la fonctionnalité : ouvrir http://10.1.20.72:8080/. Le compteur est visible.
2. **Avant d'approuver**, lancer la sonde. Terminal **LOCAL** :

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\scripts\check-availability.ps1 -Url http://10.1.20.73
   ```

3. Dans le run, cliquer sur **Review deployments**, cocher `production`, puis **Approve and deploy**.
4. Regarder la sonde : la version passe de l'ancien SHA au nouveau. Pendant une dizaine de secondes, les deux alternent, puis seul le nouveau reste.
5. `Ctrl+C` sur la sonde : le bilan affiche **0 erreur**.
6. Rafraîchir http://10.1.20.73/ : le compteur « N tâche(s) restante(s) » est en production, et le pied de page affiche le nouveau SHA.

**À dire :** Kubernetes ajoute un pod de la nouvelle version, attend qu'il soit prêt, puis retire un ancien pod, qui termine ses requêtes en cours. À aucun moment il n'y a moins de pods prêts. Nos mesures précédentes : 285, 349 et 778 requêtes, 0 erreur.

---

## 7.a Les 4 golden signals (3 min)

Dans Grafana, dashboard **TaskFlow - Golden signals** :

| Signal | Panneaux à montrer | Ce qu'on dit |
| --- | --- | --- |
| **Latence** | *Latence p95*, *Latence (p50 / p95 / p99)* | Temps de réponse de l'API, mesuré par le backend lui-même |
| **Trafic** | *Trafic (req/s)*, *Trafic par route* | Requêtes par seconde, route par route |
| **Erreurs** | *Erreurs 5xx (%)*, *Erreurs par code HTTP* | Part des requêtes en erreur, et leurs codes |
| **Saturation** | *Saturation CPU par instance backend*, *Mémoire par instance backend*, *Event loop lag p99*, *Replicas (auto-scaling HPA)*, *CPU des conteneurs (cAdvisor)* | Ressources consommées par rapport à ce qui est disponible |

Montrer aussi le panneau *Base de données* (UP) et *Redémarrages de pods* (crashs).

**Optionnel, pour faire bouger le signal « Erreurs ».** Terminal **LOCAL** :

```powershell
1..30 | ForEach-Object { try { Invoke-WebRequest http://10.1.20.73/api/debug/error -UseBasicParsing | Out-Null } catch {} }
```

Sous 30 s, *Erreurs 5xx (%)* monte. Les erreurs se retrouvent dans les logs : Grafana > *Explore* > source **Loki** > `{namespace="taskflow", level="error"}`.

**À dire :** Prometheus relève les métriques toutes les 15 s, et Grafana affiche ces 4 signaux, que les équipes SRE surveillent en priorité. Le dashboard est livré avec l'application, dans la chart Helm.

---

## 6 + 7. Auto-scaling observé dans Grafana (4 min)

Garder Grafana visible à côté du terminal.

1. Lancer la charge et suivre le HPA. Terminal **CLUSTER** :

   ```bash
   kubectl -n taskflow apply -f https://raw.githubusercontent.com/ESGI-M1-DEVOPS/taskflow/main/deploy/k8s/load-generator.yaml
   kubectl -n taskflow get hpa taskflow-backend -w
   ```

   **Attendu :** le CPU dépasse 60 %, et la colonne `REPLICAS` passe de 2 à 6 en ~45 s. `Ctrl+C` pour arrêter l'affichage.

2. Dans Grafana, en même temps (avec 15 à 30 s de décalage, le temps de la collecte) :

   | Signal | Ce qu'on voit pendant la charge |
   | --- | --- |
   | **Trafic** | *Trafic (req/s)* monte : c'est le générateur de charge |
   | **Latence** | *Latence p95* monte : chaque requête consomme volontairement 100 ms de CPU |
   | **Saturation** | *Saturation CPU* grimpe, puis se répartit quand *Replicas (auto-scaling HPA)* passe de 2 à 6 |
   | **Erreurs** | *Erreurs 5xx (%)* reste à 0 : la plateforme absorbe la charge |

3. Montrer les 6 pods répartis sur les 2 nœuds. Terminal **CLUSTER** :

   ```bash
   kubectl -n taskflow get pods -o wide -l app.kubernetes.io/component=backend
   ```

4. Arrêter la charge :

   ```bash
   kubectl -n taskflow delete deploy load-generator
   kubectl -n taskflow get hpa taskflow-backend -w
   ```

   **Attendu :** retour à 2 pods en 1 à 2 minutes. On peut conclure pendant la redescente, visible aussi sur le panneau *Replicas*.

**À dire :** le HorizontalPodAutoscaler s'appuie sur metrics-server, inclus dans k3s. Il ajoute des pods quand le CPU dépasse 60 % de ce que chaque pod a réservé, jusqu'à 6, et les retire quand la charge retombe.

---

## 8. Héberger l'application d'une autre équipe (3 min)

L'application [`len84/qrcode-generator:1.0`](https://hub.docker.com/r/len84/qrcode-generator) est un site statique servi par nginx : le QR code est généré dans le navigateur, sans base ni configuration. Elle tourne sur **k8s-2**, en docker compose, à l'adresse **http://10.1.20.74:8081**.

### Comment c'est installé

Elle est **volontairement hors de notre IaC** : pas d'Ansible, pas de Helm, pas de CI. Le prof demandait de la lancer à la main en docker compose. Sur la même VM cohabitent donc deux mondes :

| | TaskFlow | Application invitée |
| --- | --- | --- |
| Installé par | Ansible (`site.yml`) | à la main |
| Moteur de conteneurs | containerd de k3s (`/run/k3s/containerd`) | Docker Engine et son propre containerd (`/run/containerd`) |
| Décrit par | la chart Helm | `~/qrcode/compose.yml` |
| Entrée réseau | ports 80 / 443 → Traefik → pods | port 8081 → `docker-proxy` → conteneur nginx (port 80) |
| Pare-feu | règles iptables écrites par k3s | **aucune règle** (`"iptables": false`) |
| Ressources | requests / limits, HPA de 2 à 6 pods | plafond de 128 Mo et 0,5 CPU |
| Mise à jour | pipeline CI/CD, rolling update sans coupure | `docker compose pull && docker compose up -d`, avec une coupure de quelques secondes |

L'installation s'est faite en 3 étapes :

1. Écrire `/etc/docker/daemon.json` **avant** d'installer Docker : `{ "iptables": false, "ip6tables": false }`.
2. Installer Docker depuis son dépôt officiel, sans les paquets recommandés : `apt-get install --no-install-recommends docker-ce docker-ce-cli containerd.io docker-compose-plugin`.
3. Copier `compose.yml` dans `~/qrcode`, puis lancer `sudo docker compose up -d`.

Le vrai risque était le réseau des pods : **Traefik tourne sur k8s-2**, donc toute la production, même par 10.1.20.73, passe par cette VM. Les précautions prises :

- **Docker ne pilote pas le pare-feu.** Le port 8081 est servi par `docker-proxy`, un processus qui écoute sur le port et relaie vers le conteneur. Les règles de k3s restent intactes : 313 avant, 313 après. Le mode a été testé en local avant l'installation.
- **Même iptables que k3s.** Le paquet installé en dépendance est la même version (1.8.11), avec le même backend (`nf_tables`) : pas de mélange legacy / nft.
- **Pas d'AppArmor.** C'est une recommandation du paquet Docker. L'installer aurait changé le confinement des pods k3s au prochain redémarrage. Une simulation apt l'a vérifié avant l'installation.
- **Pas de conflit d'adresses.** Le pont `docker0` est en 172.17.0.0/16, alors que les VM, Twingate et le DNS sont ailleurs.
- **Installation sous surveillance.** Une sonde a interrogé la production pendant toute l'installation : 528 requêtes, 0 erreur. Le script prévoyait un retour arrière automatique (arrêt de Docker, redémarrage de `k3s-agent`). Il n'a pas servi.

### Démonstration

1. Dans l'onglet http://10.1.20.74:8081/ : saisir une URL, générer le QR code, puis le scanner avec un téléphone.
2. Montrer la configuration. Terminal **QRCODE** :

   ```bash
   cat compose.yml                       # image au tag figé 1.0, port 8081, limites, healthcheck
   cat /etc/docker/daemon.json           # { "iptables": false, "ip6tables": false }
   sudo docker compose ps                # Up … (healthy)
   sudo docker stats --no-stream qrcode  # quelques Mo sur les 128 Mo autorisés
   ```

3. Montrer que les deux moteurs ne se voient pas. Toujours terminal **QRCODE** :

   ```bash
   sudo docker ps --format '{{.Names}}'          # qrcode, et rien d'autre
   sudo k3s crictl ps -q | wc -l                 # nombre de conteneurs de k3s, invisibles pour Docker
   sudo iptables-save | grep -ci docker          # 0 : Docker n'a écrit aucune règle
   ```

4. Montrer que TaskFlow n'est pas impacté :

   ```bash
   curl -s -o /dev/null -w 'TaskFlow via k8s-2 : HTTP %{http_code}\n' http://10.1.20.74/
   ```

**À dire :** on a hébergé l'application comme demandé, mais ce n'est pas la cible. Une installation à la main est une **dérive** par rapport à l'IaC : elle n'est pas rejouable par `site.yml`, n'est pas surveillée par Grafana et se met à jour avec une coupure. Pour héberger durablement l'application d'une autre équipe, on la déploierait dans le cluster, dans un namespace dédié (Deployment, Service, Ingress), et elle profiterait du rolling update, des sondes et du monitoring. On retire Docker de k8s-2 après la soutenance.

**Remarque faite à l'équipe concernée (optionnel) :** leur image contient le dossier `.git` du projet, lisible sur `/.git/`. Un `.dockerignore` avec `.git` suffit à corriger.

---

## Après la démo

Terminal **CLUSTER** :

```bash
kubectl -n taskflow delete deploy load-generator --ignore-not-found
kubectl -n taskflow get pods -o wide
```

Terminal **LOCAL** :

```powershell
foreach ($u in 'http://10.1.20.73','http://10.1.20.72:8080') { "$u -> " + (Invoke-RestMethod "$u/api/version").version }
```

Après le merge de la fonctionnalité, ajouter une entrée au journal du README, par une petite PR : « Frontend : compteur de tâches restantes (PR démontrée en soutenance) ».

Une fois la soutenance terminée, retirer l'application invitée et Docker de k8s-2, pour revenir à l'état décrit par Ansible. Terminal **QRCODE** :

```bash
sudo docker compose down --rmi all
sudo apt-get purge -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo apt-get autoremove -y
sudo rm -rf /var/lib/docker /var/lib/containerd /etc/docker ~/qrcode \
  /etc/apt/sources.list.d/docker.sources /etc/apt/keyrings/docker.asc
```

`/var/lib/containerd` appartient à Docker. Celui de k3s se trouve dans `/var/lib/rancher/k3s/agent/containerd`.

## Plan B

| Problème | Réaction |
| --- | --- |
| Le pipeline est lent à atteindre la production | Faire la démo 6 + 7, ou la démo 8, avant d'approuver la production, puis revenir à la fin de la démo 4 |
| L'application de l'autre équipe ne répond pas | Terminal **QRCODE** : `sudo docker compose up -d`, puis `sudo docker compose logs --tail 20` |
| Le collègue ne peut pas approuver | Montrer le blocage du merge, puis un run passé où la production a été déployée |
| `check-availability.ps1` ne se lance pas | Vérifier qu'on est dans le dossier `taskflow` ; garder la forme `powershell -ExecutionPolicy Bypass -File …` |
| Grafana ne montre rien de neuf | Vérifier la période (« Last 15 minutes ») et attendre 30 s : la collecte se fait toutes les 15 s |
| Twingate ou le réseau de la salle ne passe pas | Vidéo de secours, plus le code et les runs GitHub Actions, accessibles sans Twingate |
