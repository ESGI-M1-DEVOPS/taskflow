# Tutoriel : des VM vierges à la soutenance

Ce guide monte toute la plateforme TaskFlow pas à pas : VM Proxmox, accès Twingate, dépôt GitHub, infrastructure Ansible, pipeline CI/CD. Chaque étape se termine par une **vérification** : ne passez à la suite que si elle est bonne.

Durée totale : environ 2 h, attentes d'installation comprises.

## Notre environnement

| Élément | Valeur |
|---|---|
| Organisation GitHub | `ESGI-M1-DEVOPS` (dans les noms d'images : `esgi-m1-devops`) |
| Dépôt | `https://github.com/ESGI-M1-DEVOPS/taskflow` |
| Images | `ghcr.io/esgi-m1-devops/taskflow-{frontend,backend,db}` |
| VM staging (+ poste d'admin Ansible + runner CI) | `staging-1`, **10.1.20.72** |
| VM k3s control-plane | `k8s-1`, **10.1.20.73** |
| VM k3s worker | `k8s-2`, **10.1.20.74** |
| OS, compte SSH | Debian 13, compte sudoer `admin` (le même sur les 3 VM) |
| Accès distant | Twingate |

Ces valeurs sont **déjà renseignées** dans [hosts.yml](../infra/ansible/inventories/proxmox/hosts.yml) et [group_vars/all.yml](../infra/ansible/inventories/proxmox/group_vars/all.yml).

> 🔒 Le dépôt est public : **n'écrivez jamais le mot de passe du compte `admin`** dans un fichier du projet, une issue ou un commit.

Les blocs de commandes indiquent où les lancer : **Windows (PowerShell)** ou **staging-1 (bash)**.

## Qui fait quoi (en parallèle)

| Personne | Étapes |
|---|---|
| A | 1. VM Proxmox, puis 2. Twingate |
| B | 3. Dépôt GitHub, premier pipeline, images publiques |
| C | 4 et 5 dès que les VM et le dépôt sont prêts : poste d'admin et Ansible |
| D | 6. CI/CD (secrets, environnement, runner), puis répétition de la démo ([DEMO.md](DEMO.md)) |

```mermaid
flowchart LR
  E1[1. VM] --> E2[2. Twingate] --> E4[4. Admin sur staging-1]
  E3[3. GitHub + push + images publiques] --> E4
  E4 --> E5[5. site.yml] --> E6[6. Secrets + runner] --> E7[7. Premier déploiement continu] --> E8[8. Répétition]
```

---

## Étape 1 : les VM Proxmox (≈ 20 min)

| VM | Hostname | IP | vCPU | RAM | Disque | Minimum (garde-fou Ansible) |
|---|---|---|---|---|---|---|
| staging | `staging-1` | 10.1.20.72 | 4 | 4 Go | 30 Go | 1,8 Go de RAM |
| k3s control-plane | `k8s-1` | 10.1.20.73 | 4 | 6 Go | 30 Go | 3,5 Go de RAM |
| k3s worker | `k8s-2` | 10.1.20.74 | 2 | 4 Go | 30 Go | 1,8 Go de RAM |

Ce sont les VM en service. Avec ces ressources, `site.yml` s'exécute en une dizaine de minutes.

- **De vraies VM** (*Create VM* dans Proxmox, KVM/QEMU), **pas des conteneurs** (*Create CT* / LXC) : k3s et Docker ne fonctionnent pas correctement dans un LXC. Ansible refuse désormais de continuer sur un conteneur, ou sur une machine qui manque de RAM.
- Debian 13 avec le **serveur SSH** et le compte sudoer **`admin`**. Si Python manque, Ansible l'installe lui-même.
  - Astuce installateur Debian : en laissant le **mot de passe root vide**, l'installateur installe `sudo` et ajoute automatiquement le premier utilisateur (`admin`) au groupe sudo.
  - Dans *Software selection*, cocher **SSH server** et **standard system utilities** ; pas d'environnement de bureau.
- **IP fixes** : elles sont écrites dans l'inventaire Ansible.
- **Accès Internet** depuis les VM : apt, get.k3s.io, github.com et ghcr.io doivent être joignables.

> ⚠️ **VM clonées depuis un template** : chaque VM doit avoir un hostname **et** un machine-id uniques. Sinon, k3s refuse le deuxième nœud. Sur chaque clone :
> ```bash
> sudo hostnamectl set-hostname k8s-2          # le nom de CETTE VM
> sudo rm -f /etc/machine-id /var/lib/dbus/machine-id
> sudo systemd-machine-id-setup
> sudo reboot
> ```

✅ **Vérification**, sur `staging-1` (console Proxmox ou SSH) :

```bash
hostname                                    # staging-1
ping -c1 10.1.20.73 && ping -c1 10.1.20.74  # les autres VM répondent
cat /etc/machine-id                         # valeur différente sur chaque VM
sudo apt-get update >/dev/null && echo "sudo et Internet OK"
```

---

## Étape 2 : accès Twingate (≈ 10 min)

Dans la console d'administration Twingate, sur le réseau remote qui contient le connecteur Proxmox :

1. **Ajouter les ressources** `10.1.20.72`, `10.1.20.73` et `10.1.20.74` (ou le sous-réseau qui les contient), avec ces ports TCP :

   | Port | Usage |
   |---|---|
   | 22 | SSH |
   | 80 | application de production (Ingress) |
   | 8080 | application de staging |
   | 3000, 9090 | Grafana et Prometheus du staging |
   | 30300, 30090 | Grafana et Prometheus de production |
   | 6443 | API Kubernetes (`kubectl` depuis un PC) |

   Le plus simple est d'autoriser tous les ports.
2. **Donner l'accès** à un groupe qui contient les 4 membres de l'équipe.

✅ **Vérification**, Twingate connecté :

```powershell
# Windows (PowerShell)
ssh admin@10.1.20.72 hostname               # affiche staging-1
Test-NetConnection 10.1.20.73 -Port 22      # TcpTestSucceeded : True
```

---

## Étape 3 : dépôt GitHub et premier pipeline (≈ 15 min)

### 3.1 Réglages de l'organisation (une fois, par un owner)

Dans `https://github.com/organizations/ESGI-M1-DEVOPS/settings` :

- **People** : les 4 membres font partie de l'organisation.
- **Teams > New team** (`https://github.com/orgs/ESGI-M1-DEVOPS/teams`) : équipe `taskflow-devops` avec les 4 membres. Elle recevra le droit d'écriture sur le dépôt à l'étape 3.6.
- **Actions > General** :
  - *Actions permissions* : « Allow all actions and reusable workflows » ;
  - *Fork pull request workflows from outside collaborators* : « Require approval for all outside collaborators ». C'est important : le runner self-hosted tourne chez vous.
- **Personal access tokens** : laisser autorisés les jetons *classic*. Les serveurs s'en servent pour lire les images privées (étape 3.5).

### 3.2 Créer le dépôt

*New repository* dans `ESGI-M1-DEVOPS` : nom **`taskflow`**, visibilité **Public**, **sans** README, .gitignore ni licence.

> Pourquoi public : sur le plan gratuit de GitHub, les *environnements avec approbation* (mise en production semi-automatique) n'existent que pour les dépôts publics.

### 3.3 Pousser le code

La configuration (IP, organisation, compte `admin`) est déjà renseignée.

```powershell
# Windows (PowerShell)
cd "C:\Users\t.chalaron\Desktop\DOSSIER ECOLE ESGI\M1\DevOps\taskflow"
git init -b main
git add .
git update-index --chmod=+x scripts/bootstrap-controller.sh scripts/check-availability.sh
git commit -m "TaskFlow : application, IaC, CI/CD et observabilité"
git remote add origin https://github.com/ESGI-M1-DEVOPS/taskflow.git
git push -u origin main
```

### 3.4 Premier pipeline

Ouvrir `https://github.com/ESGI-M1-DEVOPS/taskflow/actions`. Les jobs `Lint & analyse statique`, `Tests automatisés` puis `Build, smoke test & publication des images` doivent passer au vert, en 5 min environ.

Le job `Déploiement staging` reste en *Waiting for a runner* : le runner n'arrive qu'à l'étape 6. **Annulez ces runs en attente** (*Cancel workflow*) : le premier merge fait après l'étape 6 déploiera la dernière version.

> Ne relancez jamais un ancien run pour déployer : il redéploierait un ancien commit. Le workflow le refuse désormais avec l'étape « Refuser un déploiement obsolète ».

### 3.5 Jeton de lecture des images (les images restent privées)

Les images restent **privées** sur GHCR. Les serveurs (k3s et le Docker du staging) les téléchargent avec un **jeton GitHub en lecture seule**.

1. Connecté avec le compte **Poliaqt**, qui est le `registry_username` de [group_vars/all.yml](../infra/ansible/inventories/proxmox/group_vars/all.yml), ouvrir *Settings > Developer settings > Personal access tokens > **Tokens (classic)** > Generate new token (classic)* :
   - Note : `taskflow-ghcr-read` ;
   - Expiration : 30 jours, pour couvrir la soutenance ;
   - Scopes : cocher **uniquement `read:packages`**.
2. Copier le jeton (`ghp_...`) tout de suite : GitHub ne l'affichera plus. Il sert à deux endroits :
   - `registry_password` dans `secrets.yml` (étape 4) ;
   - le secret GitHub `GHCR_READ_TOKEN` (étape 6.1).

> Pourquoi un jeton *classic* : GHCR n'accepte pas les jetons *fine-grained*. Le `GITHUB_TOKEN` de la CI ne convient pas non plus : il expire à la fin du job, alors que k3s doit pouvoir retélécharger les images plus tard (auto-scaling, redémarrage d'un pod). Si c'est un autre membre qui crée le jeton, mettez **son** login dans `registry_username`.

✅ **Vérification** :

```powershell
# Windows (PowerShell)
docker logout ghcr.io
docker pull ghcr.io/esgi-m1-devops/taskflow-backend:latest   # refusé : "unauthorized" (images bien privées)
docker login ghcr.io -u Poliaqt                               # coller le jeton comme mot de passe
docker pull ghcr.io/esgi-m1-devops/taskflow-backend:latest   # OK
docker logout ghcr.io
```

### 3.6 Protéger `main` : chaque PR est validée par un autre membre

À partir d'ici, plus personne ne pousse directement sur `main` : toute modification passe par une **pull request approuvée par un autre membre**, avec une CI verte.

**1. Donner le droit d'écriture à l'équipe.** Sans lui, un membre ne peut ni pousser de branche, ni donner une approbation qui compte.

*Settings du dépôt > Collaborators and teams > Add teams* : `taskflow-devops`, rôle **Write**.

**2. Créer la règle.** *Settings du dépôt > Rules > Rulesets > New ruleset > New branch ruleset* :

| Réglage | Valeur |
|---|---|
| Ruleset Name | `protection-main` |
| Enforcement status | **Active** |
| Bypass list | vide : personne ne contourne la règle |
| Target branches | *Add target > Include default branch* |
| Restrict deletions | ☑ |
| **Require a pull request before merging** | ☑ |
| ↳ Required approvals | **1** |
| ↳ Dismiss stale pull request approvals when new commits are pushed | ☑ |
| ↳ Require approval of the most recent reviewable push | ☑ |
| ↳ Require conversation resolution before merging | ☑ |
| **Require status checks to pass** | ☑, puis *Add checks* : `Lint & analyse statique`, `Tests automatisés`, `Build, smoke test & publication des images` |
| Block force pushes | ☑ |

Cliquer sur **Create**.

Ce que ces options garantissent :
- **Un autre membre valide toujours.** L'auteur d'une PR ne peut pas l'approuver lui-même.
- **Pas de code non relu.** Si quelqu'un pousse après une approbation, celle-ci est annulée et il faut une nouvelle validation.
- **CI obligatoire.** Les 3 checks doivent être verts pour pouvoir merger.

✅ **Vérification** : dans *Settings > Rules > Rulesets*, `protection-main` est **Active**. À la première PR (étape 7), GitHub affiche *Review required* et le bouton de merge reste bloqué tant qu'un autre membre n'a pas approuvé.

---

## Étape 4 : staging-1 devient le poste d'administration (≈ 15 min)

Ansible ne tourne pas sous Windows. On le lance depuis `staging-1` : elle est déjà dans le réseau Proxmox et hébergera aussi le runner de la CI.

```bash
# staging-1 (bash) : ssh admin@10.1.20.72
sudo apt-get update && sudo apt-get install -y git
git clone https://github.com/ESGI-M1-DEVOPS/taskflow.git
cd taskflow
bash scripts/bootstrap-controller.sh
echo 'export PATH="$HOME/.venvs/ansible/bin:$PATH"' >> ~/.bashrc
echo 'export ANSIBLE_PRIVATE_KEY_FILE="$HOME/.ssh/ansible"' >> ~/.bashrc
source ~/.bashrc
```

**Clé SSH dédiée à Ansible.** C'est la même qui sera donnée à la CI. `ssh-copy-id` demande une dernière fois le mot de passe du compte `admin` de chaque VM :

```bash
ssh-keygen -t ed25519 -f ~/.ssh/ansible -N "" -C "ansible-taskflow"
for ip in 10.1.20.72 10.1.20.73 10.1.20.74; do ssh-copy-id -i ~/.ssh/ansible.pub admin@$ip; done
# utiliser cette clé par défaut pour les ssh lancés depuis staging-1
printf 'Host 10.1.20.72 10.1.20.73 10.1.20.74\n  User admin\n  IdentityFile ~/.ssh/ansible\n' >> ~/.ssh/config
chmod 600 ~/.ssh/config
```

**Secrets** :

```bash
cd ~/taskflow/infra/ansible
cp secrets.example.yml secrets.yml
openssl rand -hex 32        # à copier dans k3s_token
nano secrets.yml            # db_password, k3s_token, grafana_admin_password, registry_password (jeton de l'étape 3.5)
```

> Notez `db_password`, `grafana_admin_password` et `registry_password` : les **mêmes valeurs** iront dans les secrets GitHub à l'étape 6. `secrets.yml` est ignoré par git : il ne sera jamais poussé.

✅ **Vérification** :

```bash
ansible all -m raw -a "hostname"
# staging-1 | CHANGED | rc=0 >> staging-1
# k8s-1 | CHANGED | rc=0 >> k8s-1
# k8s-2 | CHANGED | rc=0 >> k8s-2
```

---

## Étape 5 : construire toute l'infrastructure (≈ 10 min mesurées, jusqu'à 30 min si le réseau est lent)

```bash
# staging-1 (bash), dans ~/taskflow/infra/ansible
ansible-playbook playbooks/site.yml -e @secrets.yml -K
```

`-K` affiche `BECOME password:` : tapez le mot de passe du compte `admin`. Ce n'est utile qu'au **premier lancement** : le playbook configure ensuite sudo sans mot de passe pour `admin`, ce dont la CI a besoin. Les fois suivantes, `-K` est inutile.

Le playbook enchaîne :
1. les prérequis (python3, sudo) ;
2. le socle commun ;
3. Docker sur staging ;
4. k3s sur les 2 nœuds et Helm ;
5. Prometheus, Grafana, Loki et Alloy ;
6. TaskFlow en staging puis en production.

Le récapitulatif final doit afficher **`failed=0`** pour les 3 VM.

> Si l'installation du monitoring dépasse le délai (téléchargement lent), relancez **la même commande** : le playbook est idempotent et reprend là où il en était.

> Pour un long lancement, mieux vaut le détacher de la session SSH : une coupure Twingate ne l'interrompra pas.
> ```bash
> nohup ansible-playbook playbooks/site.yml -e @secrets.yml > ~/site-run.log 2>&1 &
> tail -f ~/site-run.log
> ```
> `-K` ne fonctionne pas en détaché. Lancez-le donc ainsi seulement **après** un premier passage, quand sudo n'exige plus de mot de passe.

✅ **Vérifications** :

```bash
ssh 10.1.20.73 kubectl get nodes              # k8s-1 et k8s-2 : Ready
ssh 10.1.20.73 kubectl get pods -A            # tout est Running ou Completed
ssh 10.1.20.73 kubectl -n taskflow get hpa    # 2 HPA, cibles CPU connues (pas <unknown>)
```

Puis, dans le navigateur sous Windows (Twingate connecté) :

| URL | Attendu |
|---|---|
| http://10.1.20.73/ | TaskFlow en production ; créer une tâche |
| http://10.1.20.72:8080/ | TaskFlow en staging |
| http://10.1.20.73:30300/ | Grafana, identifiant `admin` / `grafana_admin_password` ; *Dashboards > TaskFlow - Golden signals* |
| Grafana > *Explore* > **Loki** | requête `{namespace="taskflow"}` : les logs arrivent |
| http://10.1.20.73:30090/ | Prometheus, *Status > Targets* : la cible `taskflow-backend` est UP |

**Facultatif : `kubectl` depuis Windows.** Le playbook a récupéré le kubeconfig sur staging-1 :

```powershell
# Windows (PowerShell)
scp admin@10.1.20.72:taskflow/infra/ansible/kubeconfig-prod.yaml $HOME\kubeconfig-prod.yaml
$env:KUBECONFIG = "$HOME\kubeconfig-prod.yaml"
kubectl get nodes
```

---

## Étape 6 : brancher la CI/CD sur le Proxmox (≈ 15 min)

Tout se passe dans `https://github.com/ESGI-M1-DEVOPS/taskflow/settings`.

### 6.1 Secrets

*Secrets and variables > Actions > Secrets > New repository secret* :

| Nom | Valeur |
|---|---|
| `ANSIBLE_SSH_PRIVATE_KEY` | sortie de `cat ~/.ssh/ansible` sur staging-1, **lignes BEGIN et END comprises**. Pour éviter les erreurs de sélection, copier directement dans le presse-papiers depuis PowerShell : `ssh admin@10.1.20.72 "cat ~/.ssh/ansible" \| Set-Clipboard`, puis coller dans le secret. Si `Set-Clipboard` répond « Échec de l'opération du Presse-papiers », le presse-papiers est occupé : relancer la commande. Éviter `\| clip`, qui ajoute un caractère invisible (BOM) en tête |
| `DB_PASSWORD` | **la même** valeur que `db_password` dans `secrets.yml` |
| `GRAFANA_ADMIN_PASSWORD` | **la même** valeur que `grafana_admin_password` |
| `GHCR_READ_TOKEN` | le jeton de lecture des images de l'étape 3.5 (= `registry_password`) |

> ⚠️ Si `DB_PASSWORD` diffère de `secrets.yml`, le backend ne pourra plus se connecter : PostgreSQL garde le mot de passe de sa création.

### 6.2 Variables

Onglet *Variables* :
- `STAGING_URL` = `http://10.1.20.72:8080`
- `PROD_URL` = `http://10.1.20.73`

### 6.3 Environnement de production

*Environments > production* (il existe déjà depuis le premier pipeline ; sinon *New environment*) : cocher **Required reviewers** et ajouter 1 ou 2 membres de l'équipe.

### 6.4 Runner self-hosted

1. *Actions > Runners > New self-hosted runner > Linux*. Copier **uniquement le jeton** de la ligne `./config.sh --url ... --token XXXXXXXX`. Il est valable 1 h. **N'exécutez aucune des commandes de cette page** : le playbook s'en charge et installe le runner comme service systemd, sous un utilisateur dédié, avec le label `proxmox`.
2. Avant d'installer : annulez les runs encore en attente de runner. Sinon, le runner les prendra dès son démarrage.
3. Installer le runner :
   ```bash
   # staging-1 (bash), dans ~/taskflow/infra/ansible
   ansible-playbook playbooks/github-runner.yml -e @secrets.yml -e github_runner_token=XXXXXXXX
   ```

✅ **Vérification** : dans *Actions > Runners*, `staging-1` apparaît **Idle** avec les labels `self-hosted`, `Linux`, `X64`, `proxmox`.

---

## Étape 7 : premier déploiement continu, via une PR (≈ 15 min)

C'est le circuit à suivre pour **toute** modification.

1. **Créer une branche** à partir d'un `main` à jour, et y faire un changement visible, par exemple le sous-titre dans [app/frontend/public/index.html](../app/frontend/public/index.html) :
   ```powershell
   # Windows (PowerShell), dans le dossier taskflow
   git switch main ; git pull
   git switch -c feature/sous-titre
   # ... modifier le fichier ...
   git add . ; git commit -m "Nouveau sous-titre" ; git push -u origin feature/sous-titre
   ```
2. **Ouvrir la PR.** Sur GitHub, cliquer sur *Compare & pull request* puis *Create pull request*. La CI tourne sur la PR (lint, tests, build et smoke test) sans rien publier ni déployer.
3. **Faire relire.** Un **autre membre** ouvre l'onglet *Files changed*, puis *Review changes > Approve*.
4. **Merger.** Cliquer sur *Merge pull request*, puis *Delete branch*. Le merge sur `main` déclenche le pipeline complet : build, puis **staging** (automatique), puis **production**, qui attend l'approbation (*Review deployments > Approve*).
5. Pendant le déploiement en production, lancer la sonde de disponibilité :
   ```powershell
   .\scripts\check-availability.ps1 -Url http://10.1.20.73
   ```

✅ **Vérification** :
- le pied de page de http://10.1.20.73/ affiche le **SHA du commit** ;
- la sonde affiche **0 erreur** pendant la bascule.

> Après un merge, pensez à `git pull` dans `~/taskflow` sur staging-1 avant de relancer un playbook à la main. La CI, elle, récupère toujours le code à jour toute seule.

> Si un déploiement échoue, corrigez puis relancez le run du **dernier** commit de `main` (*Re-run failed jobs*), jamais un run plus ancien. Si plusieurs runs attendent l'approbation de la production, n'approuvez que le plus récent.

---

## Étape 8 : préparer la soutenance

- [ ] **Changer le mot de passe du compte `admin`** sur les 3 VM (`passwd`) : c'est un mot de passe par défaut. Ansible et la CI n'en ont plus besoin, ils passent par la clé SSH et sudo sans mot de passe.
- [ ] Répéter le déroulé de [DEMO.md](DEMO.md) au moins une fois, chronomètre en main.
- [ ] **Enregistrer une vidéo de secours** de la démo complète (Win+G ou OBS) au cas où le réseau ou Twingate ferait défaut le jour J.
- [ ] Préparer la branche de fonctionnalité à merger en direct (étape 4 de DEMO.md).
- [ ] Remplir la répartition des rôles dans le [README](../README.md).
- [ ] Le matin même : Twingate connecté, VM allumées, pipeline vert, Grafana ouvert sur le dashboard.
- [ ] **Après la soutenance** : supprimer le jeton GHCR (*Settings > Developer settings > Tokens (classic)*), qui n'expire pas.

---

## Dépannage

| Symptôme | Cause probable | Solution |
|---|---|---|
| `swapoff: Not superuser.` en root, ou `assert` « est un conteneur (lxc) » | la machine est un conteneur LXC Proxmox, pas une VM | recréer la machine en VM (*Create VM*), voir l'étape 1 |
| `assert` « n'a que … Mo de RAM » | VM trop petite | augmenter la RAM dans Proxmox (*Hardware > Memory*) puis redémarrer la VM |
| `WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED` en SSH depuis Windows | VM recréée à la même IP : nouvelle clé d'hôte | `ssh-keygen -R <IP>` puis se reconnecter |
| `ansible all ...` : `Permission denied (publickey)` | clé non copiée sur une VM | refaire `ssh-copy-id -i ~/.ssh/ansible.pub admin@<IP>` |
| `Missing sudo password` | premier lancement sans `-K` | relancer avec `-K` |
| Job CI de déploiement en échec, Ansible `UNREACHABLE` / code de sortie 4 | secret `ANSIBLE_SSH_PRIVATE_KEY` mal copié, ou clé d'une ancienne VM | recopier la clé (méthode `Set-Clipboard` de l'étape 6.1) puis *Re-run failed jobs* ; le job affiche l'empreinte de la clé chargée, à comparer avec `ssh-keygen -lf ~/.ssh/ansible.pub` sur staging-1 |
| Job de déploiement en échec : « déploiement d'une version obsolète refusé » | relance d'un ancien run alors que `main` a avancé : le garde-fou empêche de revenir à une version antérieure | relancer le run du **dernier** commit de `main`. Pour un retour arrière volontaire : `git revert` + PR (recommandé), ou en urgence `sudo k3s kubectl -n taskflow rollout undo deploy/taskflow-backend` / `helm rollback taskflow -n taskflow` sur k8s-1 |
| Job CI en échec : `sudo: a password is required` | `site.yml` n'a jamais été mené jusqu'au rôle `common` | relancer `site.yml -e @secrets.yml -K` depuis staging-1 |
| Le worker k8s-2 n'apparaît pas dans `kubectl get nodes` | VM clonée : hostname ou machine-id identiques | encadré de l'étape 1, puis `sudo /usr/local/bin/k3s-agent-uninstall.sh` sur k8s-2 et relancer `site.yml` |
| Pods en `ImagePullBackOff`, ou `unauthorized` au `docker compose pull` | jeton de lecture absent, expiré ou sans `read:packages` | étape 3.5 ; vérifier `registry_password` dans `secrets.yml` et le secret `GHCR_READ_TOKEN`, puis relancer le déploiement |
| `docker login ghcr.io` refusé alors que le jeton est neuf | l'organisation bloque les jetons *classic*, ou le compte n'a pas accès aux packages | étape 3.1 (*Personal access tokens*) ; vérifier que `Poliaqt` voit bien les packages de l'organisation |
| Pods en `Pending` | RAM ou CPU insuffisants | `kubectl describe pod <pod>` ; augmenter la RAM de la VM, ou `loki_enabled: false` dans `group_vars/all.yml` |
| Timeout sur `kube-prometheus-stack` | téléchargement des images trop lent | relancer `site.yml` (idempotent) |
| HPA en `<unknown>` | metrics-server pas encore prêt | attendre 1 à 2 min |
| Job CI bloqué en *Waiting for a runner* | runner arrêté ou mauvais label | `systemctl status 'actions.runner.*'` sur staging-1 ; label `proxmox` présent ? |
| Pas de bouton d'approbation de la production | dépôt privé sur le plan gratuit | passer le dépôt en public (étape 3.2) |
| Backend en erreur d'authentification PostgreSQL | `DB_PASSWORD` différent entre GitHub et `secrets.yml` | remettre la valeur d'origine dans le secret GitHub |
| `git push` refusé : `GH013: Repository rule violations` | push direct sur `main`, interdit par la règle de l'étape 3.6 | passer par une branche et une PR (étape 7) |
| Bouton de merge grisé : *Review required* | la PR n'a pas encore été approuvée par un autre membre | demander une relecture ; l'auteur ne peut pas s'auto-approuver |
| Un membre ne peut pas pousser sa branche (`403`) | l'équipe n'a pas le rôle Write sur le dépôt | étape 3.6, point 1 |
| Dans les logs du playbook : `rollback effectué` | le smoke test post-déploiement a échoué : l'ancienne version est toujours servie | voir les logs : `kubectl -n taskflow logs deploy/taskflow-backend` |
