import * as vscode from "vscode"
import * as path from "path"
import * as os from "os"
import fs from "fs/promises"
import type { McpServer } from "../../../shared/mcp"

import { McpHub } from "../../../services/mcp/management/McpHub" // Adjusted path
// Assuming McpServerManager is not directly needed here, but constants are
import { EXTENSION_DISPLAY_NAME, EXTENSION_CONFIG_DIR } from "../../../../dist/thea-config" // Adjusted path

/**
 * Manages interactions with the McpHub for Model Control Protocol services.
 */
export class TheaMcpManager {
	// Renamed class
	private mcpHub?: McpHub

	constructor(
		private readonly context: vscode.ExtensionContext,
		// Removed owner reference, dependency inversion preferred
	) {
		// McpHub instance is injected via setMcpHub by TheaProvider
	}

	/**
	 * Sets the shared McpHub instance. Called by TheaProvider.
	 */
	setMcpHub(hub: McpHub | undefined): void {
		this.mcpHub = hub
	}

	/**
	 * Gets the McpHub instance.
	 */
	getMcpHub(): McpHub | undefined {
		return this.mcpHub
	}

	/**
	 * Ensures the platform-specific MCP servers directory exists and returns its path.
	 * Creates the directory if it doesn't exist.
	 */
	async ensureMcpServersDirectoryExists(): Promise<string> {
		// Logic copied from TheaProvider
		let mcpServersDir: string
		if (process.platform === "win32") {
			mcpServersDir = path.join(os.homedir(), "AppData", "Roaming", EXTENSION_DISPLAY_NAME, "MCP")
		} else if (process.platform === "darwin") {
			mcpServersDir = path.join(os.homedir(), "Documents", EXTENSION_DISPLAY_NAME, "MCP")
		} else {
			mcpServersDir = path.join(os.homedir(), ".local", "share", EXTENSION_DISPLAY_NAME, "MCP")
		}

                try {
                        await fs.mkdir(mcpServersDir, { recursive: true })
                } catch (error: unknown) {
                        console.error(
                                `Failed to create MCP directory ${mcpServersDir}, falling back:`,
                                error,
                        )
                        // Fallback logic copied from TheaProvider
                        return path.join(os.homedir(), EXTENSION_CONFIG_DIR, "mcp")
                }
		return mcpServersDir
	}

	// --- Delegated Methods (from refactor_analysis.md) ---

	/**
	 * Updates a server's timeout setting via McpHub.
	 */
	async updateServerTimeout(serverName: string, timeout: number): Promise<void> {
		if (this.mcpHub) {
			await this.mcpHub.updateServerTimeout(serverName, timeout)
		} else {
			console.warn("TheaMcpManager: McpHub not available for updateServerTimeout")
		}
	}

	/**
	 * Deletes a server configuration via McpHub.
	 */
	async deleteServer(serverName: string): Promise<void> {
		if (this.mcpHub) {
			await this.mcpHub.deleteServer(serverName)
		} else {
			console.warn("TheaMcpManager: McpHub not available for deleteServer")
		}
	}

	/**
	 * Toggles the "always allow" setting for a tool via McpHub.
	 * Toggles the "always allow" setting for a tool via McpHub.
	 * NOTE: This method appears to be from the refactored branch and does not exist
	 *       in the current McpHub implementation. It is commented out.
	 */
	// Method commented out as it doesn't exist in current McpHub
	// async toggleToolAlwaysAllow(serverName: string, toolName: string, alwaysAllow: boolean): Promise<void> {
	//     if (this.mcpHub) {
	//         // await this.mcpHub.toggleToolAlwaysAllow(serverName, toolName, alwaysAllow); // Method does not exist
	//     } else {
	//          console.warn("TheaMcpManager: McpHub not available for toggleToolAlwaysAllow");
	//     }
	// }
	// --- End of commented out method ---

	/**
	 * Toggles the disabled state of a server via McpHub.
	 */
	async toggleServerDisabled(serverName: string, disabled: boolean): Promise<void> {
		if (this.mcpHub) {
			await this.mcpHub.toggleServerDisabled(serverName, disabled)
		} else {
			console.warn("TheaMcpManager: McpHub not available for toggleServerDisabled")
		}
	}

	/**
	 * Restarts a connection to a server via McpHub.
	 */
	async restartConnection(serverName: string): Promise<void> {
		if (this.mcpHub) {
			await this.mcpHub.restartConnection(serverName)
		} else {
			console.warn("TheaMcpManager: McpHub not available for restartConnection")
		}
	}

	/**
	 * Gets the path to the main MCP settings file via McpHub.
	 * Includes fallback logic if McpHub is unavailable.
	 */
	async getMcpSettingsFilePath(): Promise<string | undefined> {
		if (this.mcpHub) {
			return this.mcpHub.getMcpSettingsFilePath()
		}

		// Fallback logic copied from refactor_analysis.md proposal
		console.warn("TheaMcpManager: McpHub not available for getMcpSettingsFilePath, constructing fallback path.")
		const mcpServersDir = await this.ensureMcpServersDirectoryExists()
		const settingsPath = path.join(mcpServersDir, "mcp_settings.json") // Assuming filename

		try {
			await fs.access(settingsPath)
			return settingsPath
		} catch {
			// If the file doesn't exist yet, still return the path where it would be created
			return settingsPath
		}
	}

	/**
	 * Gets a list of all configured MCP servers via McpHub.
	 */
       getAllServers(): McpServer[] {
               return this.mcpHub?.getAllServers() || []
       }

	/**
	 * Registers a new server via McpHub.
	 * NOTE: This method appears to be from the refactored branch and does not exist
	 *       in the current McpHub implementation. It is commented out.
	 */
	// Method commented out as it doesn't exist in current McpHub
	// async registerServer(name: string, host: string, port: number): Promise<boolean> {
	//     if (this.mcpHub) {
	//         // return this.mcpHub.registerServer(name, host, port); // Method does not exist
	//     } else {
	//          console.warn("TheaMcpManager: McpHub not available for registerServer");
	//          return false;
	//     }
	// }
	// --- End of commented out method ---

	/**
	 * Disposes the internal McpHub instance if it exists.
	 */
	dispose(): void {
		// The manager itself doesn't own the McpHub instance lifecycle,
		// but it might make sense to nullify the reference here.
		// Actual disposal should happen where McpServerManager is handled.
		// McpServerManager singleton handles McpHub disposal.
		console.log("TheaMcpManager disposed (reference cleared).")
		this.mcpHub = undefined
	}
}
