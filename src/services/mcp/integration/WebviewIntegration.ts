import { EventEmitter } from 'events';
import { McpHub } from '../management/McpHub';

/**
 * WebviewIntegration provides an integration layer for webview interactions.
 */
export class WebviewIntegration extends EventEmitter {
  private static instance: WebviewIntegration;
  private mcpHub?: McpHub;

  /** Get the singleton instance of the WebviewIntegration. */
  public static getInstance(): WebviewIntegration {
    if (!WebviewIntegration.instance) {
      WebviewIntegration.instance = new WebviewIntegration();
    }
    return WebviewIntegration.instance;
  }

  private constructor() {
    super();
  }

  /** Set the McpHub instance to delegate operations to. */
  public setMcpHub(hub: McpHub): void {
    this.mcpHub = hub;
    hub.on('tool-registered', (name) => this.emit('tool-registered', name));
    hub.on('tool-unregistered', (name) => this.emit('tool-unregistered', name));
    hub.on('started', (info) => this.emit('started', info));
    hub.on('stopped', () => this.emit('stopped'));
  }

  /** Get the McpHub instance. */
  public getMcpHub(): McpHub | undefined {
    return this.mcpHub;
  }

  /** Return all servers known by the hub. */
  public getAllServers(): any[] {
    return this.mcpHub?.getAllServers() || [];
  }

  /** Update a server timeout via the hub. */
  public async updateServerTimeout(serverName: string, timeout: number): Promise<void> {
    if (!this.mcpHub) throw new Error('McpHub not available');
    await this.mcpHub.updateServerTimeout(serverName, timeout);
  }

  /** Delete a server via the hub. */
  public async deleteServer(serverName: string): Promise<void> {
    if (!this.mcpHub) throw new Error('McpHub not available');
    await this.mcpHub.deleteServer(serverName);
  }

  /** Toggle a server disabled state via the hub. */
  public async toggleServerDisabled(serverName: string, disabled: boolean): Promise<void> {
    if (!this.mcpHub) throw new Error('McpHub not available');
    await this.mcpHub.toggleServerDisabled(serverName, disabled);
  }

  /** Restart a server connection via the hub. */
  public async restartConnection(serverName: string): Promise<void> {
    if (!this.mcpHub) throw new Error('McpHub not available');
    await this.mcpHub.restartConnection(serverName);
  }
}
