// __tests__/MockTransport.ts
import { CompactTransport } from "../CompactTransport"
import type { CompactLogEntry, CompactTransportConfig } from "../types"

const TEST_CONFIG: CompactTransportConfig = {
	level: "fatal",
	fileOutput: {
		enabled: false,
		path: "",
	},
}

export class MockTransport extends CompactTransport {
	public entries: CompactLogEntry[] = []
	public closed = false

	constructor() {
		super(TEST_CONFIG)
	}

	override write(entry: CompactLogEntry): void {
		this.entries.push(entry)
	}

	override close(): void {
		this.closed = true
		super.close()
	}

	clear(): void {
		this.entries = []
		this.closed = false
	}
}
