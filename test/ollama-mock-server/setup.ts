import { startServer, getServerPort } from "./server"

export default async () => {
	console.log("\nStarting Mock Ollama Server...")
	await startServer()
	const port = getServerPort()
	if (port) {
		;(globalThis as any).__OLLAMA_PORT__ = port
		process.env.OLLAMA_BASE_URL = `http://127.0.0.1:${port}`
		process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${port}`
		process.env.OPENAI_BASE_URL = `http://127.0.0.1:${port}`
	}
	console.log("Mock Ollama Server started.")
}
