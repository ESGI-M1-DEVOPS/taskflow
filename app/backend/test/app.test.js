import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';

// Dépôt en mémoire : les tests unitaires ne dépendent pas de PostgreSQL.
function memoryRepo() {
  let tasks = [];
  let nextId = 1;
  return {
    async list() {
      return tasks;
    },
    async create(title) {
      const task = { id: nextId++, title, done: false, createdAt: new Date().toISOString() };
      tasks.push(task);
      return task;
    },
    async setDone(id, done) {
      const task = tasks.find((t) => t.id === id);
      if (!task) return null;
      task.done = done;
      return task;
    },
    async remove(id) {
      const before = tasks.length;
      tasks = tasks.filter((t) => t.id !== id);
      return tasks.length < before;
    },
  };
}

describe('endpoints techniques', () => {
  test('GET /health répond 200', async () => {
    const app = createApp({ repo: memoryRepo() });
    const res = await request(app).get('/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ok');
  });

  test('GET /ready répond 503 si la base n\'est pas prête', async () => {
    const app = createApp({ repo: memoryRepo(), isReady: async () => false });
    const res = await request(app).get('/ready');
    assert.equal(res.status, 503);
  });

  test('GET /ready répond 200 quand tout est prêt', async () => {
    const app = createApp({ repo: memoryRepo(), isReady: async () => true });
    const res = await request(app).get('/ready');
    assert.equal(res.status, 200);
  });

  test('GET /metrics expose les métriques Prometheus', async () => {
    const app = createApp({ repo: memoryRepo() });
    await request(app).get('/api/tasks');
    const res = await request(app).get('/metrics');
    assert.equal(res.status, 200);
    assert.match(res.text, /http_requests_total\{method="GET",route="\/api\/tasks",status="200"\}/);
    assert.match(res.text, /http_request_duration_seconds_bucket/);
  });

  test('GET /api/version renvoie la version de l\'image', async () => {
    const app = createApp({ repo: memoryRepo(), version: 'abc1234' });
    const res = await request(app).get('/api/version');
    assert.equal(res.body.version, 'abc1234');
    assert.ok(res.body.hostname);
  });
});

describe('API /api/tasks', () => {
  let app;
  beforeEach(() => {
    app = createApp({ repo: memoryRepo() });
  });

  test('crée puis liste une tâche', async () => {
    const created = await request(app).post('/api/tasks').send({ title: '  Écrire le Dockerfile  ' });
    assert.equal(created.status, 201);
    assert.equal(created.body.title, 'Écrire le Dockerfile');
    assert.equal(created.body.done, false);

    const list = await request(app).get('/api/tasks');
    assert.equal(list.status, 200);
    assert.equal(list.body.length, 1);
  });

  test('refuse un titre vide', async () => {
    const res = await request(app).post('/api/tasks').send({ title: '   ' });
    assert.equal(res.status, 400);
  });

  test('refuse un titre trop long', async () => {
    const res = await request(app).post('/api/tasks').send({ title: 'x'.repeat(201) });
    assert.equal(res.status, 400);
  });

  test('refuse un JSON mal formé', async () => {
    const res = await request(app).post('/api/tasks').set('Content-Type', 'application/json').send('{"title":');
    assert.equal(res.status, 400);
  });

  test('marque une tâche comme faite', async () => {
    const { body: task } = await request(app).post('/api/tasks').send({ title: 'Configurer le HPA' });
    const res = await request(app).patch(`/api/tasks/${task.id}`).send({ done: true });
    assert.equal(res.status, 200);
    assert.equal(res.body.done, true);
  });

  test('PATCH exige un booléen', async () => {
    const { body: task } = await request(app).post('/api/tasks').send({ title: 'x' });
    const res = await request(app).patch(`/api/tasks/${task.id}`).send({ done: 'oui' });
    assert.equal(res.status, 400);
  });

  test('PATCH sur une tâche inexistante renvoie 404', async () => {
    const res = await request(app).patch('/api/tasks/999').send({ done: true });
    assert.equal(res.status, 404);
  });

  test('supprime une tâche', async () => {
    const { body: task } = await request(app).post('/api/tasks').send({ title: 'À supprimer' });
    assert.equal((await request(app).delete(`/api/tasks/${task.id}`)).status, 204);
    assert.equal((await request(app).delete(`/api/tasks/${task.id}`)).status, 404);
  });

  test('identifiant invalide renvoie 400', async () => {
    const res = await request(app).delete('/api/tasks/abc');
    assert.equal(res.status, 400);
  });
});

describe('endpoints de démo', () => {
  test('désactivés par défaut', async () => {
    const app = createApp({ repo: memoryRepo() });
    assert.equal((await request(app).get('/api/debug/cpu')).status, 404);
  });

  test('/api/debug/error renvoie 500 quand activé', async () => {
    const app = createApp({ repo: memoryRepo(), debugEndpoints: true });
    const res = await request(app).get('/api/debug/error');
    assert.equal(res.status, 500);
    assert.equal(res.body.error, 'Erreur interne');
  });
});
