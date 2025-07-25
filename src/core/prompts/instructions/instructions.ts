import { createMCPServerInstructions } from "./create-mcp-server"
import { createModeInstructions } from "./create-mode"
import { McpHub } from "../../../services/mcp/management/McpHub"
import { DiffStrategy } from "../../diff/DiffStrategy"
import * as vscode from "vscode"

interface InstructionsDetail {
	mcpHub?: McpHub
	diffStrategy?: DiffStrategy
	context?: vscode.ExtensionContext
}

export async function fetchInstructions(text: string, detail: InstructionsDetail): Promise<string> {
	switch (text) {
		case "create_mcp_server": {
			return await createMCPServerInstructions(detail.mcpHub, detail.diffStrategy)
		}
		case "create_mode": {
			return createModeInstructions(detail.context)
		}
		default: {
			return ""
		}
	}
}
