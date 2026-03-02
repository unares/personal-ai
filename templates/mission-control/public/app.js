'use strict';
// Mission Control — Little Guys dashboard

const PROJECTS = ['personal-ai', 'procenteo', 'inisio'];
const COLORS = {
  indigo:  '#6366f1',
  amber:   '#f59e0b',
  emerald: '#10b981',
  rose:    '#f43f5e',
};

let currentProject = PROJECTS[0];
let currentColor   = 'indigo';
let pollHandle     = null;

// ── Boot ────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  buildProjectTabs();
  bindColorPicker();
  bindArtifacts();
  bindSpawnModal();
  bindGuyClicks();
  applyColor('indigo');
  startPolling();
});

// ── Project tabs ────────────────────────────────────────────────

function buildProjectTabs() {
  const container = document.getElementById('project-tabs');
  PROJECTS.forEach(p => {
    const btn = document.createElement('button');
    btn.className = 'project-tab' + (p === currentProject ? ' active' : '');
    btn.textContent = p;
    btn.dataset.project = p;
    btn.addEventListener('click', () => {
      currentProject = p;
      document.querySelectorAll('.project-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('activity-project-label').textContent = `— ${p}`;
      refreshAll();
    });
    container.appendChild(btn);
  });
  document.getElementById('activity-project-label').textContent = `— ${currentProject}`;
}

// ── Color picker ────────────────────────────────────────────────

function bindColorPicker() {
  document.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      applyColor(chip.dataset.color);
      document.querySelectorAll('.chip').forEach(c => c.classList.remove('selected'));
      chip.classList.add('selected');
    });
  });
}

function applyColor(colorName) {
  currentColor = colorName;
  const hex = COLORS[colorName] || COLORS.indigo;
  document.documentElement.style.setProperty('--guy-color', hex);
  document.documentElement.style.setProperty('--accent', hex);
  localStorage.setItem('mc-color', colorName);
}

// ── Star artifact → Northstar modal ─────────────────────────────

function bindArtifacts() {
  document.getElementById('star-artifact').addEventListener('click', openNorthstar);
  document.getElementById('close-modal').addEventListener('click', closeNorthstar);
  document.getElementById('northstar-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeNorthstar();
  });
  document.getElementById('factory-artifact').addEventListener('click', () => {
    document.getElementById('spawn-role').value = 'mvp-builder';
    openSpawnModal();
  });
}

async function openNorthstar() {
  try {
    const res = await fetch(`/api/northstar/${currentProject}`);
    const text = res.ok ? await res.text() : '(northstar not found)';
    document.getElementById('northstar-title').textContent = `Northstar — ${currentProject}`;
    document.getElementById('northstar-content').textContent = text;
    document.getElementById('northstar-modal').classList.remove('hidden');
  } catch (e) {
    document.getElementById('northstar-content').textContent = 'Error loading northstar.';
    document.getElementById('northstar-modal').classList.remove('hidden');
  }
}
function closeNorthstar() {
  document.getElementById('northstar-modal').classList.add('hidden');
}

// ── Figurine clicks → summary card (inline status update) ────────

function bindGuyClicks() {
  document.querySelectorAll('.guy').forEach(guy => {
    guy.addEventListener('click', async () => {
      const role = guy.dataset.role;
      try {
        const res = await fetch(`/api/sandboxes`);
        const sandboxes = await res.json();
        const active = sandboxes.filter(s => s.role === role && s.status === 'running');
        alert(`${role.toUpperCase()}\nActive instances: ${active.length}\n${active.map(s => `• ${s.id} (${s.project_id})`).join('\n') || 'none'}`);
      } catch (_) {}
    });
  });
}

// ── Spawn modal ──────────────────────────────────────────────────

function bindSpawnModal() {
  document.getElementById('spawn-btn').addEventListener('click', openSpawnModal);
  document.getElementById('close-spawn-modal').addEventListener('click', closeSpawnModal);
  document.getElementById('spawn-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeSpawnModal();
  });
  document.getElementById('spawn-form').addEventListener('submit', handleSpawn);
}

function openSpawnModal() {
  document.getElementById('spawn-project').value = currentProject;
  document.getElementById('spawn-result').textContent = '';
  document.getElementById('spawn-result').className = '';
  document.getElementById('spawn-modal').classList.remove('hidden');
}
function closeSpawnModal() {
  document.getElementById('spawn-modal').classList.add('hidden');
}

