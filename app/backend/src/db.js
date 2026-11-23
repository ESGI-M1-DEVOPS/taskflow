import pg from 'pg';

/**
 * Pool PostgreSQL. Configuration 100 % par variables d'environnement :
 * DATABASE_URL, ou les variables standard PGHOST / PGPORT / PGDATABASE / PGUSER / PGPASSWORD.
 */
export function createPool() {
  return new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.PG_POOL_MAX) || 10,
    connectionTimeoutMillis: 3000,
  });
}

/**
 * Migrations versionnées, appliquées au démarrage.
 * Règle zero-downtime : pendant un rolling update, l'ancienne et la nouvelle version
 * tournent en même temps. Une migration doit donc rester compatible avec la version
 * précédente (ajout de colonne avec DEFAULT, jamais de suppression/renommage direct).
 */
export const MIGRATIONS = [
  {
    id: 1,
    description: 'création de la table tasks',
    sql: `CREATE TABLE IF NOT EXISTS tasks (
            id         SERIAL PRIMARY KEY,
            title      TEXT        NOT NULL,
            done       BOOLEAN     NOT NULL DEFAULT FALSE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
          )`,
  },
];

const MIGRATION_LOCK_ID = 727274; // verrou applicatif : plusieurs replicas démarrent en même temps

export async function migrate(pool, log) {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
                          id         INTEGER PRIMARY KEY,
                          applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
                        )`);
    for (const migration of MIGRATIONS) {
      const { rowCount } = await client.query('SELECT 1 FROM schema_migrations WHERE id = $1', [migration.id]);
      if (rowCount > 0) continue;
      await client.query('BEGIN');
      try {
        await client.query(migration.sql);
        await client.query('INSERT INTO schema_migrations (id) VALUES ($1)', [migration.id]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
      log.info({ migration: migration.id }, `migration appliquée : ${migration.description}`);
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]).catch(() => {});
    client.release();
  }
}

const TASK_COLUMNS = 'id, title, done, created_at AS "createdAt"';

export function createTaskRepo(pool) {
  return {
    async list() {
      const { rows } = await pool.query(`SELECT ${TASK_COLUMNS} FROM tasks ORDER BY id`);
      return rows;
    },
    async create(title) {
      const { rows } = await pool.query(`INSERT INTO tasks (title) VALUES ($1) RETURNING ${TASK_COLUMNS}`, [title]);
      return rows[0];
    },
    async setDone(id, done) {
      const { rows } = await pool.query(`UPDATE tasks SET done = $2 WHERE id = $1 RETURNING ${TASK_COLUMNS}`, [id, done]);
      return rows[0] ?? null;
    },
    async remove(id) {
      const { rowCount } = await pool.query('DELETE FROM tasks WHERE id = $1', [id]);
      return rowCount > 0;
    },
  };
}
