# Environnement de test temporaire d'une pull request : une VM Proxmox clonée depuis un
# template Debian 13 cloud-init. Créée par le job "preview" du pipeline, configurée ensuite
# par Ansible (playbooks/preview.yml), détruite à la fermeture de la PR (preview-cleanup.yml).

provider "proxmox" {
  endpoint  = var.proxmox_endpoint
  api_token = var.proxmox_api_token
  insecure  = var.proxmox_insecure
}

locals {
  name          = "taskflow-pr-${var.pr_number}"
  ip            = cidrhost(var.ip_cidr, var.ip_first_host + (var.pr_number % var.ip_pool_size))
  prefix_length = coalesce(var.ip_prefix_length, tonumber(split("/", var.ip_cidr)[1]))
}

resource "proxmox_virtual_environment_vm" "preview" {
  name        = local.name
  description = "Environnement de test de la PR #${var.pr_number} (TaskFlow). Créé et détruit par la CI : ne pas modifier à la main."
  tags        = ["taskflow", "preview", "pr-${var.pr_number}"]
  node_name   = var.proxmox_node
  vm_id       = var.vm_id_base + var.pr_number
  pool_id     = var.pool_id

  clone {
    vm_id        = var.template_vm_id
    datastore_id = var.datastore_id
    full         = true
  }

  cpu {
    cores = var.cores
    type  = "x86-64-v2-AES"
  }

  memory {
    dedicated = var.memory_mb
  }

  # Le disque du template (image cloud de ~3 Go) est agrandi ; cloud-init étend la partition.
  disk {
    datastore_id = var.datastore_id
    interface    = "scsi0"
    size         = var.disk_gb
    discard      = "on"
  }

  network_device {
    bridge = var.bridge
  }

  # Pas d'agent QEMU dans l'image cloud Debian : l'IP est fixe, donc connue sans lui.
  agent {
    enabled = false
  }

  # Sans agent, un arrêt "propre" peut attendre longtemps : on coupe la VM, elle est jetable.
  stop_on_destroy = true
  on_boot         = false

  initialization {
    datastore_id = var.datastore_id

    ip_config {
      ipv4 {
        address = "${local.ip}/${local.prefix_length}"
        gateway = var.gateway
      }
    }

    dns {
      servers = var.dns_servers
    }

    # Même compte que sur les autres VM : Ansible s'y connecte avec la clé de la CI.
    user_account {
      username = "admin"
      keys     = compact([trimspace(var.ssh_public_key)])
    }
  }
}
