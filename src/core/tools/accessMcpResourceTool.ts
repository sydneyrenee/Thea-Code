import { TheaAskUseMcpServer } from "../../shared/ExtensionMessage" // Renamed import
import type { RemoveClosingTag } from "./types"
import type { ToolUse } from "../assistant-message"
import { AskApproval, HandleError, PushToolResult } from "./types"
import { TheaTask } from "../TheaTask" // Renamed from Cline
import { formatResponse } from "../prompts/responses"

export async function accessMcpResourceTool(
	theaTask: TheaTask, // Renamed parameter and type
	block: ToolUse,
	askApproval: AskApproval,
	handleError: HandleError,
	pushToolResult: PushToolResult,
	removeClosingTag: RemoveClosingTag,
) {
	const server_name: string | undefined = block.params.server_name
	const uri: string | undefined = block.params.uri
	try {
		if (block.partial) {
			const partialMessage = JSON.stringify({
				type: "access_mcp_resource",
				serverName: removeClosingTag("server_name", server_name),
				uri: removeClosingTag("uri", uri),
			} satisfies TheaAskUseMcpServer) // Renamed type
			await theaTask.webviewCommunicator.ask("use_mcp_server", partialMessage, block.partial).catch(() => {}) // Use communicator
			return
		} else {
			if (!server_name) {
				theaTask.consecutiveMistakeCount++
				pushToolResult(await theaTask.sayAndCreateMissingParamError("access_mcp_resource", "server_name"))
				return
			}
			if (!uri) {
				theaTask.consecutiveMistakeCount++
				pushToolResult(await theaTask.sayAndCreateMissingParamError("access_mcp_resource", "uri"))
				return
			}
			theaTask.consecutiveMistakeCount = 0
			const completeMessage = JSON.stringify({
				type: "access_mcp_resource",
				serverName: server_name,
				uri,
			} satisfies TheaAskUseMcpServer) // Renamed type
			const didApprove = await askApproval("use_mcp_server", completeMessage)
			if (!didApprove) {
				return
			}
			// now execute the tool
			await theaTask.webviewCommunicator.say("mcp_server_request_started") // Use communicator
			const resourceResult = await theaTask.providerRef.deref()?.getMcpHub()?.readResource(server_name, uri)
			const resourceResultPretty =
				resourceResult?.contents
					.map((item) => {
						if (item.text) {
							return item.text
						}
						return ""
					})
					.filter(Boolean)
					.join("\n\n") || "(Empty response)"

			// handle images (image must contain mimetype and blob)
			let images: string[] = []
			resourceResult?.contents.forEach((item) => {
				if (item.mimeType?.startsWith("image") && item.blob) {
					images.push(item.blob)
				}
			})
			await theaTask.webviewCommunicator.say("mcp_server_response", resourceResultPretty, images) // Use communicator
			pushToolResult(formatResponse.toolResult(resourceResultPretty, images))
			return
		}
	} catch (error) {
		await handleError("accessing MCP resource", error instanceof Error ? error : new Error(String(error)))
		return
	}
}
