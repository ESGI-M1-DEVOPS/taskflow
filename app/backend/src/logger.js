import pino from 'pino';

// Logs JSON sur stdout : collectés par Loki/Alloy (k8s) ou `docker logs` (compose).
// Le champ `level` est textuel (info, warn, error) pour filtrer par gravité dans Grafana.
const defaultLevel = process.env.NODE_TEST_CONTEXT ? 'silent' : 'info';

export const logger = pino({
  level: process.env.LOG_LEVEL || defaultLevel,
  base: { service: 'taskflow-backend', version: process.env.APP_VERSION || 'dev' },
  formatters: { level: (label) => ({ level: label }) },
  timestamp: pino.stdTimeFunctions.isoTime,
});
