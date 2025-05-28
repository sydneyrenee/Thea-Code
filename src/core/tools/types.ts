import { TheaAsk, ToolProgressStatus } from "../../schemas"
import type { ToolParamName } from "../assistant-message"
import { ToolResponse } from "../TheaTask"

export type AskApproval = (
	type: TheaAsk,
	partialMessage?: string,
	progressStatus?: ToolProgressStatus,
) => Promise<boolean>

export type HandleError = (action: string, error: Error) => Promise<void>

export type PushToolResult = (content: ToolResponse) => void

export type RemoveClosingTag = (tag: ToolParamName, content?: string) => string

export type AskFinishSubTaskApproval = () => Promise<boolean>

export type ToolDescription = () => string
