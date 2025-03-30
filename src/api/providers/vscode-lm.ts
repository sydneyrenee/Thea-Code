import { Anthropic } from "@anthropic-ai/sdk";
import * as vscode from "vscode";

import { SingleCompletionHandler } from "../";
import { calculateApiCostAnthropic } from "../../utils/cost";
import { ApiStream } from "../transform/stream";
import { convertToVsCodeLmMessages } from "../transform/vscode-lm-format";
import { SELECTOR_SEPARATOR, stringifyVsCodeLmModelSelector } from "../../shared/vsCodeSelectorUtils";
import { ApiHandlerOptions, ModelInfo, openAiModelInfoSaneDefaults } from "../../shared/api";
import { BaseProvider } from "./base-provider";
// TODO: Update this path if the generated file is elsewhere relative to src/api/providers
import { TEXT_PATTERNS } from "../../../dist/thea-config"; // Import from generated config

/**
 * Handles interaction with VS Code's Language Model API for chat-based operations.
 */
// Helper function to generate a consistent log prefix using the current branding
function getLogPrefix(): string {
	return TEXT_PATTERNS.logPrefix();
}

export class VsCodeLmHandler extends BaseProvider implements SingleCompletionHandler {
	protected options: ApiHandlerOptions;
	private client: vscode.LanguageModelChat | null;
	private disposable: vscode.Disposable | null;
	private currentRequestCancellation: vscode.CancellationTokenSource | null;

