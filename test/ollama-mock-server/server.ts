import express from "express"
import http from "http"

const app = express() as any // Assert as any to bypass incorrect type inference
// Use port 0 to let the OS assign a random available port
const port = 0
let server: http.Server | null = null
// Track the actual port assigned by the OS
let actualPort: number | null = null

app.use(express.json())

// Mock /v1/models endpoint
app.get("/v1/models", (req, res) => {
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
app.post("/v1/chat/completions", (req, res) => {
	console.log("Mock Ollama Server: Received POST /v1/chat/completions")
	const { messages, stream } = req.body

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
			model: req.body.model,
			usage: {
				prompt_tokens: 10,
				completion_tokens: 10,
				total_tokens: 20,
			},
		})
	}
})

export const startServer = (): Promise<void> => {
	return new Promise((resolve, reject) => {
		server = app
			.listen(port, "localhost", () => {
				// Get the actual port assigned by the OS
				const address = server?.address();
				if (address && typeof address === 'object') {
					actualPort = address.port;
				}
				console.log(`Mock Ollama Server listening on http://localhost:${actualPort}`)
				resolve()
			})
			.on("error", (err) => {
				console.error("Mock Ollama Server failed to start:", err)
				reject(err)
			})
	})
}

/**
 * Get the actual port the server is listening on
 * @returns The port number or null if the server is not running
 */
export const getServerPort = (): number | null => {
	return actualPort;
}

export const stopServer = (): Promise<void> => {
	return new Promise((resolve, reject) => {
		if (server) {
			server.close((err) => {
				if (err) {
					console.error("Mock Ollama Server failed to stop:", err)
					reject(err)
				} else {
					console.log("Mock Ollama Server stopped.")
					// Reset the actual port to ensure clean state between test runs
					actualPort = null;
					server = null;
					resolve()
				}
			})
		} else {
			// Already stopped or never started
			actualPort = null;
			server = null;
			resolve()
		}
	})
}
