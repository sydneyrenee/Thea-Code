import * as vscode from 'vscode'
import * as dotenvx from '@dotenvx/dotenvx'
import * as path from 'path'

// Load environment variables from .env file
try {
	// Specify path to .env file in the project root directory
	const envPath = path.join(__dirname, '..', '.env')
	dotenvx.config({ path: envPath })
} catch (e) {
	// Silently handle environment loading errors
	console.warn('Failed to load environment variables:', e)
}

// Import core services and utilities
// These imports will be updated as we migrate the corresponding files
import { TheaProvider } from './core/webview/TheaProvider'
import { CodeActionProvider } from './core/CodeActionProvider'
import { telemetryService } from './services/telemetry/TelemetryService'
import { TerminalRegistry } from './integrations/terminal/TerminalRegistry'
import { API } from './exports/api'

// Constants will be defined in a config file
const EXTENSION_DISPLAY_NAME = 'Thea Code'
const EXTENSION_NAME = 'thea-code'
const configSection = () => 'thea-code'

let outputChannel: vscode.OutputChannel
let extensionContext: vscode.ExtensionContext

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
	extensionContext = context
	outputChannel = vscode.window.createOutputChannel(EXTENSION_DISPLAY_NAME)
	context.subscriptions.push(outputChannel)
	outputChannel.appendLine(`${EXTENSION_DISPLAY_NAME} extension activated`)

	// Initialize telemetry service
	telemetryService.initialize()

	// Initialize terminal shell execution handlers
	TerminalRegistry.initialize()

	// Get default commands from configuration
	const defaultCommands =
		vscode.workspace.getConfiguration(configSection()).get<string[]>('allowedCommands') || []

	// Initialize global state if not already set
	if (!context.globalState.get('allowedCommands')) {
		context.globalState.update('allowedCommands', defaultCommands)
	}

	// Initialize the webview provider
	const provider = new TheaProvider(context, outputChannel, 'sidebar')
	telemetryService.setProvider(provider)

	// Register the webview provider
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(TheaProvider.sideBarId, provider, {
			webviewOptions: { retainContextWhenHidden: true },
		}),
	)

	// Register commands
	// This will be implemented as we migrate the corresponding files
	// registerCommands({ context, outputChannel, provider })

	// Register code actions provider
	context.subscriptions.push(
		vscode.languages.registerCodeActionsProvider({ pattern: '**/*' }, new CodeActionProvider(), {
			providedCodeActionKinds: CodeActionProvider.providedCodeActionKinds,
		}),
	)

	// Register code actions and terminal actions
	// These will be implemented as we migrate the corresponding files
	// registerCodeActions(context)
	// registerTerminalActions(context)

	// Allows other extensions to activate once Thea is ready
	vscode.commands.executeCommand(`${EXTENSION_NAME}.activationCompleted`)

	// Implements the `TheaCodeAPI` interface
	return new API(outputChannel, provider)
}

// This method is called when your extension is deactivated
export async function deactivate() {
	outputChannel.appendLine(`${EXTENSION_DISPLAY_NAME} extension deactivated`)

	// Clean up services
	// These will be implemented as we migrate the corresponding files
	// await McpServerManager.cleanup(extensionContext)
	await telemetryService.shutdown()

	// Clean up terminal handlers
	TerminalRegistry.cleanup()
}
