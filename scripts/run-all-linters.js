const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const logFilePath = path.join(__dirname, '..', 'lint-output.log');
const projectRoot = path.join(__dirname, '..');

// List of lint commands to run sequentially
const lintCommands = [
    { name: 'lint:extension', command: 'npm run lint:extension' },
    { name: 'lint:webview', command: 'npm run lint:webview' },
    { name: 'lint:e2e', command: 'npm run lint:e2e' },
    { name: 'lint:benchmark', command: 'npm run lint:benchmark' },
];

// Function to append output to the log file
const appendToLog = (commandName, output, error) => {
    const timestamp = new Date().toISOString();
    let logContent = `\n\n--- Log Entry: ${timestamp} ---\n`;
    logContent += `Command: ${commandName}\n`;
    logContent += `Exit Code: ${error ? error.code : 0}\n`;
    logContent += `--- STDOUT ---\n${output}\n`;
    if (error && error.stderr) {
        logContent += `--- STDERR ---\n${error.stderr}\n`;
    } else if (error) {
         logContent += `--- ERROR ---\n${error.message}\n`;
    }
    logContent += `--- End Log Entry: ${timestamp} ---\n`;

    fs.appendFile(logFilePath, logContent, (err) => {
        if (err) {
            console.error(`Failed to append to log file ${logFilePath}:`, err);
        }
    });
};

// Function to execute commands sequentially
const runCommandsSequentially = async () => {
    console.log(`Starting lint checks. Output will be appended to ${logFilePath}`);
    // Clear log file at the start or add initial header
    fs.writeFile(logFilePath, `Lint Check Log - Started: ${new Date().toISOString()}\n`, (err) => {
        if (err) console.error(`Failed to clear/initialize log file: ${err}`);
    });


    for (const { name, command } of lintCommands) {
        console.log(`Running: ${name} ('${command}')...`);
        await new Promise((resolve) => {
            // Execute command from project root
            exec(command, { cwd: projectRoot }, (error, stdout, stderr) => {
                const output = stdout || '';
                const execError = error ? { ...error, stderr } : null; // Combine error object with stderr

                if (error) {
                    console.error(`Error running ${name}: Exit code ${error.code}`);
                } else {
                    console.log(`${name} completed successfully.`);
                }
                appendToLog(name, output, execError);
                resolve(); // Resolve promise regardless of error to continue sequence
            });
        });
    }
    console.log(`All lint checks finished. Check ${logFilePath} for details.`);
};

runCommandsSequentially();