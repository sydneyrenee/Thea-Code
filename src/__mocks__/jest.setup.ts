// Mock the logger globally for all tests
jest.mock("../utils/logging", () => ({
	logger: {
		debug: jest.fn(),
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
		fatal: jest.fn(),
		child: jest.fn().mockReturnValue({
			debug: jest.fn(),
			info: jest.fn(),
			warn: jest.fn(),
			error: jest.fn(),
			fatal: jest.fn(),
		}),
	},
}))

// Add toPosix method to String prototype for all tests, mimicking src/utils/path.ts
// This is needed because the production code expects strings to have this method
// Note: In production, this is added via import in the entry point (extension.ts)
export {}

declare global {
	interface String {
		toPosix(): string
	}
}

// Implementation that matches src/utils/path.ts
function toPosixPath(p: string) {
	// Extended-Length Paths in Windows start with "\\?\" to allow longer paths
	// and bypass usual parsing. If detected, we return the path unmodified.
	const isExtendedLengthPath = p.startsWith("\\\\?\\")

	if (isExtendedLengthPath) {
		return p
	}

	return p.replace(/\\/g, "/")
}

if (!String.prototype.toPosix) {
	String.prototype.toPosix = function (this: string): string {
		return toPosixPath(this)
	}
}

// Suppress console output after Jest teardown to avoid noisy errors from late async logs
const originalConsole = {
	log: console.log.bind(console),
	info: console.info?.bind(console) ?? console.log.bind(console),
	warn: console.warn.bind(console),
	error: console.error.bind(console),
	debug: console.debug?.bind(console) ?? console.log.bind(console),
}

function wrapConsole<K extends keyof typeof originalConsole>(key: K) {
	const fn = originalConsole[key]
	;(console as any)[key] = (...args: unknown[]) => {
		const g = globalThis as Record<string, unknown>
		const afterTeardown = (g.__JEST_TEARDOWN__ as boolean | undefined) === true
		const inActiveTest = (g.__JEST_ACTIVE_TEST__ as boolean | undefined) === true
		if (afterTeardown || !inActiveTest) {
			return // drop logs after tests end or between tests
		}
		try {
			fn(...args as [])
		} catch {
			// ignore
		}
	}
}

wrapConsole('log')
wrapConsole('info')
wrapConsole('warn')
wrapConsole('error')
wrapConsole('debug')
