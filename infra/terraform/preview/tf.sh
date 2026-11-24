#!/usr/bin/env bash
# Lance Terraform pour l'environnement de test d'une pull request.
#   bash infra/terraform/preview/tf.sh <numéro de PR> <commande terraform...>
#   ex. : tf.sh 12 apply -auto-approve      tf.sh 12 output -raw ip      tf.sh 12 destroy -auto-approve
#
# - Terraform tourne dans son image Docker officielle, version figée : rien à installer sur le runner.
# - Un état par PR, conservé sur le runner entre la création et la destruction :
#   ~/taskflow-preview/pr-<n>.tfstate (+ cache des providers).
# - Variables lues dans l'environnement : TF_VAR_proxmox_api_token (obligatoire),
#   TF_VAR_ssh_public_key (pour apply).
set -euo pipefail

TF_IMAGE="hashicorp/terraform:1.17.2"

pr="${1:?usage : tf.sh <numéro de PR> <commande terraform...>}"
shift
[[ "$pr" =~ ^[1-9][0-9]*$ ]] || { echo "Numéro de PR invalide : $pr" >&2; exit 2; }
: "${TF_VAR_proxmox_api_token:?TF_VAR_proxmox_api_token manquant (secret PROXMOX_API_TOKEN)}"

here="$(cd "$(dirname "$0")" && pwd)"
state_dir="${PREVIEW_STATE_DIR:-$HOME/taskflow-preview}"
mkdir -p "$state_dir/plugin-cache"

tf() {
  # Le jeton et la clé passent par l'environnement (-e NOM sans valeur) : ils n'apparaissent
  # ni dans la ligne de commande ni dans les logs.
  docker run --rm \
    --user "$(id -u):$(id -g)" \
    -e HOME=/tmp -e TF_IN_AUTOMATION=1 -e TF_INPUT=0 \
    -e TF_PLUGIN_CACHE_DIR=/state/plugin-cache \
    -e TF_VAR_pr_number="$pr" \
    -e TF_VAR_proxmox_api_token \
    -e TF_VAR_ssh_public_key \
    -v "$here:/work" -v "$state_dir:/state" -w /work \
    "$TF_IMAGE" "$@"
}

tf init -reconfigure -backend-config="path=/state/pr-$pr.tfstate" > /dev/null
tf "$@"
