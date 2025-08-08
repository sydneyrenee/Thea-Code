import * as vscode from "vscode"
import * as path from "path"
import deepEqual from "fast-deep-equal"

export function getNewDiagnostics(
	oldDiagnostics: [vscode.Uri, vscode.Diagnostic[]][],
	newDiagnostics: [vscode.Uri, vscode.Diagnostic[]][],
): [vscode.Uri, vscode.Diagnostic[]][] {
	const newProblems: [vscode.Uri, vscode.Diagnostic[]][] = []
	const oldMap = new Map(oldDiagnostics)

	for (const [uri, newDiags] of newDiagnostics) {
		const oldDiags = oldMap.get(uri) || []
		const newProblemsForUri = newDiags.filter((newDiag) => !oldDiags.some((oldDiag) => deepEqual(oldDiag, newDiag)))

		if (newProblemsForUri.length > 0) {
			newProblems.push([uri, newProblemsForUri])
		}
	}

	return newProblems
}

// Usage:
// const oldDiagnostics = // ... your old diagnostics array
// const newDiagnostics = // ... your new diagnostics array
// const newProblems = getNewDiagnostics(oldDiagnostics, newDiagnostics);

// Example usage with mocks:
//
// // Mock old diagnostics
// const oldDiagnostics: [vscode.Uri, vscode.Diagnostic[]][] = [
//     [vscode.Uri.file("/path/to/file1.ts"), [
//         new vscode.Diagnostic(new vscode.Range(0, 0, 0, 10), "Old error in file1", vscode.DiagnosticSeverity.Error)
//     ]],
//     [vscode.Uri.file("/path/to/file2.ts"), [
//         new vscode.Diagnostic(new vscode.Range(5, 5, 5, 15), "Old warning in file2", vscode.DiagnosticSeverity.Warning)
//     ]]
// ];
//
// // Mock new diagnostics
// const newDiagnostics: [vscode.Uri, vscode.Diagnostic[]][] = [
//     [vscode.Uri.file("/path/to/file1.ts"), [
//         new vscode.Diagnostic(new vscode.Range(0, 0, 0, 10), "Old error in file1", vscode.DiagnosticSeverity.Error),
//         new vscode.Diagnostic(new vscode.Range(2, 2, 2, 12), "New error in file1", vscode.DiagnosticSeverity.Error)
//     ]],
//     [vscode.Uri.file("/path/to/file2.ts"), [
//         new vscode.Diagnostic(new vscode.Range(5, 5, 5, 15), "Old warning in file2", vscode.DiagnosticSeverity.Warning)
//     ]],
//     [vscode.Uri.file("/path/to/file3.ts"), [
//         new vscode.Diagnostic(new vscode.Range(1, 1, 1, 11), "New error in file3", vscode.DiagnosticSeverity.Error)
//     ]]
// ];
//
// const newProblems = getNewProblems(oldDiagnostics, newDiagnostics);
//
// console.log("New problems:");
// for (const [uri, diagnostics] of newProblems) {
//     console.log(`File: ${uri.fsPath}`);
//     for (const diagnostic of diagnostics) {
//         console.log(`- ${diagnostic.message} (${diagnostic.range.start.line}:${diagnostic.range.start.character})`);
//     }
// }
//
// // Expected output:
// // New problems:
// // File: /path/to/file1.ts
// // - New error in file1 (2:2)
// // File: /path/to/file3.ts
// // - New error in file3 (1:1)

// Create a persistent document cache at module level with TTL support
interface CachedDocument {
	document: vscode.TextDocument
	timestamp: number
}

const documentCache = new Map<string, CachedDocument>()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes TTL
const MAX_CACHE_SIZE = 100 // Maximum number of cached documents

/**
 * Clean up expired entries from the document cache
 */
function cleanupDocumentCache(): void {
	const now = Date.now()
	const entriesToDelete: string[] = []
	
	for (const [key, value] of documentCache.entries()) {
		if (now - value.timestamp > CACHE_TTL) {
			entriesToDelete.push(key)
		}
	}
	
	for (const key of entriesToDelete) {
		documentCache.delete(key)
	}
	
	// If cache is still too large, remove oldest entries
	if (documentCache.size > MAX_CACHE_SIZE) {
		const sortedEntries = Array.from(documentCache.entries())
			.sort((a, b) => a[1].timestamp - b[1].timestamp)
		
		const entriesToRemove = sortedEntries.slice(0, documentCache.size - MAX_CACHE_SIZE)
		for (const [key] of entriesToRemove) {
			documentCache.delete(key)
		}
	}
}

