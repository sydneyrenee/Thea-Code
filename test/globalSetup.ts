import ollamaSetup from "./ollama-mock-server/setup"
import mcpSetup from "./mcp-mock-server/setup"
import openaiSetup from "./openai-mock/setup"
import { McpToolExecutor } from "../src/services/mcp/core/McpToolExecutor"

module.exports = async () => {
	await ollamaSetup()
	await mcpSetup()
	await openaiSetup()
	await McpToolExecutor.initializeForTest()
}
