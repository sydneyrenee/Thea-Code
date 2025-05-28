#!/usr/bin/env node
// Simple script to run project ESLint using the project's npm scripts
const { spawnSync } = require('child_process');
const result = spawnSync('npm', ['run', 'lint'], { stdio: 'inherit' });
process.exit(result.status ?? 1);
