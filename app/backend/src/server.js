import { createApp } from './app.js';
import { createPool, createTaskRepo, migrate } from './db.js';
import { logger } from './logger.js';
import { dbUp } from './metrics.js';

const PORT = Number(process.env.PORT) || 3000;
const VERSION = process.env.APP_VERSION || 'dev';
// Délai entre SIGTERM et la fermeture du serveur : laisse le temps au load balancer
// (Service k8s / nginx) de retirer le pod avant qu'il refuse les connexions.
const SHUTDOWN_DELAY_MS = Number(process.env.SHUTDOWN_DELAY_MS ?? 5000);

const pool = createPool();
pool.on('error', (err) => logger.error({ err }, 'erreur du pool PostgreSQL'));

let migrated = false;
let shuttingDown = false;

async function isReady() {
  if (shuttingDown || !migrated) return false;
  try {
    await pool.query('SELECT 1');
    dbUp.set(1);
    return true;
  } catch (err) {
    dbUp.set(0);
    logger.warn({ err: err.message }, 'base de données injoignable');
    return false;
  }
}

async function migrateWithRetry() {
  for (let attempt = 1; !shuttingDown; attempt += 1) {
    try {
      await migrate(pool, logger);
      migrated = true;
      dbUp.set(1);
      logger.info('base de données prête');
      return;
    } catch (err) {
      dbUp.set(0);
      const delay = Math.min(1000 * attempt, 10000);
      logger.warn({ attempt, err: err.message }, `base indisponible, nouvel essai dans ${delay} ms`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

const app = createApp({
  repo: createTaskRepo(pool),
  version: VERSION,
  isReady,
  debugEndpoints: process.env.DEBUG_ENDPOINTS === 'true',
});

// On écoute tout de suite : /health répond même si la BDD n'est pas encore là,
// et /ready reste à 503 tant que les migrations ne sont pas passées.
const server = app.listen(PORT, () => {
  logger.info({ port: PORT, version: VERSION }, 'TaskFlow backend démarré');
});
migrateWithRetry();

// Vérification périodique de la BDD : la métrique taskflow_db_up reste à jour
// même sans sonde de readiness (docker compose).
setInterval(() => {
  if (migrated) isReady();
}, 10000).unref();

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal, delayMs: SHUTDOWN_DELAY_MS }, 'arrêt demandé : readiness à 503, fin des requêtes en cours');
  setTimeout(() => {
    server.close(async () => {
      await pool.end().catch(() => {});
      logger.info('arrêt propre terminé');
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  }, SHUTDOWN_DELAY_MS);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
