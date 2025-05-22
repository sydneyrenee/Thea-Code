import { ApiHandler, SingleCompletionHandler } from ".."
import { ApiHandlerOptions, ModelInfo } from "../../shared/api"
import { ApiStream } from "../transform/stream"
import { NeutralConversationHistory, NeutralMessageContent } from "../../shared/neutral-history"

interface FakeAI {
	createMessage(systemPrompt: string, messages: NeutralConversationHistory): ApiStream
	getModel(): { id: string; info: ModelInfo }
	countTokens(content: NeutralMessageContent): Promise<number>
	completePrompt(prompt: string): Promise<string>
}

export class FakeAIHandler implements ApiHandler, SingleCompletionHandler {
	private ai: FakeAI

	constructor(options: ApiHandlerOptions) {
		if (!options.fakeAi) {
			throw new Error("Fake AI is not set")
		}

		this.ai = options.fakeAi as FakeAI
	}

	async *createMessage(systemPrompt: string, messages: NeutralConversationHistory): ApiStream {
		yield* this.ai.createMessage(systemPrompt, messages)
	}

	getModel(): { id: string; info: ModelInfo } {
		return this.ai.getModel()
	}

	countTokens(content: NeutralMessageContent): Promise<number> {
		return this.ai.countTokens(content)
	}

	completePrompt(prompt: string): Promise<string> {
		return this.ai.completePrompt(prompt)
	}
}
