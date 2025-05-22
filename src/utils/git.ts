import { exec } from "child_process"
import { promisify } from "util"
import { truncateOutput } from "../integrations/misc/extract-text"

const execAsync = promisify(exec)
const GIT_OUTPUT_LINE_LIMIT = 500

export interface GitCommit {
	hash: string
	shortHash: string
	subject: string
	author: string
	date: string
}

async function checkGitRepo(cwd: string): Promise<boolean> {
	try {
		await execAsync("git rev-parse --git-dir", { cwd })
		return true
	} catch {
		return false
	}
}

async function checkGitInstalled(): Promise<boolean> {
	try {
		await execAsync("git --version")
		return true
	} catch {
		return false
	}
}

export async function searchCommits(query: string, cwd: string): Promise<GitCommit[]> {
	try {
		const isInstalled = await checkGitInstalled()
		if (!isInstalled) {
			throw new Error("Git is not installed.");
		}

		const isRepo = await checkGitRepo(cwd)
		if (!isRepo) {
			throw new Error("Not a git repository.");
		}

		// Search commits by hash or message, limiting to 10 results
		const { stdout } = await execAsync(
			`git log -n 10 --format="%H%n%h%n%s%n%an%n%ad" --date=short ` + `--grep="${query}" --regexp-ignore-case`,
			{ cwd },
		)

		let output = stdout
		if (!output.trim() && /^[a-f0-9]+$/i.test(query)) {
			// If no results from grep search and query looks like a hash, try searching by hash
			const { stdout: hashStdout } = await execAsync(
				`git log -n 10 --format="%H%n%h%n%s%n%an%n%ad" --date=short ` + `--author-date-order ${query}`,
				{ cwd },
			).catch((error) => {
				// If the error indicates no such revision, return empty stdout
				if ((error as Error).message.includes("unknown revision") || (error as Error).message.includes("bad object")) {
					return { stdout: "" };
				}
				throw error; // Re-throw other errors
			});

			if (!hashStdout.trim()) {
				return []
			}

			output = hashStdout
		}

		const commits: GitCommit[] = []
		const lines = output
			.trim()
			.split("\n")
			.filter((line) => line !== "--")

		for (let i = 0; i < lines.length; i += 5) {
			commits.push({
				hash: lines[i],
				shortHash: lines[i + 1],
				subject: lines[i + 2],
				author: lines[i + 3],
				date: lines[i + 4],
			})
		}

		return commits
	} catch (error) {
		console.error("Error searching commits:", error);
		throw error;
	}
}

export async function getCommitInfo(hash: string, cwd: string): Promise<string> {
	try {
		const isInstalled = await checkGitInstalled()
		if (!isInstalled) {
			throw new Error("Git is not installed.");
		}

		const isRepo = await checkGitRepo(cwd)
		if (!isRepo) {
			throw new Error("Not a git repository.");
		}

		// Get commit info, stats, and diff separately
		const { stdout: info } = await execAsync(`git show --format="%H%n%h%n%s%n%an%n%ad%n%b" --no-patch ${hash}`, {
			cwd,
		})
		const [fullHash, shortHash, subject, author, date, body] = info.trim().split("\n")

		const { stdout: stats } = await execAsync(`git show --stat --format="" ${hash}`, { cwd })

		const { stdout: diff } = await execAsync(`git show --format="" ${hash}`, { cwd })

		const summary = `Commit: ${shortHash} (${fullHash})\n` +
			`Author: ${author}\n` +
			`Date: ${date}\n\n` +
			`Message: ${subject}\n` +
			(body ? `\nDescription:\n${body}\n` : "") +
			`\nFiles Changed:\n${stats.trim()}\n` +
			`\nFull Changes:`;

		const output = summary + "\n\n" + diff.trim()
		return truncateOutput(output, GIT_OUTPUT_LINE_LIMIT)
	} catch (error) {
		console.error("Error getting commit info:", error);
		throw error;
	}
}

export async function getWorkingState(cwd: string): Promise<string> {
	try {
		const isInstalled = await checkGitInstalled()
		if (!isInstalled) {
			throw new Error("Git is not installed.");
		}

		const isRepo = await checkGitRepo(cwd)
		if (!isRepo) {
			throw new Error("Not a git repository.");
		}

		// Get status of working directory
		const { stdout: status } = await execAsync("git status --short", { cwd })
		if (!status.trim()) {
			return "No changes in working directory"
		}

		// Get all changes (both staged and unstaged) compared to HEAD
		const { stdout: diff } = await execAsync("git diff HEAD", { cwd })
		const lineLimit = GIT_OUTPUT_LINE_LIMIT
		const output = `Working directory changes:\n\n${status}\n\n${diff}`.trim()
		return truncateOutput(output, lineLimit)
	} catch (error) {
		console.error("Error getting working state:", error);
		throw error;
	}
}
