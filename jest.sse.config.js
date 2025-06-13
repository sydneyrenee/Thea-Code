const base = require("./jest.config.js")
const backendProject = base.projects.find((p) => p.displayName === "backend")
const sseProject = {
	...backendProject,
	moduleNameMapper: { ...backendProject.moduleNameMapper },
	globalSetup: base.globalSetup,
	globalTeardown: base.globalTeardown,
}
// remove mocks for @modelcontextprotocol/sdk
delete sseProject.moduleNameMapper["@modelcontextprotocol/sdk$"]
delete sseProject.moduleNameMapper["@modelcontextprotocol/sdk/(.*)"]
module.exports = sseProject
