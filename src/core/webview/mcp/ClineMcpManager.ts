// Extracted from src/core/webview/ClineProvider-original.ts

import * as vscode from 'vscode'
import * as path from 'path'
import * as os from 'os'
import fs from 'fs/promises'
import { McpHub } from '../../../services/mcp/McpHub'
import { McpServerManager } from '../../../services/mcp/McpServerManager'
import { EXTENSION_NAME } from '../../../../dist/thea-config'

/**
 * Manages Model Control Protocol (MCP) services
 */
export class ClineMcpManager {
    private mcpHub?: McpHub

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly owner: any // Reference to parent ClineProvider
    ) {
        // Don't initialize McpHub here - it will be set from the provider
    }

    /**
     * Sets the MCP Hub instance
     */
    setMcpHub(hub: McpHub): void {
        this.mcpHub = hub;
    }

    /**
     * Gets the McpHub instance
     */
    getMcpHub(): McpHub | undefined {
        return this.mcpHub
    }

    /**
     * Ensures the MCP servers directory exists
     */
    async ensureMcpServersDirectoryExists(): Promise<string> {
        // Get platform-specific application data directory
        let mcpServersDir: string
        if (process.platform === "win32") {
            // Windows: %APPDATA%\EXTENSION_NAME\MCP
            mcpServersDir = path.join(os.homedir(), "AppData", "Roaming", EXTENSION_NAME, "MCP")
        } else if (process.platform === "darwin") {
            // macOS: ~/Documents/EXTENSION_NAME/MCP
            mcpServersDir = path.join(os.homedir(), "Documents", EXTENSION_NAME, "MCP")
        } else {
            // Linux: ~/.local/share/EXTENSION_NAME/MCP
            mcpServersDir = path.join(os.homedir(), ".local", "share", EXTENSION_NAME, "MCP")
        }

        try {
            await fs.mkdir(mcpServersDir, { recursive: true })
        } catch (error) {
            // Fallback to a relative path if directory creation fails
            return path.join(os.homedir(), `.${EXTENSION_NAME}`, "mcp")
        }
        
        return mcpServersDir
    }

    /**
     * Updates a server's timeout setting
     */
    async updateServerTimeout(serverName: string, timeout: number): Promise<void> {
        if (this.mcpHub) {
            await this.mcpHub.updateServerTimeout(serverName, timeout)
        }
    }
    
    /**
     * Deletes a server from the MCP
     */
    async deleteServer(serverName: string): Promise<void> {
        if (this.mcpHub) {
            await this.mcpHub.deleteServer(serverName)
        }
    }
    
    /**
     * Toggles whether a tool is always allowed
     */
    async toggleToolAlwaysAllow(serverName: string, toolName: string, alwaysAllow: boolean): Promise<void> {
        if (this.mcpHub) {
            await this.mcpHub.toggleToolAlwaysAllow(serverName, toolName, alwaysAllow)
        }
    }
    
    /**
     * Toggles whether a server is disabled
     */
    async toggleServerDisabled(serverName: string, disabled: boolean): Promise<void> {
        if (this.mcpHub) {
            await this.mcpHub.toggleServerDisabled(serverName, disabled)
        }
    }
    
    /**
     * Restarts a connection
     */
    async restartConnection(serverName: string): Promise<void> {
        if (this.mcpHub) {
            await this.mcpHub.restartConnection(serverName)
        }
    }
    
    /**
     * Gets the path to the MCP settings file
     */
    async getMcpSettingsFilePath(): Promise<string | undefined> {
        if (this.mcpHub) {
            return this.mcpHub.getMcpSettingsFilePath();
        }
        
        // If mcpHub is not available, fallback to constructing the path ourselves
        const mcpServersDir = await this.ensureMcpServersDirectoryExists();
        const settingsPath = path.join(mcpServersDir, 'mcp_settings.json');
        
        // Check if the file exists
        try {
            await fs.access(settingsPath);
            return settingsPath;
        } catch {
            // If the file doesn't exist yet, still return the path where it would be created
            return settingsPath;
        }
    }
    
    /**
     * Gets all servers from the MCP
     */
    getAllServers(): any[] {
        return this.mcpHub?.getAllServers() || []
    }
    
    /**
     * Registers a new server
     */
    async registerServer(name: string, host: string, port: number): Promise<boolean> {
        if (this.mcpHub) {
            return this.mcpHub.registerServer(name, host, port);
        }
        return false;
    }

    /**
     * Cleans up resources
     */
    dispose(): void {
        if (this.mcpHub) {
            this.mcpHub.dispose()
            this.mcpHub = undefined
        }
    }
}