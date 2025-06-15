import * as fs from "node:fs/promises"
import * as path from "path"

import { build, filesystem, GluegunPrompt } from "gluegun"
import { runTests } from "@vscode/test-electron"

interface BenchmarkConfig {
	language?: string
	exercise?: string
	runId?: string
}

interface GluegunParameters {
	first?: string
	second?: string
	options: Record<string, string>
}

interface GluegunCommandContext {
	config: BenchmarkConfig
	parameters: GluegunParameters
}

// console.log(__dirname)
// <...>/Thea-Code/benchmark/src

const extensionDevelopmentPath = path.resolve(__dirname, "../../")
const extensionTestsPath = path.resolve(__dirname, "../out/runExercise")
const promptsPath = path.resolve(__dirname, "../prompts")
const exercisesPath = path.resolve(__dirname, "../../../exercises")
const languages = ["cpp", "go", "java", "javascript", "python", "rust"]

async function runAll({ runId, model }: { runId: number; model: string }) {
	for (const language of languages) {
		await runLanguage({ runId, model, language })
	}
}

async function runLanguage({ runId, model, language }: { runId: number; model: string; language: string }) {
	const languagePath = path.resolve(exercisesPath, language)

	try {
		await fs.access(languagePath)
	} catch {
		console.error(`Language directory ${languagePath} does not exist`)
		process.exit(1)
	}

	const exercises = filesystem
		.subdirectories(languagePath)
		.map((exercise) => path.basename(exercise))
		.filter((exercise) => !exercise.startsWith("."))

	for (const exercise of exercises) {
		await runExercise({ runId, model, language, exercise })
	}
}

async function runExercise({
	runId,
	model,
	language,
	exercise,
}: {
	runId: number
	model: string
	language: string
	exercise: string
}) {
	const workspacePath = path.resolve(exercisesPath, language, exercise)
	const promptPath = path.resolve(promptsPath, `${language}.md`)

	const extensionTestsEnv = {
		PROMPT_PATH: promptPath,
		WORKSPACE_PATH: workspacePath,
		OPENROUTER_MODEL_ID: model,
		RUN_ID: runId.toString(),
	}

	try {
		await fs.access(path.resolve(workspacePath, "usage.json"))
		console.log(`Test result exists for ${language} / ${exercise}, skipping`)
		return
	} catch {
		// File doesn't exist, continue with test
	}

	console.log(`Running ${language} / ${exercise}`)

	await runTests({
		extensionDevelopmentPath,
		extensionTestsPath,
		launchArgs: [workspacePath, "--disable-extensions"],
		extensionTestsEnv,
	})
}

async function askLanguage(prompt: GluegunPrompt) {
	const languages = filesystem.subdirectories(exercisesPath)

	if (languages.length === 0) {
		throw new Error(`No languages found in ${exercisesPath}`)
	}

	const { language } = await prompt.ask<{ language: string }>({
		type: "select",
		name: "language",
		message: "Which language?",
		choices: languages.map((language) => path.basename(language)).filter((language) => !language.startsWith(".")),
	})

	return language
}

async function askExercise(prompt: GluegunPrompt, language: string) {
	const exercises = filesystem.subdirectories(path.join(exercisesPath, language))

	if (exercises.length === 0) {
		throw new Error(`No exercises found for ${language}`)
	}

	const { exercise } = await prompt.ask<{ exercise: string }>({
		type: "select",
		name: "exercise",
		message: "Which exercise?",
		choices: exercises.map((exercise) => path.basename(exercise)),
	})

	return exercise
}

async function createRun({ model }: { model: string }): Promise<{ id: number; model: string }> {
	const response = await fetch("http://localhost:3000/api/runs", {
		method: "POST",
		body: JSON.stringify({ model }),
	})

	if (!response.ok) {
		throw new Error(`Failed to create run: ${response.statusText}`)
	}

	const {
		run: [run],
	} = (await response.json()) as { run: [{ id: number; model: string }] }
	return run
}

async function main() {
	const cli = build()
		.brand("benchmark-runner")
		.src(__dirname)
		.help()
		.version()
		.command({
			name: "run",
			run: ({ config, parameters }: GluegunCommandContext) => {
				config.language = parameters.first
				config.exercise = parameters.second

				if (parameters.options["runId"]) {
					config.runId = parameters.options["runId"]
				}
			},
		})
		.defaultCommand() // Use the default command if no args.
		.create()

	const { print, prompt, config } = await cli.run(process.argv)
	const benchmarkConfig = config as BenchmarkConfig

	try {
		const model = "anthropic/claude-3.7-sonnet"
		const runId = benchmarkConfig.runId ? Number(benchmarkConfig.runId) : (await createRun({ model })).id

		if (benchmarkConfig.language === "all") {
			console.log("Running all exercises for all languages")
			await runAll({ runId, model })
		} else if (benchmarkConfig.exercise === "all") {
			console.log(`Running all exercises for ${benchmarkConfig.language!}`)
			await runLanguage({ runId, model, language: benchmarkConfig.language! })
		} else {
			const language = benchmarkConfig.language || (await askLanguage(prompt))
			const exercise = benchmarkConfig.exercise || (await askExercise(prompt, language))
			await runExercise({ runId, model, language, exercise })
		}

		process.exit(0)
	} catch (error) {
		print.error(error)
		process.exit(1)
	}
}

void main()
