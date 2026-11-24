# Paramètres NON secrets du Proxmox pour les environnements de PR.
# Le jeton API est dans le secret GitHub PROXMOX_API_TOKEN, jamais ici (dépôt public).
# Mise en place côté Proxmox (template, pool, jeton) : docs/TUTORIEL.md, étape 8.

proxmox_endpoint = "https://A-RENSEIGNER:8006/" # IP du Proxmox, joignable depuis staging-1
proxmox_node     = "A-RENSEIGNER"               # nom du nœud (arbre de gauche de l'interface)

template_vm_id = 9000               # template Debian 13 cloud-init
pool_id        = "taskflow-preview" # seul pool sur lequel le jeton a des droits
datastore_id   = "local-lvm"
bridge         = "vmbr0"

# PR n° N -> 10.1.20.(100 + N % 10) : plage 10.1.20.100 à 10.1.20.109, à réserver
# (hors DHCP, aucune autre machine dessus) et à ajouter comme ressource Twingate.
ip_cidr       = "10.1.20.0/24"
ip_first_host = 100
ip_pool_size  = 10
gateway       = "A-RENSEIGNER"
dns_servers   = ["1.1.1.1", "8.8.8.8"]
