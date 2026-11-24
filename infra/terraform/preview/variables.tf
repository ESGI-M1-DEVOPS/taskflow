# --- Fournis par la CI ---

variable "pr_number" {
  description = "Numéro de la pull request : il donne le nom, l'identifiant et l'IP de la VM."
  type        = number

  validation {
    condition     = var.pr_number > 0 && floor(var.pr_number) == var.pr_number
    error_message = "pr_number doit être un entier positif."
  }
}

variable "proxmox_api_token" {
  description = "Jeton API Proxmox, au format utilisateur@realm!id=secret (secret GitHub PROXMOX_API_TOKEN)."
  type        = string
  sensitive   = true
}

variable "ssh_public_key" {
  description = "Clé publique SSH déposée par cloud-init pour l'utilisateur admin (dérivée de ANSIBLE_SSH_PRIVATE_KEY)."
  type        = string
  default     = "" # inutile pour un destroy
}

# --- Proxmox (valeurs dans terraform.tfvars) ---

variable "proxmox_endpoint" {
  description = "URL de l'API Proxmox, joignable depuis le runner (staging-1)."
  type        = string

  validation {
    condition     = can(regex("^https://[^/]+:8006/?$", var.proxmox_endpoint)) && !strcontains(var.proxmox_endpoint, "A-RENSEIGNER")
    error_message = "proxmox_endpoint doit ressembler à https://<ip>:8006/ (à renseigner dans terraform.tfvars)."
  }
}

variable "proxmox_insecure" {
  description = "Accepter le certificat autosigné de Proxmox (installation par défaut)."
  type        = bool
  default     = true
}

variable "proxmox_node" {
  description = "Nom du nœud Proxmox qui héberge le template et les VM de PR."
  type        = string

  validation {
    condition     = var.proxmox_node != "A-RENSEIGNER"
    error_message = "proxmox_node est à renseigner dans terraform.tfvars."
  }
}

variable "template_vm_id" {
  description = "ID du template Debian 13 cloud-init à cloner (voir docs/TUTORIEL.md, étape 8)."
  type        = number
}

variable "pool_id" {
  description = "Pool Proxmox des VM de PR : le jeton API n'a de droits que sur ce pool, jamais sur la production."
  type        = string
}

variable "datastore_id" {
  description = "Stockage des disques des VM de PR."
  type        = string
}

variable "bridge" {
  description = "Bridge réseau des VM (le même que staging-1, k8s-1 et k8s-2)."
  type        = string
}

variable "vlan_id" {
  description = "Tag VLAN de la carte réseau (celui de net0 sur staging-1, k8s-1 et k8s-2) ; null = sans tag."
  type        = number
  default     = null
}

variable "vm_id_base" {
  description = "ID de VM = vm_id_base + numéro de PR (ex. 9100 + 12 = 9112)."
  type        = number
  default     = 9100
}

# --- Réseau : IP fixe déduite du numéro de PR ---

variable "ip_cidr" {
  description = "Sous-réseau des VM."
  type        = string
}

variable "ip_prefix_length" {
  description = "Masque appliqué à la VM ; null = celui de ip_cidr."
  type        = number
  default     = null
}

variable "ip_first_host" {
  description = "Première adresse de la plage réservée aux PR (numéro d'hôte dans ip_cidr)."
  type        = number
}

variable "ip_pool_size" {
  description = "Taille de la plage : IP = ip_first_host + (numéro de PR modulo ip_pool_size)."
  type        = number

  validation {
    condition     = var.ip_pool_size > 0
    error_message = "ip_pool_size doit être strictement positif."
  }
}

variable "gateway" {
  description = "Passerelle du sous-réseau."
  type        = string

  validation {
    condition     = can(cidrhost("${var.gateway}/32", 0))
    error_message = "gateway doit être une adresse IPv4 (à renseigner dans terraform.tfvars)."
  }
}

variable "dns_servers" {
  description = "Serveurs DNS des VM."
  type        = list(string)
}

# --- Gabarit de la VM ---

variable "cores" {
  description = "vCPU de la VM de PR."
  type        = number
  default     = 2
}

variable "memory_mb" {
  description = "RAM de la VM de PR (le rôle Ansible common exige au moins 1800 Mo)."
  type        = number
  default     = 2048
}

variable "disk_gb" {
  description = "Taille du disque système."
  type        = number
  default     = 16
}
