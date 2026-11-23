# syntax=docker/dockerfile:1
# Image PostgreSQL de TaskFlow : base officielle + réglages de logs + healthcheck.
# Le schéma est géré par les migrations du backend (versionnées avec le code).
# Aucun mot de passe par défaut : POSTGRES_PASSWORD doit être fourni au déploiement.
FROM postgres:17-alpine

ENV POSTGRES_DB=taskflow \
    POSTGRES_USER=taskflow \
    PGDATA=/var/lib/postgresql/data/pgdata

HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=5 \
  CMD pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" || exit 1

# Log des requêtes lentes (> 500 ms) pour l'analyse de la latence.
CMD ["postgres", "-c", "log_min_duration_statement=500", "-c", "log_line_prefix=%m [%p] %q%u@%d "]
