import ollamaSetup from "./ollama-mock-server/setup"
import mcpSetup from "./mcp-mock-server/setup"
import openaiSetup from "./openai-mock/setup"

module.exports = async () => {
	await ollamaSetup()
	// Expose port to tests if available
	if ((globalThis as any).__OLLAMA_PORT__) {
		console.log(`GlobalSetup: Ollama mock port ${(globalThis as any).__OLLAMA_PORT__}`)
	}
	await mcpSetup()
	await openaiSetup()
	// Note: McpToolExecutor initialization removed to avoid conflicts with mock server
	// Individual tests that need it will initialize it themselves with mocks
}
