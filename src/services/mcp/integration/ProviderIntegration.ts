import { EventEmitter } from "events"
import { IMcpProvider } from "../types/McpProviderTypes"
import { McpToolExecutor } from "../core/McpToolExecutor"
import { SseTransportConfig } from "../types/McpTransportTypes"

/**
 * ProviderIntegration provides an integration layer for MCP providers.
 */
export class ProviderIntegration extends EventEmitter {
	private static instance: ProviderIntegration
	private providers: Map<string, IMcpProvider> = new Map()
	private mcpToolExecutors: Map<string, McpToolExecutor> = new Map()
	private isInitialized = false
	private sseConfig?: SseTransportConfig

	/**
	 * Get the singleton instance of the ProviderIntegration
	 * @param config Optional SSE transport configuration
	 */
	public static getInstance(config?: SseTransportConfig): ProviderIntegration {
		if (!ProviderIntegration.instance) {
			ProviderIntegration.instance = new ProviderIntegration(config)
		} else if (config) {
			ProviderIntegration.instance.sseConfig = config
		}
		return ProviderIntegration.instance
	}

	private constructor(config?: SseTransportConfig) {
		super()
		this.sseConfig = config
	}

	/** Initialize all registered providers. */
	public async initialize(): Promise<void> {
		if (this.isInitialized) {
			return
		}

		for (const [name, provider] of this.providers.entries()) {
			await provider.start()
			if (!this.mcpToolExecutors.has(name)) {
				const exec = McpToolExecutor.getInstance()
				this.mcpToolExecutors.set(name, exec)
				exec.on("tool-registered", (tool) => this.emit("tool-registered", { provider: name, tool }))
				exec.on("tool-unregistered", (tool) => this.emit("tool-unregistered", { provider: name, tool }))
			}
		}

		this.isInitialized = true
	}

	/** Shutdown all providers. */
	public async shutdown(): Promise<void> {
		if (!this.isInitialized) {
			return
		}

		for (const provider of this.providers.values()) {
			await provider.stop()
		}
		this.isInitialized = false
	}

	/** Register a provider with the integration. */
	public registerProvider(name: string, provider: IMcpProvider): void {
		this.providers.set(name, provider)

		if (provider instanceof EventEmitter) {
			provider.on("tool-registered", (tool) => this.emit("tool-registered", name, tool))
			provider.on("tool-unregistered", (tool) => this.emit("tool-unregistered", name, tool))
			provider.on("started", (info) => this.emit("provider-started", name, info))
			provider.on("stopped", () => this.emit("provider-stopped", name))
		}

		if (!this.mcpToolExecutors.has(name)) {
			const exec = McpToolExecutor.getInstance()
			this.mcpToolExecutors.set(name, exec)
			exec.on("tool-registered", (tool) => this.emit("tool-registered", name, tool))
			exec.on("tool-unregistered", (tool) => this.emit("tool-unregistered", name, tool))
		}
	}

	/** Unregister a provider from the integration. */
	public unregisterProvider(name: string): boolean {
		const provider = this.providers.get(name)
		if (!provider) {
			return false
		}
		if (provider.isRunning()) {
			provider.stop().catch((e) => console.error(`Error stopping provider ${name}:`, e))
		}
		this.providers.delete(name)
		this.mcpToolExecutors.delete(name)
		return true
	}

	/** Get a provider by name. */
	public getProvider(name: string): IMcpProvider | undefined {
		return this.providers.get(name)
	}

	/** Get all registered providers. */
	public getAllProviders(): Map<string, IMcpProvider> {
		return new Map(this.providers)
	}

	/** Get the tool executor associated with a provider. */
	public getToolExecutor(name: string): McpToolExecutor | undefined {
		return this.mcpToolExecutors.get(name)
	}
}
