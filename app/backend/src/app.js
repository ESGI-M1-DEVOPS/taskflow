import os from 'node:os';
import express from 'express';
import { pinoHttp } from 'pino-http';
import { logger } from './logger.js';
import { register, metricsMiddleware, tasksCreated } from './metrics.js';

const QUIET_PATHS = new Set(['/health', '/ready', '/metrics']);

function parseId(raw) {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Construit l'application Express.
 * Le dépôt de données est injecté pour pouvoir tester sans PostgreSQL.
 */
export function createApp({ repo, version = 'dev', isReady = async () => true, debugEndpoints = false }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '10kb' }));
  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => QUIET_PATHS.has(req.url) } }));
  app.use(metricsMiddleware);

  // --- Endpoints techniques (contrat d'intégration avec la plateforme) ---
  // Liveness : le process répond. Ne dépend PAS de la BDD (sinon k8s redémarre en boucle).
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  // Readiness : prêt à recevoir du trafic (BDD joignable, pas en cours d'arrêt).
  app.get('/ready', async (_req, res) => {
    const ready = await isReady();
    res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not-ready' });
  });

  app.get('/metrics', async (_req, res) => {
    res.set('Content-Type', register.contentType);
    res.send(await register.metrics());
  });

  // --- API métier ---
  const api = express.Router();

  api.get('/version', (_req, res) => {
    res.json({ service: 'backend', version, hostname: os.hostname() });
  });

  api.get('/tasks', async (_req, res) => {
    res.json(await repo.list());
  });

  api.post('/tasks', async (req, res) => {
    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
    if (!title || title.length > 200) {
      return res.status(400).json({ error: 'Le titre est obligatoire (1 à 200 caractères)' });
    }
    const task = await repo.create(title);
    tasksCreated.inc();
    req.log.info({ taskId: task.id }, 'tâche créée');
    return res.status(201).json(task);
  });

  api.patch('/tasks/:id', async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Identifiant invalide' });
    if (typeof req.body?.done !== 'boolean') {
      return res.status(400).json({ error: 'Le champ "done" (booléen) est obligatoire' });
    }
    const task = await repo.setDone(id, req.body.done);
    if (!task) return res.status(404).json({ error: 'Tâche introuvable' });
    return res.json(task);
  });

  api.delete('/tasks/:id', async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Identifiant invalide' });
    const deleted = await repo.remove(id);
    if (!deleted) return res.status(404).json({ error: 'Tâche introuvable' });
    return res.status(204).end();
  });

  // Endpoints de démonstration (auto-scaling, dashboard d'erreurs).
  // Activés uniquement si DEBUG_ENDPOINTS=true : ne jamais les exposer en vraie prod.
  if (debugEndpoints) {
    api.get('/debug/cpu', (req, res) => {
      const ms = Math.min(Number(req.query.ms) || 100, 2000);
      const end = Date.now() + ms;
      while (Date.now() < end) {
        // boucle active volontaire pour consommer du CPU
      }
      res.json({ burnedMs: ms, hostname: os.hostname() });
    });
    api.get('/debug/error', () => {
      throw new Error('Erreur volontaire (démo observabilité)');
    });
  }

  app.use('/api', api);

  app.use((_req, res) => res.status(404).json({ error: 'Ressource introuvable' }));

  app.use((err, req, res, _next) => {
    const status = err.status || err.statusCode || 500;
    if (status >= 500) {
      req.log.error({ err }, 'erreur non gérée');
      return res.status(status).json({ error: 'Erreur interne' });
    }
    return res.status(status).json({ error: err.expose ? err.message : 'Requête invalide' });
  });

  return app;
}
