# Paramètres NON secrets du Proxmox pour les environnements de PR.
# Le jeton API est dans le secret GitHub PROXMOX_API_TOKEN, jamais ici (dépôt public).
# Mise en place côté Proxmox (template, pool, jeton) : docs/TUTORIEL.md, étape 8.

proxmox_endpoint = "https://10.1.98.5:8006/" # joignable depuis staging-1 (vérifié : HTTP 401 sans jeton)
proxmox_node     = "SRV-LNVO-PROD-02"        # nom exact du nœud (CN de son certificat), sensible à la casse

template_vm_id = 9000               # template Debian 13 cloud-init
pool_id        = "taskflow-preview" # seul pool sur lequel le jeton a des droits
datastore_id   = "syno-lun01"       # LUN iSCSI du Synology
bridge         = "vmbr0"
vlan_id        = 20 # comme net0 des autres VM (bridge=vmbr0,tag=20) ; sans tag, la VM est hors du réseau 10.1.20.x

# PR n° N -> 10.1.20.(100 + N % 10) : plage 10.1.20.100 à 10.1.20.109, réservée
# (hors DHCP, aucune autre machine dessus), couverte par la ressource Twingate 10.1.20.0/24.
ip_cidr       = "10.1.20.0/24"
ip_first_host = 100
ip_pool_size  = 10
# Même masque que staging-1, k8s-1 et k8s-2 (/8) : le connecteur Twingate (10.1.40.3)
# est joint en direct, sans passer par la passerelle.
ip_prefix_length = 8
gateway          = "10.1.20.1"
dns_servers      = ["8.8.8.8", "1.1.1.1"]
