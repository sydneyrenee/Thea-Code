import * as vscode from 'vscode';

/**
 * Processes an error from an API provider, handling common cases and 
 * providing appropriate output and details.
 *
 * @param outputChannel VS Code output channel to log messages to
 * @param provider Name of the API provider
 * @param error Error object or message
 * @param message Custom message to prepend to error output
 */
export async function handleProviderError(
    outputChannel: vscode.OutputChannel,
    provider: string,
    error: any,
    message = 'API Error'
): Promise<void> {
    const errorString = typeof error === 'string' ? error : 
        error?.message || error?.toString() || 'Unknown error';
    
    const fullMessage = `${provider} ${message}: ${errorString}`;
    
    // Log to output channel
    outputChannel.appendLine(fullMessage);
    
    if (error?.response?.data) {
        try {
            outputChannel.appendLine(`Response data: ${JSON.stringify(error.response.data, null, 2)}`);
        } catch (e) {
            outputChannel.appendLine(`Response data available but not serializable: ${error.response.data}`);
        }
    }
    
    // Additional logging for axios errors
    if (error?.isAxiosError) {
        if (error.code === 'ECONNREFUSED') {
            outputChannel.appendLine(`Connection refused to ${provider} API. Please check if the service is available.`);
        } else if (error.code === 'ETIMEDOUT') {
            outputChannel.appendLine(`Connection to ${provider} API timed out. Please try again later.`);
        }
        
        // Log request details if available
        if (error.config) {
            outputChannel.appendLine(`Request URL: ${error.config.method?.toUpperCase() || 'GET'} ${error.config.url}`);
            
            if (error.config.headers) {
                const safeHeaders = { ...error.config.headers };
                // Remove sensitive headers
                delete safeHeaders.authorization;
                delete safeHeaders.Authorization;
                delete safeHeaders['api-key'];
                delete safeHeaders['x-api-key'];
                
                outputChannel.appendLine(`Request headers: ${JSON.stringify(safeHeaders, null, 2)}`);
            }
        }
    }
    
    console.error(fullMessage);
}

/**
 * Creates a safe function that fetches models from providers, with error handling
 * 
 * @param providerName Name of the model provider
 * @param fetchFunc The async function that fetches models
 * @param outputChannel VS Code output channel for logging
 */
export function createSafeModelFetcher(providerName: string, fetchFunc: () => Promise<any>, outputChannel: vscode.OutputChannel) {
    return async () => {
        try {
            outputChannel.appendLine(`Fetching models from ${providerName}...`);
            const result = await fetchFunc();
            outputChannel.appendLine(`Successfully fetched models from ${providerName}`);
            return result;
        } catch (error) {
            await handleProviderError(outputChannel, providerName, error, 'model fetch error');
            return [];
        }
    };
}
