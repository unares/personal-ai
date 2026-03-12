'use strict';

const fs = require('node:fs');
const path = require('node:path');

async function main() {
  const testDir = __dirname;
  const testFiles = fs.readdirSync(testDir)
    .filter(f => f.endsWith('.test.js'))
    .sort();

  console.log(`\nAIOO Test Suite — ${testFiles.length} test files\n`);

  let totalFail = 0;
  for (const file of testFiles) {
    console.log(`─── ${file} ───`);
    const mod = require(path.join(testDir, file));
    const fails = await mod.run();
    totalFail += fails;
    console.log('');
  }

  console.log('═'.repeat(40));
  if (totalFail === 0) {
    console.log('ALL TESTS PASSED');
  } else {
    console.log(`${totalFail} FAILURE(S)`);
  }
  process.exit(totalFail);
}

main();
