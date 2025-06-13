import { parseAssistantMessage } from "../assistant-message/parse-assistant-message"
import type { AccessMcpResourceToolUse } from "../assistant-message"

describe("parseAssistantMessage - access_mcp_resource", () => {
	it("parses access_mcp_resource tool use", () => {
		const msg =
			"Hello <access_mcp_resource><server_name>srv</server_name><uri>/path</uri></access_mcp_resource> World"
		const result = parseAssistantMessage(msg)

		expect(result).toEqual([
			{ type: "text", content: "Hello", partial: false },
			{
				type: "tool_use",
				name: "access_mcp_resource",
				params: { server_name: "srv", uri: "/path" },
				partial: false,
			} as AccessMcpResourceToolUse,
			{ type: "text", content: "World", partial: false },
		])
	})
})