/**
 * Converts diagnostics to a formatted string representation of problems
 * 
 * @param diagnostics Array of diagnostics with their URIs
 * @param severities Array of diagnostic severities to include
 * @param cwd Current working directory for relative path formatting
 * @returns Formatted string of problems, empty string if none found
 */
export async function diagnosticsToProblemsString(
	diagnostics: [vscode.Uri, vscode.Diagnostic[]][],
	severities: vscode.DiagnosticSeverity[],
	cwd: string,
): Promise<string> {
	// Clean up expired cache entries periodically
	cleanupDocumentCache()
	
	// Pre-load all documents in parallel before processing diagnostics
	const documentPromises = new Map<string, Promise<vscode.TextDocument | null>>()
	const now = Date.now()
	
	// First pass: collect all unique URIs that need documents
	for (const [uri, fileDiagnostics] of diagnostics) {
		const problems = fileDiagnostics.filter((d) => severities.includes(d.severity))
		if (problems.length > 0) {
			const uriString = uri.toString()
			const cachedEntry = documentCache.get(uriString)
			
			// Check if we have a valid cached document
			if (cachedEntry && (now - cachedEntry.timestamp) < CACHE_TTL) {
				// Document is cached and still valid, skip loading
				continue
			}
			
			if (!documentPromises.has(uriString)) {
				// Create a properly typed promise with error handling
				// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
				const openDocPromise: Thenable<vscode.TextDocument> = vscode.workspace.openTextDocument(uri)
				const docPromise: Promise<vscode.TextDocument | null> = Promise.resolve(openDocPromise)
					.then((doc): vscode.TextDocument | null => doc)
					.catch((e: unknown): null => {
						// Safely access error properties with type checking
						const errorMessage = e instanceof Error ? e.message : String(e)
						console.warn(`Failed to open document ${uriString}: ${errorMessage}`)
						return null
					})
				
				documentPromises.set(uriString, docPromise)
			}
		}
	}
	
	// Wait for all documents to load in parallel
	await Promise.all([...documentPromises.values()])
	
	// Store successfully loaded documents in the cache with timestamp
	for (const [uriString, promise] of documentPromises.entries()) {
		// No try/catch needed here since errors are already handled in the promise chain
		const doc = await promise
		if (doc) {
			documentCache.set(uriString, {
				document: doc,
				timestamp: now
			})
		}
	}
	
	// Process diagnostics with loaded documents
	const resultParts: string[] = []
	
	for (const [uri, fileDiagnostics] of diagnostics) {
		const problems = fileDiagnostics.filter((d) => severities.includes(d.severity))
		if (problems.length > 0) {
			// Add file path
			resultParts.push(`\n\n${path.relative(cwd, uri.fsPath).toPosix()}`)
			
			for (const diagnostic of problems) {
				// Determine severity label
				let label: string
				switch (diagnostic.severity) {
					case vscode.DiagnosticSeverity.Error:
						label = "Error"
						break
					case vscode.DiagnosticSeverity.Warning:
						label = "Warning"
						break
					case vscode.DiagnosticSeverity.Information:
						label = "Information"
						break
					case vscode.DiagnosticSeverity.Hint:
						label = "Hint"
						break
					default:
						label = "Diagnostic"
				}
				
				const line = diagnostic.range.start.line + 1 // VSCode lines are 0-indexed
				const source = diagnostic.source ? `${diagnostic.source} ` : ""
				
				try {
					const uriString = uri.toString()
					const cachedEntry = documentCache.get(uriString)
					
					if (!cachedEntry || !cachedEntry.document) {
						// Skip this diagnostic if document couldn't be loaded
						resultParts.push(`\n- [${source}${label}] ${line} | <document unavailable> : ${diagnostic.message}`)
						continue
					}
					
					const document = cachedEntry.document
					
					try {
						const lineContent = document.lineAt(diagnostic.range.start.line).text
						resultParts.push(`\n- [${source}${label}] ${line} | ${lineContent} : ${diagnostic.message}`)
					} catch {
						// Handle case where line doesn't exist in document
						resultParts.push(`\n- [${source}${label}] ${line} | <line content unavailable> : ${diagnostic.message}`)
					}
				} catch {
					// Provide a fallback when document access fails
					resultParts.push(`\n- [${source}${label}] ${line} | <error accessing content> : ${diagnostic.message}`)
				}
			}
		}
	}
	
	// Join all parts and trim any leading/trailing whitespace
	return resultParts.join("").trim()
}