	constructor(options: ApiHandlerOptions) {
		super();
		this.options = options;
		this.client = null;
		this.disposable = null;
		this.currentRequestCancellation = null;

		try {
			this.disposable = vscode.workspace.onDidChangeConfiguration((event) => {
				if (event.affectsConfiguration("lm")) {
					try {
						this.client = null;
						this.ensureCleanState();
					} catch (error) {
						console.error("Error during configuration change cleanup:", error);
					}
				}
			});
		} catch (error) {
			this.dispose();
			throw new Error(
				`${getLogPrefix()} Failed to initialize handler: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		}
	}

	async createClient(selector: vscode.LanguageModelChatSelector): Promise<vscode.LanguageModelChat> {
		try {
			const models = await vscode.lm.selectChatModels(selector);
			if (models && Array.isArray(models) && models.length > 0) {
				return models[0];
			}
			// Create a minimal model if no models are available
			return {
				id: "default-lm", name: "Default Language Model", vendor: "vscode", family: "lm", version: "1.0", maxInputTokens: 8192,
				sendRequest: async () => ({
					stream: (async function* () { yield new vscode.LanguageModelTextPart("Language model functionality is limited. Please check VS Code configuration.") })(),
					text: (async function* () { yield "Language model functionality is limited. Please check VS Code configuration." })(),
				}),
				countTokens: async () => 0,
			};
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : "Unknown error";
			throw new Error(`${getLogPrefix()} Failed to select model: ${errorMessage}`);
		}
	}

	dispose(): void {
		this.disposable?.dispose();
		this.currentRequestCancellation?.cancel();
		this.currentRequestCancellation?.dispose();
	}

	override async countTokens(content: Array<Anthropic.Messages.ContentBlockParam>): Promise<number> {
		let textContent = "";
		for (const block of content) {
			if (block.type === "text") { textContent += block.text || ""; }
			else if (block.type === "image") { textContent += "[IMAGE]"; }
		}
		return this.internalCountTokens(textContent);
	}

	private async internalCountTokens(text: string | vscode.LanguageModelChatMessage): Promise<number> {
		if (!this.client) { console.warn(`${getLogPrefix()} No client available for token counting`); return 0; }
		if (!this.currentRequestCancellation) { console.warn(`${getLogPrefix()} No cancellation token available for token counting`); return 0; }
		if (!text) { console.debug(`${getLogPrefix()} Empty text provided for token counting`); return 0; }

		try {
			let tokenCount: number;
			if (typeof text === "string") {
				tokenCount = await this.client.countTokens(text, this.currentRequestCancellation.token);
			} else if (text instanceof vscode.LanguageModelChatMessage) {
				if (!text.content || (Array.isArray(text.content) && text.content.length === 0)) {
					console.debug(`${getLogPrefix()} Empty chat message content`); return 0;
				}
				tokenCount = await this.client.countTokens(text, this.currentRequestCancellation.token);
			} else {
				console.warn(`${getLogPrefix()} Invalid input type for token counting`); return 0;
			}

			if (typeof tokenCount !== "number") { console.warn(`${getLogPrefix()} Non-numeric token count received:`, tokenCount); return 0; }
			if (tokenCount < 0) { console.warn(`${getLogPrefix()} Negative token count received:`, tokenCount); return 0; }
			return tokenCount;
		} catch (error) {
			if (error instanceof vscode.CancellationError) { console.debug(`${getLogPrefix()} Token counting cancelled by user`); return 0; }
			const errorMessage = error instanceof Error ? error.message : "Unknown error";
			console.warn(`${getLogPrefix()} Token counting failed:`, errorMessage);
			if (error instanceof Error && error.stack) { console.debug("Token counting error stack:", error.stack); }
			return 0;
		}
	}

	private async calculateTotalInputTokens(systemPrompt: string, vsCodeLmMessages: vscode.LanguageModelChatMessage[]): Promise<number> {
		const systemTokens: number = await this.internalCountTokens(systemPrompt);
		const messageTokens: number[] = await Promise.all(vsCodeLmMessages.map((msg) => this.internalCountTokens(msg)));
		return systemTokens + messageTokens.reduce((sum: number, tokens: number): number => sum + tokens, 0);
	}

	private ensureCleanState(): void {
		if (this.currentRequestCancellation) {
			this.currentRequestCancellation.cancel();
			this.currentRequestCancellation.dispose();
			this.currentRequestCancellation = null;
		}
	}

	private async getClient(): Promise<vscode.LanguageModelChat> {
		if (!this.client) {
			console.debug(`${getLogPrefix()} Getting client with options:`, { /* options logging */ });
			try {
				const selector = this.options?.vsCodeLmModelSelector || {};
				console.debug(`${getLogPrefix()} Creating client with selector:`, selector);
				this.client = await this.createClient(selector);
			} catch (error) {
				const message = error instanceof Error ? error.message : "Unknown error";
				console.error(`${getLogPrefix()} Client creation failed:`, message);
				throw new Error(`${getLogPrefix()} Failed to create client: ${message}`);
			}
		}
		return this.client;
	}

	// Note: cleanTerminalOutput and cleanMessageContent methods seem unrelated to branding and are kept as is.
	private cleanTerminalOutput(text: string): string {
		if (!text) { return ""; }
		return text
			.replace(/\r\n/g, "\n").replace(/\r/g, "\n") // Normalize line breaks
			.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "") // ANSI escape sequences
			.replace(/\x9B[0-?]*[ -/]*[@-~]/g, "") // CSI sequences
			.replace(/\x1B\][0-9;]*(?:\x07|\x1B\\)/g, "") // OSC sequences
			.replace(/[\x00-\x09\x0B-\x0C\x0E-\x1F\x7F]/g, "") // Control characters
			.replace(/\x1B[PD].*?\x1B\\/g, "").replace(/\x1B_.*?\x1B\\/g, "").replace(/\x1B\^.*?\x1B\\/g, "") // DCS, APC, PM sequences
			.replace(/\x1B\[[\d;]*[HfABCDEFGJKST]/g, "") // Cursor movement, clear screen
			.replace(/^(?:PS )?[A-Z]:\\[^\n]*$/gm, "").replace(/^;?Cwd=.*$/gm, "") // Windows paths, etc.
			.replace(/\\x[0-9a-fA-F]{2}/g, "").replace(/\\u[0-9a-fA-F]{4}/g, "") // Escaped sequences
			.replace(/\n{3,}/g, "\n\n").trim(); // Final cleanup
	}
	private cleanMessageContent(content: any): any {
		if (!content) { return content; }
		if (typeof content === "string") { return this.cleanTerminalOutput(content); }
		if (Array.isArray(content)) { return content.map((item) => this.cleanMessageContent(item)); }
		if (typeof content === "object") {
			const cleaned: any = {};
			for (const [key, value] of Object.entries(content)) { cleaned[key] = this.cleanMessageContent(value); }
			return cleaned;
		}
		return content;
	}


	override async *createMessage(systemPrompt: string, messages: Anthropic.Messages.MessageParam[]): ApiStream {
		this.ensureCleanState();
		const client: vscode.LanguageModelChat = await this.getClient();
		const cleanedSystemPrompt = this.cleanTerminalOutput(systemPrompt);
		const cleanedMessages = messages.map((msg) => ({ ...msg, content: this.cleanMessageContent(msg.content) }));
		const vsCodeLmMessages: vscode.LanguageModelChatMessage[] = [ vscode.LanguageModelChatMessage.Assistant(cleanedSystemPrompt), ...convertToVsCodeLmMessages(cleanedMessages) ];
		this.currentRequestCancellation = new vscode.CancellationTokenSource();
		const totalInputTokens: number = await this.calculateTotalInputTokens(systemPrompt, vsCodeLmMessages);
		let accumulatedText: string = "";

		try {
			const requestOptions: vscode.LanguageModelChatRequestOptions = {
				// Use TEXT_PATTERNS for justification message
				justification: `${TEXT_PATTERNS.createRoleDefinition("", "Assistant").split(",")[0]} would like to use '${client.name}' from '${client.vendor}', Click 'Allow' to proceed.`,
			};
			const response: vscode.LanguageModelChatResponse = await client.sendRequest( vsCodeLmMessages, requestOptions, this.currentRequestCancellation.token );

			for await (const chunk of response.stream) {
				if (chunk instanceof vscode.LanguageModelTextPart) {
					if (typeof chunk.value !== "string") { console.warn(`${getLogPrefix()} Invalid text part value received:`, chunk.value); continue; }
					accumulatedText += chunk.value;
					yield { type: "text", text: chunk.value };
				} else if (chunk instanceof vscode.LanguageModelToolCallPart) {
					try {
						if (!chunk.name || typeof chunk.name !== "string") { console.warn(`${getLogPrefix()} Invalid tool name received:`, chunk.name); continue; }
						if (!chunk.callId || typeof chunk.callId !== "string") { console.warn(`${getLogPrefix()} Invalid tool callId received:`, chunk.callId); continue; }
						if (!chunk.input || typeof chunk.input !== "object") { console.warn(`${getLogPrefix()} Invalid tool input received:`, chunk.input); continue; }
						const toolCall = { type: "tool_call", name: chunk.name, arguments: chunk.input, callId: chunk.callId };
						const toolCallText = JSON.stringify(toolCall);
						accumulatedText += toolCallText;
						console.debug(`${getLogPrefix()} Processing tool call:`, { name: chunk.name, callId: chunk.callId, inputSize: JSON.stringify(chunk.input).length });
						yield { type: "text", text: toolCallText };
					} catch (error) { console.error(`${getLogPrefix()} Failed to process tool call:`, error); continue; }
				} else { console.warn(`${getLogPrefix()} Unknown chunk type received:`, chunk); }
			}

			const totalOutputTokens: number = await this.internalCountTokens(accumulatedText);
			yield { type: "usage", inputTokens: totalInputTokens, outputTokens: totalOutputTokens, totalCost: calculateApiCostAnthropic(this.getModel().info, totalInputTokens, totalOutputTokens) };
		} catch (error: unknown) {
			this.ensureCleanState();
			if (error instanceof vscode.CancellationError) { throw new Error(`${getLogPrefix()} Request cancelled by user`); }
			if (error instanceof Error) { console.error(`${getLogPrefix()} Stream error details:`, { message: error.message, stack: error.stack, name: error.name }); throw error; }
			else if (typeof error === "object" && error !== null) { const errorDetails = JSON.stringify(error, null, 2); console.error(`${getLogPrefix()} Stream error object:`, errorDetails); throw new Error(`${getLogPrefix()} Response stream error: ${errorDetails}`); }
			else { const errorMessage = String(error); console.error(`${getLogPrefix()} Unknown stream error:`, errorMessage); throw new Error(`${getLogPrefix()} Response stream error: ${errorMessage}`); }
		}
	}

	override getModel(): { id: string; info: ModelInfo } {
		if (this.client) {
			const requiredProps = { id: this.client.id, vendor: this.client.vendor, family: this.client.family, version: this.client.version, maxInputTokens: this.client.maxInputTokens };
			for (const [prop, value] of Object.entries(requiredProps)) { if (!value && value !== 0) { console.warn(`${getLogPrefix()} Client missing ${prop} property`); } }
			const modelParts = [this.client.vendor, this.client.family, this.client.version].filter(Boolean);
			const modelId = this.client.id || modelParts.join(SELECTOR_SEPARATOR);
			const modelInfo: ModelInfo = { maxTokens: -1, contextWindow: typeof this.client.maxInputTokens === "number" ? Math.max(0, this.client.maxInputTokens) : openAiModelInfoSaneDefaults.contextWindow, supportsImages: false, supportsPromptCache: true, inputPrice: 0, outputPrice: 0, description: `VSCode Language Model: ${modelId}` };
			return { id: modelId, info: modelInfo };
		}
		const fallbackId = this.options.vsCodeLmModelSelector ? stringifyVsCodeLmModelSelector(this.options.vsCodeLmModelSelector) : "vscode-lm";
		console.debug(`${getLogPrefix()} No client available, using fallback model info`);
		return { id: fallbackId, info: { ...openAiModelInfoSaneDefaults, description: `VSCode Language Model (Fallback): ${fallbackId}` } };
	}

	async completePrompt(prompt: string): Promise<string> {
		try {
			const client = await this.getClient();
			const response = await client.sendRequest([vscode.LanguageModelChatMessage.User(prompt)], {}, new vscode.CancellationTokenSource().token);
			let result = "";
			for await (const chunk of response.stream) { if (chunk instanceof vscode.LanguageModelTextPart) { result += chunk.value; } }
			return result;
		} catch (error) {
			if (error instanceof Error) { throw new Error(`VSCode LM completion error: ${error.message}`); }
			throw error;
		}
	}
}

import { createSafeModelFetcher } from './apiProviderUtils';

export const getVsCodeLmModels = (outputChannel: vscode.OutputChannel) => {
    const fetchVsCodeLmModels = async () => {
        // Stub implementation
        return [];
    };
    
    return createSafeModelFetcher('VS Code Language Models', fetchVsCodeLmModels, outputChannel)();
};
