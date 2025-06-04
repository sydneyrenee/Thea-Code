import ts from 'typescript';
import fs from 'fs';
import path from 'path';

const configPath = ts.findConfigFile('./', ts.sys.fileExists, 'tsconfig.json');
if (!configPath) {
  console.error('Could not find tsconfig.json');
  process.exit(1);
}

const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
const config = ts.parseJsonConfigFileContent(configFile.config, ts.sys, path.dirname(configPath));

const sourceFiles = config.fileNames.filter(fn => fn.startsWith('src/') && fn.endsWith('.ts'));

interface Entry { type: string; name: string; file: string }
const entries: Entry[] = [];

for (const fileName of sourceFiles) {
  const sourceText = fs.readFileSync(fileName, 'utf8');
  const sf = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true);

  ts.forEachChild(sf, node => {
    if (ts.isFunctionDeclaration(node) && node.name) {
      entries.push({ type: 'function', name: node.name.text, file: fileName });
    } else if (ts.isClassDeclaration(node) && node.name) {
      entries.push({ type: 'class', name: node.name.text, file: fileName });
    } else if (ts.isInterfaceDeclaration(node) && node.name) {
      entries.push({ type: 'interface', name: node.name.text, file: fileName });
    }
  });
}

entries.sort((a, b) => a.name.localeCompare(b.name));

const lines = entries.map(e => `- [ ] ${e.type}: ${e.name} (${e.file})`);
const header = '# Test Coverage Checklist\n\nGenerated with scripts/generate-master-list.ts';
fs.writeFileSync('MASTER_TEST_CHECKLIST.md', `${header}\n\n${lines.join('\n')}\n`);

console.log(`Generated checklist with ${entries.length} items.`);
