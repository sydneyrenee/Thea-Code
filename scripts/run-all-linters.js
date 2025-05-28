const { exec } = require("child_process")
const fs = require("fs")
const path = require("path")

const logFilePath = path.join(__dirname, "..", "lint-output.log")
const projectRoot = path.join(__dirname, "..")

const lintCommands = [
  { name: "lint:root", command: "npm run lint", cwd: projectRoot },
  { name: "lint:webview", command: "npm run lint", cwd: path.join(projectRoot, "webview-ui") },
  { name: "lint:e2e", command: "npm run lint", cwd: path.join(projectRoot, "e2e") },
  { name: "lint:benchmark", command: "npm run lint", cwd: path.join(projectRoot, "benchmark") },
]

const appendToLog = (commandName, output, error) => {
  const timestamp = new Date().toISOString()
  let logContent = `\n\n--- Log Entry: ${timestamp} ---\n`
  logContent += `Command: ${commandName}\n`
  logContent += `Exit Code: ${error ? error.code : 0}\n`
  logContent += `--- STDOUT ---\n${output}\n`
  if (error && error.stderr) {
    logContent += `--- STDERR ---\n${error.stderr}\n`
  } else if (error) {
    logContent += `--- ERROR ---\n${error.message}\n`
  }
  logContent += `--- End Log Entry: ${timestamp} ---\n`

  fs.appendFile(logFilePath, logContent, err => {
    if (err) {
      console.error(`Failed to append to log file ${logFilePath}:`, err)
    }
  })
}

const runCommandsSequentially = async () => {
  console.log(`Starting lint checks. Output will be appended to ${logFilePath}`)
  fs.writeFile(logFilePath, `Lint Check Log - Started: ${new Date().toISOString()}\n`, err => {
    if (err) console.error(`Failed to clear/initialize log file: ${err}`)
  })

  for (const { name, command, cwd } of lintCommands) {
    console.log(`Running: ${name} ('${command}')...`)
    await new Promise(resolve => {
      exec(command, { cwd }, (error, stdout, stderr) => {
        const output = stdout || ""
        const execError = error ? { ...error, stderr } : null

        if (error) {
          console.error(`Error running ${name}: Exit code ${error.code}`)
        } else {
          console.log(`${name} completed successfully.`)
        }
        appendToLog(name, output, execError)
        resolve()
      })
    })
  }
  console.log(`All lint checks finished. Check ${logFilePath} for details.`)
}

runCommandsSequentially()
