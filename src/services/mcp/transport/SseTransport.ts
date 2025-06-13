import { IMcpTransport } from "../types/McpTransportTypes"
import { SseTransportConfig, DEFAULT_SSE_CONFIG } from "./config/SseTransportConfig"
import express from "express"
import http from "http"

/**
 * SseTransport provides an implementation of the MCP transport using SSE.
 * Requires the @modelcontextprotocol/sdk package to be installed.
 */
interface StreamableHTTPServerTransportLike {
	start(): Promise<void>
	close(): Promise<void>
	onerror?: (error: Error) => void
	onclose?: () => void
	handleRequest(req: express.Request, res: express.Response, body?: unknown): Promise<void>
}

export class SseTransport implements IMcpTransport {
	private transport?: StreamableHTTPServerTransportLike
	public httpServer?: http.Server
	public port?: number
	private readonly config: SseTransportConfig

	constructor(config?: SseTransportConfig) {
		this.config = { ...DEFAULT_SSE_CONFIG, ...config }
	}

	private async initTransport(): Promise<void> {
		if (this.transport) {
			return
		}
		try {
			const { StreamableHTTPServerTransport } = (await import(
				"@modelcontextprotocol/sdk/server/streamableHttp.js"
			)) as {
				StreamableHTTPServerTransport: new (opts: Record<string, unknown>) => StreamableHTTPServerTransportLike
			}

			this.transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
			const app = express()
			app.use(express.json())
			app.all(this.config.eventsPath!, async (req, res) => {
				await this.transport!.handleRequest(req, res, req.body)
			})
			app.all(this.config.apiPath!, async (req, res) => {
				await this.transport!.handleRequest(req, res, req.body)
			})

			await new Promise<void>((resolve) => {
				this.httpServer = app.listen(this.config.port, this.config.hostname, () => resolve())
			})
			await this.transport.start()
			const address = this.httpServer.address()
			if (address && typeof address !== "string") {
				this.port = address.port
			}
		} catch (error) {
			const msg = `Failed to initialize MCP SDK: ${error instanceof Error ? error.message : String(error)}`
			console.error(msg)
			throw new Error(msg)
		}
	}

	async start(): Promise<void> {
		await this.initTransport()
	}

	async close(): Promise<void> {
		if (this.transport?.close) {
			await this.transport.close()
		}
		if (this.httpServer) {
			await new Promise<void>((resolve) => this.httpServer!.close(() => resolve()))
			this.httpServer = undefined
			this.port = undefined
		}
	}

	getPort(): number {
		if (!this.httpServer || typeof this.port !== "number") {
			throw new Error("Server not started")
		}
		return this.port
	}

	public set onerror(handler: (error: Error) => void) {
		if (this.transport) {
			this.transport.onerror = handler
		}
	}

	public set onclose(handler: () => void) {
		if (this.transport) {
			this.transport.onclose = handler
		}
	}
}
