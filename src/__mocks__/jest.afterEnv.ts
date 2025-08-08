// Flag active test phase so console wrapper only drops logs after teardown or after each test
beforeAll(() => {
	;(globalThis as any).__JEST_ACTIVE_TEST__ = true
})

afterEach(() => {
	// If a test completes, mark not active to reduce post-test logging noise between tests
	;(globalThis as any).__JEST_ACTIVE_TEST__ = false
})

beforeEach(() => {
	// Re-enable during each test start
	;(globalThis as any).__JEST_ACTIVE_TEST__ = true
})
