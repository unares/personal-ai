'use strict';

// Simple mode (default) uses minimal pipeline: classify → distill → index
// Advanced mode uses full pipeline with conflicts, predictions, intelligence, etc.
const MODE = process.env.CX_MODE || 'simple';
if (MODE === 'simple') {
  require('./simple');
} else {
  require('./advanced');
}
