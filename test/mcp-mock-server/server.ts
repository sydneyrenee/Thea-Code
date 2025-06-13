import { EmbeddedMcpProvider } from "../../src/services/mcp/providers/EmbeddedMcpProvider"

let provider: EmbeddedMcpProvider | null = null

export const startServer = async (): Promise<void> => {
	provider = await EmbeddedMcpProvider.create({ port: 0, hostname: "localhost" })
	await provider.start()
	const url = provider.getServerUrl()
	if (url) {
		console.log(`Mock MCP Server listening on ${url.toString()}`)
	}
}

export const stopServer = async (): Promise<void> => {
	if (provider) {
		await provider.stop()
		provider = null
	}
}
