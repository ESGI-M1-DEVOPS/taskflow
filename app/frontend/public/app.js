'use strict';

const form = document.getElementById('task-form');
const input = document.getElementById('task-title');
const list = document.getElementById('task-list');
const empty = document.getElementById('empty');
const errorBox = document.getElementById('error');
const versions = document.getElementById('versions');

async function api(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Erreur HTTP ${res.status}`);
  }
  return res.status === 204 ? null : res.json();
}

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = !message;
}

function render(tasks) {
  list.replaceChildren();
  empty.hidden = tasks.length > 0;
  document.getElementById('remaining').textContent = `${tasks.filter((t) => !t.done).length} tâche(s) restante(s)`;
  for (const task of tasks) {
    const li = document.createElement('li');
    li.className = task.done ? 'task done' : 'task';
    li.dataset.id = task.id;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = `task-${task.id}`;
    checkbox.checked = task.done;
    checkbox.className = 'toggle';

    const label = document.createElement('label');
    label.htmlFor = checkbox.id;
    label.textContent = task.title;

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'delete';
    del.title = 'Supprimer';
    del.textContent = '✕';

    li.append(checkbox, label, del);
    list.append(li);
  }
}

async function refresh() {
  try {
    render(await api('/tasks'));
    showError('');
  } catch (err) {
    showError(`Impossible de charger les tâches : ${err.message}`);
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const title = input.value.trim();
  if (!title) return;
  try {
    await api('/tasks', { method: 'POST', body: JSON.stringify({ title }) });
    input.value = '';
    await refresh();
  } catch (err) {
    showError(err.message);
  }
});

list.addEventListener('change', async (event) => {
  if (!event.target.classList.contains('toggle')) return;
  const id = event.target.closest('li').dataset.id;
  try {
    await api(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify({ done: event.target.checked }) });
    await refresh();
  } catch (err) {
    showError(err.message);
  }
});

list.addEventListener('click', async (event) => {
  if (!event.target.classList.contains('delete')) return;
  const id = event.target.closest('li').dataset.id;
  try {
    await api(`/tasks/${id}`, { method: 'DELETE' });
    await refresh();
  } catch (err) {
    showError(err.message);
  }
});

// Affiche les versions déployées : pratique pour voir un rolling update en direct
// et le pod backend qui a répondu (répartition de charge entre replicas).
async function refreshVersions() {
  try {
    const [front, back] = await Promise.all([
      fetch('/version').then((r) => r.json()),
      api('/version'),
    ]);
    versions.textContent = `frontend ${front.version} · backend ${back.version} (pod ${back.hostname})`;
  } catch {
    versions.textContent = 'versions indisponibles';
  }
}

refresh();
refreshVersions();
setInterval(refreshVersions, 5000);
