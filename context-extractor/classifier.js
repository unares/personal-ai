'use strict';

const CATEGORY_PATTERNS = {
  personal_story: [
    /\b(I felt|I learned|I realized|my experience|personally|my journey)\b/i,
    /\b(anxious|excited|frustrated|proud|relieved|overwhelmed)\b/i,
    /\b(I struggled|I noticed|I decided|my mistake|my lesson)\b/i,
    /\b(working style|identity|growth edge|personality|habit)\b/i
  ],
  shared_story: [
    /\b(we decided|the team|our meeting|together|collaborat|partner|co-founder)\b/i,
    /\b(user feedback|customer|investor|client|demo|pitch)\b/i,
    /\b(brand|marketing|go-to-market|launch|direction change)\b/i
  ],
  specification: [
    /\b(must|shall|acceptance|criteria|constraint|endpoint|schema|API)\b/i,
    /\b(implement|deploy|test case|architecture|pipeline)\b/i,
    /\b(function|class|interface|module|docker|container)\b/i
  ]
};

/**
 * Parse markdown text into sections split by ## headers.
 * Returns array of { header: string|null, content: string }
 * Content before the first ## gets header: null (preamble).
 * No ## headers → single section with full text.
 */
function parseSections(text) {
  const lines = text.split('\n');
  const sections = [];
  let currentHeader = null;
  let currentLines = [];

  for (const line of lines) {
    // Match ## or ### headers (but not # — that's title-level)
    if (/^#{2,3}\s+/.test(line)) {
      // Push previous section if it has content
      if (currentLines.length > 0) {
        sections.push({
          header: currentHeader,
          content: currentLines.join('\n').trim()
        });
      }
      currentHeader = line.trim();
      currentLines = [line];
    } else {
      currentLines.push(line);
    }
  }

  // Push final section
  if (currentLines.length > 0) {
    const content = currentLines.join('\n').trim();
    if (content) {
      sections.push({ header: currentHeader, content });
    }
  }

  // Graceful fallback: no sections parsed → single section with full text
  if (sections.length === 0) {
    sections.push({ header: null, content: text.trim() });
  }

  return sections;
}

/**
 * Build human-name-aware regex patterns from config.
 * These match third-person references like "Michal thinks", "about Michal", "Michal's".
 */
function buildHumanPatterns(config) {
  const names = new Set();

  // Owner is always a human name
  if (config.owner) {
    names.add(config.owner);
  }

  // Each entity may have a human collaborator
  if (config.entities) {
    for (const entity of config.entities) {
      if (entity.human) {
        names.add(entity.human);
      }
    }
  }

  const patterns = [];
  for (const name of names) {
    // Capitalize first letter for pattern matching
    const capitalized = name.charAt(0).toUpperCase() + name.slice(1);
    const lower = name.toLowerCase();
    // Match: "Michal thinks", "Michal's experience", "about Michal", "who is Michal"
    patterns.push(new RegExp(`\\b${capitalized}(?:'s)?\\s+(?:thinks|feels|believes|works|experience|approach|style|way)`, 'g'));
    patterns.push(new RegExp(`\\b(?:about|who is|who's)\\s+${capitalized}\\b`, 'gi'));
    patterns.push(new RegExp(`\\b${capitalized}'s\\s+(?:experience|journey|style|approach|way|identity|growth|habit|preference)`, 'g'));
    // Also match lowercase in flowing text
    patterns.push(new RegExp(`\\b${lower}\\b`, 'gi'));
  }

  return patterns;
}

/**
 * Score text against category patterns.
 * No sampling limit — sections are already small.
 * Optional humanPatterns array scores matches toward personal_story.
 */
function scoreCategories(text, humanPatterns) {
  const scores = { personal_story: 0, shared_story: 0, specification: 0 };

  for (const [cat, patterns] of Object.entries(CATEGORY_PATTERNS)) {
    for (const p of patterns) {
      const matches = (text.match(new RegExp(p, 'gi')) || []).length;
      scores[cat] += matches;
    }
  }

  // Human-name patterns boost personal_story
  if (humanPatterns) {
    for (const p of humanPatterns) {
      const matches = (text.match(p) || []).length;
      scores.personal_story += matches;
    }
  }

  return scores;
}

/**
 * Classify each section independently.
 * Returns { personal_story: [section, ...], specification: [...], shared_story: [...] }
 * Sections matching multiple categories appear in multiple arrays.
 * Sections matching nothing default to shared_story.
 */
function classifySections(sections, humanPatterns) {
  const categoryMap = {
    personal_story: [],
    shared_story: [],
    specification: []
  };

  for (const section of sections) {
    const scores = scoreCategories(section.content, humanPatterns);
    const detected = Object.entries(scores)
      .filter(([, s]) => s > 0)
      .map(([c]) => c);

    if (detected.length === 0) {
      // No matches → default to shared_story
      categoryMap.shared_story.push(section);
    } else {
      for (const cat of detected) {
        categoryMap[cat].push(section);
      }
    }
  }

  return categoryMap;
}

/**
 * Classify entire text (legacy — used by other callers).
 */
function classify(text) {
  const scores = scoreCategories(text);
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const primary = sorted[0][1] > 0 ? sorted[0][0] : 'shared_story';
  const allDetected = sorted
    .filter(([, s]) => s > 0)
    .map(([c]) => c)
    .slice(0, 3);

  return {
    primary,
    scores,
    all_detected: allDetected.length > 0 ? allDetected : [primary]
  };
}

/**
 * Build per-entity regex patterns from config.
 * Returns { entityName: [RegExp, ...] }
 * Each entity matches on its name + its human collaborator's name.
 */
function buildEntityPatterns(config) {
  const patterns = {};
  if (!config.entities) return patterns;

  for (const entity of config.entities) {
    const entityPatterns = [new RegExp(`\\b${entity.name}\\b`, 'gi')];
    if (entity.human) {
      const capitalized = entity.human.charAt(0).toUpperCase() + entity.human.slice(1);
      entityPatterns.push(new RegExp(`\\b${capitalized}\\b`, 'g'));
      entityPatterns.push(new RegExp(`\\b${entity.human}\\b`, 'gi'));
    }
    // For owner's solo entity, also match owner name (but that's handled by primary)
    patterns[entity.name] = entityPatterns;
  }
  return patterns;
}

/**
 * Detect which entities a text section is relevant to.
 * Primary entity always included. Secondary entities only if mentioned.
 */
function detectEntities(text, entityPatterns, primaryEntity) {
  const detected = new Set();
  if (primaryEntity) detected.add(primaryEntity);

  for (const [entityName, patterns] of Object.entries(entityPatterns)) {
    for (const p of patterns) {
      // Reset lastIndex for global patterns
      p.lastIndex = 0;
      if (p.test(text)) {
        detected.add(entityName);
        break;
      }
    }
  }

  return Array.from(detected);
}

function categoryToDir(cat) {
  return cat.replace(/_/g, '-');
}

module.exports = {
  classify,
  categoryToDir,
  parseSections,
  buildHumanPatterns,
  buildEntityPatterns,
  detectEntities,
  classifySections,
  scoreCategories,
  CATEGORY_PATTERNS
};
