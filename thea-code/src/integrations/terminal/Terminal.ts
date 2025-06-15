/**
 * Default timeout for terminal shell integration.
 */
export const TERMINAL_SHELL_INTEGRATION_TIMEOUT = 5000;

/**
 * Manages terminal operations for the Thea Code extension.
 * This is a simplified version of the original implementation.
 */
export class Terminal {
  private static shellIntegrationTimeout = TERMINAL_SHELL_INTEGRATION_TIMEOUT;

  /**
   * Sets the shell integration timeout.
   * 
   * @param timeout The timeout in milliseconds
   */
  public static setShellIntegrationTimeout(timeout: number): void {
    Terminal.shellIntegrationTimeout = timeout;
  }

  /**
   * Gets the shell integration timeout.
   * 
   * @returns The timeout in milliseconds
   */
  public static getShellIntegrationTimeout(): number {
    return Terminal.shellIntegrationTimeout;
  }
}