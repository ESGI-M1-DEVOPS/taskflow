import client from 'prom-client';

// Registre Prometheus exposé sur /metrics.
// Les métriques HTTP couvrent 3 des 4 golden signals (trafic, erreurs, latence) ;
// la saturation vient des métriques process/Node.js par défaut et de cAdvisor.
export const register = new client.Registry();
client.collectDefaultMetrics({ register });

export const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Nombre de requêtes HTTP traitées',
  labelNames: ['method', 'route', 'status'],
  registers: [register],
});

export const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Durée de traitement des requêtes HTTP',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [register],
});

export const dbUp = new client.Gauge({
  name: 'taskflow_db_up',
  help: '1 si la base de données répond, 0 sinon',
  registers: [register],
});

export const tasksCreated = new client.Counter({
  name: 'taskflow_tasks_created_total',
  help: 'Nombre de tâches créées (métrique métier)',
  registers: [register],
});

const TECHNICAL_PATHS = new Set(['/health', '/ready', '/metrics']);

export function metricsMiddleware(req, res, next) {
  if (TECHNICAL_PATHS.has(req.path)) return next();
  const stopTimer = httpRequestDuration.startTimer();
  res.on('finish', () => {
    // On utilise le pattern de route (/api/tasks/:id) et pas l'URL brute
    // pour garder une cardinalité de labels maîtrisée.
    const route = req.route?.path ? `${req.baseUrl}${req.route.path}` : 'unmatched';
    const labels = { method: req.method, route, status: String(res.statusCode) };
    stopTimer(labels);
    httpRequestsTotal.inc(labels);
  });
  return next();
}
