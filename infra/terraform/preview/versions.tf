terraform {
  required_version = ">= 1.9"

  required_providers {
    proxmox = {
      source  = "bpg/proxmox"
      version = "~> 0.123.1"
    }
  }

  # État local, un fichier par PR, conservé sur le runner (staging-1) entre la création
  # et la destruction. Le chemin est donné à l'init par tf.sh :
  #   -backend-config="path=/state/pr-<n>.tfstate"
  backend "local" {}
}
