#!/usr/bin/env bash
# Installe Ansible sur le poste d'administration (VM staging, Linux ou WSL Ubuntu).
# Sous WSL : cloner le dépôt dans le home Linux (~), PAS dans /mnt/c, sinon Ansible
# ignore ansible.cfg (répertoire "world writable").
set -euo pipefail

# sudo seulement si on n'est pas root (en root, sudo n'est pas forcément installé).
SUDO=""
if [ "$(id -u)" -ne 0 ]; then SUDO="sudo"; fi

$SUDO apt-get update
$SUDO apt-get install -y python3-venv python3-pip

python3 -m venv "$HOME/.venvs/ansible"
"$HOME/.venvs/ansible/bin/pip" install --upgrade pip "ansible-core>=2.17"

cd "$(dirname "$0")/../infra/ansible"
"$HOME/.venvs/ansible/bin/ansible-galaxy" collection install -r requirements.yml

echo
echo "Ansible installé. Ajouter au PATH :"
echo "  export PATH=\"\$HOME/.venvs/ansible/bin:\$PATH\""
