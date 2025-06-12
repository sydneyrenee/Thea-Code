import fs from 'fs';
import { execSync } from 'child_process';

const checklistPath = 'MASTER_TEST_CHECKLIST.md';

const checklist = fs.readFileSync(checklistPath, 'utf8').split('\n');

function hasTest(name: string): boolean {
  try {
    // Use find to locate all test files, then grep through them
    const findTestFiles = [
      // Find all test files in various patterns
      `find src -path "*/__tests__/*" -name "*.ts" -o -path "*/__tests__/*" -name "*.tsx"`,
      `find src -name "*.test.ts" -o -name "*.test.tsx" -o -name "*.spec.ts" -o -name "*.spec.tsx"`,
      `find webview-ui/src -path "*/__tests__/*" -name "*.ts" -o -path "*/__tests__/*" -name "*.tsx"`,
      `find webview-ui/src -name "*.test.ts" -o -name "*.test.tsx" -o -name "*.spec.ts" -o -name "*.spec.tsx"`,
      `find e2e -name "*.test.ts" -o -name "*.test.tsx" -o -name "*.spec.ts" -o -name "*.spec.tsx"`,
      `find test -name "*.ts" -o -name "*.tsx" 2>/dev/null || true`,
      `find benchmark -name "*.test.ts" -o -name "*.test.tsx" -o -name "*.spec.ts" -o -name "*.spec.tsx" -o -name "*.ts" -o -name "*.tsx" 2>/dev/null || true`
    ].join(' && ');
    
    // Get all test files first
    const testFiles = execSync(
      `(${findTestFiles}) | sort | uniq`,
      { encoding: 'utf8' }
    ).trim();
    
    if (!testFiles) {
      return false;
    }
    
    // Search for the name in all found test files
    const result = execSync(
      `echo "${testFiles}" | xargs grep -l "${name}" 2>/dev/null || true`,
      { encoding: 'utf8' }
    );
    
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
