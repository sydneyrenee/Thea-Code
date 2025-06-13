// npx jest src/shared/__tests__/doesFileMatchRegex.test.ts
import { doesFileMatchRegex } from "../modes"

describe("doesFileMatchRegex", () => {
	it("returns true when pattern matches", () => {
		expect(doesFileMatchRegex("src/file.ts", "\\.ts$")).toBe(true)
	})

	it("returns false when pattern does not match", () => {
		expect(doesFileMatchRegex("src/file.ts", "\\.js$")).toBe(false)
	})

	it("handles invalid regex gracefully", () => {
		const errSpy = jest.spyOn(console, "error").mockImplementation(() => {})
		expect(doesFileMatchRegex("src/file.ts", "[")).toBe(false)
		expect(errSpy).toHaveBeenCalled()
		errSpy.mockRestore()
	})
})
