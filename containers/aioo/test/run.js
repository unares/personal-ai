'use strict';

const fs = require('node:fs');
const path = require('node:path');

// Fix for local execution: resolve IPC lib path relative to project root
// In Docker: /app/lib/ipc (default). Locally: ../../lib/ipc (via this env var).
if (!process.env.IPC_LIB_PATH) {
  const localIpcPath = path.resolve(__dirname, '..', '..', '..', 'lib', 'ipc');
  if (fs.existsSync(localIpcPath)) {
    process.env.IPC_LIB_PATH = localIpcPath;
  }
}

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
