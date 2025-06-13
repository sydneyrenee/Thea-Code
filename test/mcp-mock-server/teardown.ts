import { stopServer } from "./server"

export const mcpTeardown = async (): Promise<void> => {
	console.log("\nStopping Mock MCP Server...")
	await stopServer()
	console.log("Mock MCP Server stopped.")
}
