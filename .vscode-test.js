const { defineConfig } = require('@vscode/test-cli');
const { resolve } = require('path');

module.exports = defineConfig([
    {
        label: 'clineTests',
        files: resolve('out/test/suite/core/Cline.test.js'),
        extensionTestsPath: resolve('out/test/suite/core/extension.js'),
        workspaceFolder: resolve('src/test/workspace'),
        mocha: {
            ui: 'bdd',
            timeout: 20000,
            color: true
        },
        launchArgs: [
            '--enable-proposed-api=RooVeterinaryInc.roo-cline',
            '--disable-extensions',
            '--extensions-dir=none'
        ],
        debug: true,
        verbose: true
    }
]);