#!/usr/bin/env bash
# Démo zero-downtime : interroge l'application en continu pendant un déploiement
# et compte les erreurs. Usage : ./scripts/check-availability.sh http://192.168.1.31
set -u
URL="${1:-http://localhost:8080}"
ok=0; ko=0
trap 'echo; echo "Résultat : $ok OK / $ko erreurs"; exit 0' INT

while true; do
  body=$(curl -s -m 2 -w ' %{http_code}' "$URL/api/version")
  code="${body##* }"
  if [ "$code" = "200" ]; then
    ok=$((ok + 1))
    version=$(echo "$body" | sed -E 's/.*"version":"([^"]+)".*"hostname":"([^"]+)".*/\1 (\2)/')
    printf '%s  OK   %s\n' "$(date +%T)" "$version"
  else
    ko=$((ko + 1))
    printf '%s  ERREUR HTTP %s\n' "$(date +%T)" "$code"
  fi
  sleep 0.2
done
