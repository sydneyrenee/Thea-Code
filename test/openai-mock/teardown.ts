import { openAIMock } from "./setup.ts"

export const openaiTeardown = (): Promise<void> => {
	return new Promise((resolve) => {
		if (openAIMock) {
			console.log("\nStopping OpenAI API Mock...")
			openAIMock.stopMocking()
			console.log("OpenAI API Mock stopped.")
		}
		resolve()
	})
}
