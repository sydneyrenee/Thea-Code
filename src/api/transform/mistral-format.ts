import { AssistantMessage } from "@mistralai/mistralai/models/components/assistantmessage"
import { SystemMessage } from "@mistralai/mistralai/models/components/systemmessage"
import { ToolMessage } from "@mistralai/mistralai/models/components/toolmessage"
import { UserMessage } from "@mistralai/mistralai/models/components/usermessage"
import type { NeutralConversationHistory } from "../../shared/neutral-history"
import { convertToMistralMessages as convertFromNeutral } from "./neutral-mistral-format"

export type MistralMessage =
	| (SystemMessage & { role: "system" })
	| (UserMessage & { role: "user" })
	| (AssistantMessage & { role: "assistant" })
	| (ToolMessage & { role: "tool" })

export function convertToMistralMessages(neutralHistory: NeutralConversationHistory): MistralMessage[] {
	return convertFromNeutral(neutralHistory)
}
