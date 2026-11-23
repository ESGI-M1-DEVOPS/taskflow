# syntax=docker/dockerfile:1
# Image nginx non-root (écoute sur 8080) : compatible avec les plateformes qui interdisent root.
FROM nginxinc/nginx-unprivileged:1.28-alpine

COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY public/ /usr/share/nginx/html/

# Valeurs par défaut, surchargeables au déploiement (docker compose / k8s).
# NGINX_ENTRYPOINT_LOCAL_RESOLVERS : l'entrypoint exporte NGINX_LOCAL_RESOLVERS depuis /etc/resolv.conf.
# BACKEND_URL : nom résolu par le DNS sans domaine de recherche => FQDN en Kubernetes.
ARG APP_VERSION=dev
ENV BACKEND_URL=http://backend:3000 \
    APP_VERSION=${APP_VERSION} \
    NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1

EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
