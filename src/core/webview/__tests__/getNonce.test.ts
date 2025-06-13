import { getNonce } from "../getNonce"

describe("getNonce", () => {
	it("generates a 32-character alphanumeric string", () => {
		const nonce = getNonce()
		expect(nonce).toMatch(/^[A-Za-z0-9]{32}$/)
	})

	it("returns a new value for each call", () => {
		const first = getNonce()
		const second = getNonce()
		expect(first).not.toBe(second)
		expect(first).toMatch(/^[A-Za-z0-9]{32}$/)
		expect(second).toMatch(/^[A-Za-z0-9]{32}$/)
	})
})
