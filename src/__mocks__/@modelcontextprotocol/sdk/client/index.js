class Client {
	constructor() {
		this.request = jest.fn()
	}

	connect() {
		return Promise.resolve()
	}

	close() {
		return Promise.resolve()
	}

	async listTools() {
		// Mock implementation to satisfy tests expecting a tools array
		return { tools: [{ name: 'test_tool', description: 'A test tool for demonstration', parameters: { param: { type: 'string', description: 'A test parameter' } }, inputSchema: { type: 'object', properties: { param: { type: 'string', description: 'A test parameter' } }, required: ['param'] } }] };
	}

	async callTool(params) {
		// Mock implementation to satisfy tests expecting a content array
		if (params.arguments && params.arguments.message !== undefined) {
			// Handle SSE Transport test expectation
			return { content: [{ type: 'text', text: `Received: ${params.arguments.message}` }] };
		} else if (params.arguments && params.arguments.param !== undefined) {
			// Handle Ollama MCP Integration test expectation
			return { content: [{ type: 'text', text: `Tool executed with param: ${params.arguments.param}` }] };
		}
		// Fallback or handle other cases if necessary
		return { content: [] };
	}
}

module.exports = {
	Client,
}
