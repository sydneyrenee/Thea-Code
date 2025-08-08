import express from "express"
import http from "http"
import type { Request, Response } from "express"
import { findAvailablePort, waitForPortInUse } from "../../src/utils/port-utils"

const HOST = "127.0.0.1"

const app = express() as any // Assert as any to bypass incorrect type inference
// We'll find an available port dynamically
let port: number
let server: http.Server | null = null
// Track the actual port assigned by the OS
let actualPort: number | null = null
let starting = false
let startPromise: Promise<void> | null = null

const isTestEnv = process.env.JEST_WORKER_ID !== undefined

app.use(express.json())

// Mock /v1/models endpoint
app.get("/v1/models", (req: Request, res: Response) => {
	console.log("Mock Ollama Server: Received GET /v1/models")
	res.json({
		data: [
			{ id: "llama2", object: "model" },
			{ id: "mistral", object: "model" },
			{ id: "gemma", object: "model" },
		],
		object: "list",
	})
})

// Mock /v1/chat/completions endpoint
app.post("/v1/chat/completions", (req: Request, res: Response) => {
	console.log("Mock Ollama Server: Received POST /v1/chat/completions")
	const { messages, stream } = req.body as { messages?: unknown; stream?: boolean }

	if (stream) {
		res.setHeader("Content-Type", "text/event-stream")
		res.setHeader("Cache-Control", "no-cache")
		res.setHeader("Connection", "keep-alive")

		// Simple mock streaming response
		const mockResponse = "This is a mock streamed response."
		const chunks = mockResponse.split(" ")

		let index = 0
		const interval = setInterval(() => {
			if (index < chunks.length) {
				const chunk = chunks[index] + (index === chunks.length - 1 ? "" : " ")
				const data = {
					choices: [
						{
							delta: { content: chunk },
							index: 0,
						},
					],
				}
				res.write(`data: ${JSON.stringify(data)}\n\n`)
				index++
			} else {
				// End of stream
				res.write("data: [DONE]\n\n")
				res.end()
				clearInterval(interval)
			}
		}, 50) // Send chunks every 50ms
	} else {
		// Simple mock non-streaming response
		const mockResponse = "This is a mock non-streamed response."
		res.json({
			choices: [
				{
					message: { content: mockResponse, role: "assistant" },
					index: 0,
					finish_reason: "stop",
				},
			],
			model: (req.body as any).model,
			usage: {
				prompt_tokens: 10,
				completion_tokens: 10,
				total_tokens: 20,
			},
		})
	}
})

// Anthropic-like streaming endpoint (OpenAI-compatible host path)
app.post("/v1/messages", (req: Request, res: Response) => {
	console.log("Mock Ollama Server: Received POST /v1/messages")
	const { stream, messages, model } = req.body as { stream?: boolean; messages?: unknown; model?: string }
	if (stream) {
		res.setHeader("Content-Type", "text/event-stream")
		res.setHeader("Cache-Control", "no-cache")
		res.setHeader("Connection", "keep-alive")

		// Send a minimal message_start with usage
		res.write(
			`data: ${JSON.stringify({ type: "message_start", message: { id: "msg_1", type: "message", role: "assistant", usage: { input_tokens: 0, output_tokens: 0 } } })}\n\n`
		)
		// Start a text content block
		res.write(
			`data: ${JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "text", text: "This is a mock streamed response." } })}\n\n`
		)
		// Optionally send a small delta usage
		res.write(`data: ${JSON.stringify({ type: "message_delta", usage: { output_tokens: 5 } })}\n\n`)
		// End of stream
		res.write("data: [DONE]\n\n")
		res.end()
	} else {
		// Non-streaming: return a simple structure
		res.json({
			id: "msg_1",
			type: "message",
			role: "assistant",
			content: [{ type: "text", text: "This is a mock non-streamed response." }],
			model,
			usage: { input_tokens: 10, output_tokens: 10 },
		})
	}
})

// Anthropic-like token counting endpoint
app.post("/v1/messages/count_tokens", (req: Request, res: Response) => {
	console.log("Mock Ollama Server: Received POST /v1/messages/count_tokens")
	try {
		const body = req.body as any
		let input = ""
		if (Array.isArray(body?.messages)) {
			// crude token estimate by length
			input = JSON.stringify(body.messages)
		}
		const input_tokens = Math.max(1, Math.ceil(input.length / 4))
		res.json({ input_tokens })
	} catch {
		res.json({ input_tokens: 42 })
	}
})

export const startServer = async (): Promise<void> => {
	// Coordinate across possible duplicated module loads using global flags
	const g: any = globalThis as any
	if (g.__OLLAMA_PORT__ && !server) {
		console.log(`Mock Ollama Server port already recorded globally at ${g.__OLLAMA_PORT__}`)
		return
	}
	if (server && actualPort) {
		console.log(`Mock Ollama Server already running at http://${HOST}:${actualPort}`)
		if (!g.__OLLAMA_PORT__) {
			g.__OLLAMA_PORT__ = actualPort
		}
		return
	}
	if (g.__OLLAMA_START_PROMISE__) {
		await g.__OLLAMA_START_PROMISE__
		return
	}
	if (starting && startPromise) {
		await startPromise
		return
	}
	starting = true
	// Set global starting markers BEFORE async work/log to avoid duplicate logs
	startPromise = (async () => {
		g.__OLLAMA_STARTING__ = true
		try {
			// Define preferred port ranges for the Ollama mock server
			// Try ports in the 10000-10100 range first, then 20000-20100
			const preferredRanges: Array<[number, number]> = [
				[10000, 10100],
				[20000, 20100],
			]

			// Find an available port with preferred ranges and more attempts
			console.log("Starting Mock Ollama Server...")
			port = await findAvailablePort(10000, HOST, preferredRanges, 150)
			console.log(`Mock Ollama Server: Found available port ${port}`)

			await new Promise<void>((resolve, reject) => {
				server = app
					.listen(port, HOST, async () => {
						try {
							const address = server?.address()
							actualPort = typeof address === "object" && address ? address.port : port

							// Minimal readiness wait only outside test runs
							if (!isTestEnv) {
								await waitForPortInUse(actualPort!, HOST, 50, 2000, "Mock Ollama Server", 3)
							}

							g.__OLLAMA_PORT__ = actualPort
							console.log(`Mock Ollama Server listening on http://${HOST}:${actualPort}`)
							console.log("Mock Ollama Server started.")
							resolve()
						} catch (err) {
							console.error("Mock Ollama Server failed to confirm readiness:", err)
							console.log("Mock Ollama Server started.")
							g.__OLLAMA_PORT__ = actualPort
							resolve()
						}
					})
					.on("error", (err: unknown) => {
						console.error("Mock Ollama Server failed to start:", err)
						reject(err)
					})
			})
		} finally {
			starting = false
			g.__OLLAMA_STARTING__ = false
			delete g.__OLLAMA_START_PROMISE__
		}
	})()
	;(globalThis as any).__OLLAMA_START_PROMISE__ = startPromise
	await startPromise
}

/**
 * Get the actual port the server is listening on
 * @returns The port number or null if the server is not running
 */
export const getServerPort = (): number | null => actualPort

export const stopServer = (): Promise<void> => {
	return new Promise((resolve, reject) => {
		if (server) {
			server.close((err?: Error) => {
				if (err) {
					console.error("Mock Ollama Server failed to stop:", err)
					reject(err)
				} else {
					console.log("Mock Ollama Server stopped.")
					actualPort = null
					server = null
					resolve()
				}
			})
		} else {
			actualPort = null
			server = null
			resolve()
		}
	})
}
