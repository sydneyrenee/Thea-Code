import fs from 'fs';
import { execSync } from 'child_process';

const checklistPath = 'MASTER_TEST_CHECKLIST.md';

const checklist = fs.readFileSync(checklistPath, 'utf8').split('\n');

function hasTest(name: string): boolean {
  try {
    execSync(
      `grep -r "${name}" src/**/__tests__ webview-ui/src/**/__tests__ e2e/src || true`,
      { stdio: 'ignore' }
    );
    const result = execSync(
      `grep -r "${name}" src/**/__tests__ webview-ui/src/**/__tests__ e2e/src || true`
    ).toString();
    return result.trim().length > 0;
  } catch {
    return false;
  }
}

const updated = checklist.map((line) => {
  const match = line.match(/^- \[ \] (function|class|interface): ([^ ]+) \(/);
  if (!match) return line;
  const name = match[2];
  if (hasTest(name)) {
    return line.replace('- [ ]', '- [x]');
  }
  return line;
});

fs.writeFileSync(checklistPath, updated.join('\n'));
console.log('Audit complete.');
