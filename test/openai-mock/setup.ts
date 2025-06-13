import { mockOpenAIResponse } from "openai-api-mock"

export let openAIMock: ReturnType<typeof mockOpenAIResponse> | null = null

export default async () => {
	console.log("\nStarting OpenAI API Mock...")
	openAIMock = mockOpenAIResponse(true)
	console.log("OpenAI API Mock started.")
}
