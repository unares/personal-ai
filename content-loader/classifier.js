'use strict';

const CATEGORY_PATTERNS = {
  personal_story: [
    /\b(I felt|I learned|I realized|my experience|personally|my journey)\b/i,
    /\b(anxious|excited|frustrated|proud|relieved|overwhelmed)\b/i,
    /\b(I struggled|I noticed|I decided|my mistake|my lesson)\b/i
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

function scoreCategories(text) {
  const sample = text.substring(0, 2000);
  const scores = { personal_story: 0, shared_story: 0, specification: 0 };

  for (const [cat, patterns] of Object.entries(CATEGORY_PATTERNS)) {
    for (const p of patterns) {
      const matches = (sample.match(new RegExp(p, 'gi')) || []).length;
      scores[cat] += matches;
    }
  }
  return scores;
}

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

function categoryToDir(cat) {
  return cat.replace(/_/g, '-');
}

module.exports = { classify, categoryToDir, CATEGORY_PATTERNS };
