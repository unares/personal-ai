'use strict';

const { getDb, getAllProcessedFiles } = require('./db');

function buildNodes(entity) {
  const files = getAllProcessedFiles(entity);
  return files.map(f => ({
    id: f.id,
    label: (f.source_file || f.distilled_path || '').split('/').pop(),
    category: f.category,
    trust_score: f.trust_score,
    meaning_density: f.meaning_density || 0,
    hype_score: f.hype_score || 0
  }));
}

function extractTopTerms(text, limit = 8) {
  if (!text) return [];
  const stops = new Set([
    'the', 'and', 'for', 'that', 'this', 'with', 'from', 'are',
    'was', 'were', 'been', 'have', 'has', 'had', 'not', 'but',
    'what', 'all', 'can', 'will', 'one', 'our', 'out', 'about'
  ]);
  const freq = {};
  const words = text.toLowerCase().split(/\s+/).filter(
    w => w.length > 3 && !stops.has(w)
  );
  for (const w of words) freq[w] = (freq[w] || 0) + 1;
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([term]) => term);
}

function buildEdges(nodes) {
  const edges = [];
  const files = getAllProcessedFiles(nodes[0]?.entity || '');
  const fileMap = {};
  for (const f of files) fileMap[f.id] = f;

  // Same-category edges
  const byCategory = {};
  for (const n of nodes) {
    if (!byCategory[n.category]) byCategory[n.category] = [];
    byCategory[n.category].push(n);
  }
  for (const [cat, group] of Object.entries(byCategory)) {
    for (let i = 0; i < group.length && i < 5; i++) {
      for (let j = i + 1; j < group.length && j < 5; j++) {
        edges.push({
          source: group[i].id, target: group[j].id,
          type: 'same_category', label: cat
        });
      }
    }
  }

  // Keyword co-occurrence edges
  const termsByNode = {};
  for (const n of nodes) {
    const file = fileMap[n.id];
    termsByNode[n.id] = extractTopTerms(file?.body_preview || '');
  }
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      if (nodes[i].category === nodes[j].category) continue;
      const terms_i = new Set(termsByNode[nodes[i].id] || []);
      const terms_j = termsByNode[nodes[j].id] || [];
      const shared = terms_j.filter(t => terms_i.has(t));
      if (shared.length >= 2) {
        edges.push({
          source: nodes[i].id, target: nodes[j].id,
          type: 'keyword_overlap', label: shared.slice(0, 3).join(', ')
        });
      }
    }
  }

  return edges;
}

function generateMermaid(nodes, edges) {
  if (nodes.length < 5 || edges.length < 8) return null;
  const lines = ['graph TD'];
  for (const n of nodes) {
    const safe = (n.label || 'node').replace(/[^a-zA-Z0-9_.-]/g, '_');
    lines.push(`  N${n.id}["${safe} (${n.category})"]`);
  }
  for (const e of edges) {
    const label = (e.label || e.type).substring(0, 20);
    lines.push(`  N${e.source} -->|"${label}"| N${e.target}`);
  }
  return lines.join('\n');
}

function handleGraphSnapshot(req, res) {
  const { entity } = req.query;
  if (!entity) return res.status(400).json({ error: 'entity is required' });

  const nodes = buildNodes(entity);
  if (nodes.length === 0) {
    return res.json({ nodes: [], edges: [], metrics: { node_count: 0, edge_count: 0 } });
  }

  // Tag nodes with entity for buildEdges lookup
  const tagged = nodes.map(n => ({ ...n, entity }));
  const edges = buildEdges(tagged);
  const mermaid = generateMermaid(nodes, edges);

  const avgTrust = +(nodes.reduce((s, n) => s + n.trust_score, 0) / nodes.length).toFixed(3);
  const avgDensity = +(nodes.reduce((s, n) => s + n.meaning_density, 0) / nodes.length).toFixed(3);

  const response = {
    nodes, edges,
    metrics: {
      node_count: nodes.length,
      edge_count: edges.length,
      avg_trust: avgTrust,
      avg_density: avgDensity
    }
  };
  if (mermaid) response.mermaid_diagram = mermaid;
  res.json(response);
}

module.exports = { buildNodes, buildEdges, generateMermaid, handleGraphSnapshot };
