import { ollamaTeardown } from "./ollama-mock-server/teardown"
import { mcpTeardown } from "./mcp-mock-server/teardown"
import { openaiTeardown } from "./openai-mock/teardown"
import { McpToolExecutor } from "../src/services/mcp/core/McpToolExecutor"

module.exports = async () => {
	;(globalThis as any).__JEST_TEARDOWN__ = true
	await McpToolExecutor.getInstance().shutdown()
	await mcpTeardown()
	await ollamaTeardown()
	await openaiTeardown()
}