async function handleSpawn(e) {
  e.preventDefault();
  const role    = document.getElementById('spawn-role').value;
  const name    = document.getElementById('spawn-name').value.trim().toLowerCase().replace(/\s+/g, '-');
  const project = document.getElementById('spawn-project').value;
  const result  = document.getElementById('spawn-result');

  try {
    const res = await fetch('/api/spawn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, name, project }),
    });
    const data = await res.json();
    if (data.ok) {
      result.textContent = `✅ Spawned: ${data.id}`;
      result.className = 'ok';
      refreshAll();
      setTimeout(closeSpawnModal, 1500);
    } else {
      result.textContent = `❌ ${data.error}`;
      result.className = 'err';
    }
  } catch (err) {
    result.textContent = `❌ ${err.message}`;
    result.className = 'err';
  }
}

// ── Stop sandbox ────────────────────────────────────────────────

async function stopSandbox(id) {
  if (!confirm(`Stop ${id}?`)) return;
  await fetch(`/api/stop/${id}`, { method: 'POST' });
  refreshAll();
}

// ── Polling ─────────────────────────────────────────────────────

function startPolling() {
  refreshAll();
  pollHandle = setInterval(refreshAll, 10000);
}

async function refreshAll() {
  await Promise.all([refreshSandboxes(), refreshActivity()]);
}

// ── Sandbox table ────────────────────────────────────────────────

async function refreshSandboxes() {
  try {
    const [sandboxRes, costsRes] = await Promise.all([
      fetch('/api/sandboxes'),
      fetch('/api/costs'),
    ]);
    const sandboxes = await sandboxRes.json();
    const costs     = await costsRes.json();

    const costMap = {};
    costs.forEach(c => { costMap[c.sandbox_id] = c; });

    const tbody = document.getElementById('sandbox-tbody');
    tbody.innerHTML = '';

    // Update status dots
    const clarkActive = sandboxes.some(s => s.role === 'clark'   && s.status === 'running');
    const aiooActive  = sandboxes.some(s => s.role === 'aioo'    && s.status === 'running');
    document.getElementById('clark-status').className = 'status-dot' + (clarkActive ? ' active' : '');
    document.getElementById('aioo-status').className  = 'status-dot' + (aiooActive  ? ' active' : '');

    // WhatsApp badge
    const waStatus = document.getElementById('wa-status');
    waStatus.textContent = (clarkActive && aiooActive) ? 'connected' : 'offline';
    waStatus.style.color  = (clarkActive && aiooActive) ? '#10b981' : '#888';

    sandboxes.forEach(s => {
      const c = costMap[s.id] || { total_cost: 0, event_count: 0 };
      const roleCls = s.role === 'clark' ? 'role-clark'
                    : s.role === 'aioo'  ? 'role-aioo'
                    : 'role-builder';
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${s.name}</td>
        <td><span class="role-badge ${roleCls}">${s.role}</span></td>
        <td>${s.project_id}</td>
        <td>$${(c.total_cost || 0).toFixed(4)}</td>
        <td>${c.event_count || 0}</td>
        <td>${s.status === 'running'
          ? `<button class="btn btn-danger" onclick="stopSandbox('${s.id}')">Stop</button>`
          : `<span class="status-stopped">stopped</span>`}</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (_) {}
}

// ── Activity feed ────────────────────────────────────────────────

async function refreshActivity() {
  try {
    const res    = await fetch(`/api/events?project=${currentProject}&limit=20`);
    const events = await res.json();
    const list   = document.getElementById('event-list');
    list.innerHTML = '';

    events.forEach(ev => {
      const li = document.createElement('li');
      const t  = new Date(ev.created_at + 'Z');
      const ts = t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      li.innerHTML = `
        <span class="ev-time">${ts}</span>
        <span class="ev-type">${ev.event_type}</span>
        <span class="ev-text">${escHtml(ev.content.slice(0, 120))}</span>
      `;
      list.appendChild(li);
    });
  } catch (_) {}
}

// ── Utils ────────────────────────────────────────────────────────

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Restore saved color
const savedColor = localStorage.getItem('mc-color');
if (savedColor && COLORS[savedColor]) {
  document.addEventListener('DOMContentLoaded', () => {
    applyColor(savedColor);
    const chip = document.querySelector(`.chip[data-color="${savedColor}"]`);
    if (chip) chip.classList.add('selected');
  });
}
