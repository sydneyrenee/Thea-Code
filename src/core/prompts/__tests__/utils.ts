import * as fs from "fs/promises"
import { PathLike } from "fs"
import "../../utils/path" // Import to get toPosix string extension

// Make a path take a unix-like form.  Useful for making path comparisons.
export function toPosix(filePath: PathLike | fs.FileHandle) {
	if (typeof filePath === 'string' || filePath instanceof URL || Buffer.isBuffer(filePath)) {
		return filePath.toString().toPosix()
	}
	// For FileHandle, we can't convert to path, so return empty string or throw
	throw new Error('Cannot convert FileHandle to path')
}
