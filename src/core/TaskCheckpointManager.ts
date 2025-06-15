import * as vscode from "vscode"
import EventEmitter from "events"
import pWaitFor from "p-wait-for"
import { telemetryService } from "../services/telemetry/TelemetryService"
import {
	CheckpointServiceOptions,
	RepoPerTaskCheckpointService,
	RepoPerWorkspaceCheckpointService,
} from "../services/checkpoints"
import { CheckpointStorage } from "../shared/checkpoints"
import { TheaProvider } from "./webview/TheaProvider" // Renamed import and path
import { TheaMessage } from "../shared/ExtensionMessage" // Renamed imports
import { getWorkspacePath } from "../utils/path"
import { DIFF_VIEW_URI_SCHEME } from "../integrations/editor/DiffViewProvider" // Fixed: removed type-only import

// TODO: Rename types if necessary

type CheckpointManagerEvents = {
	checkpointSaved: [commitHash: string]
	checkpointRestored: [commitHash: string]
	checkpointsDisabled: []
	// Note: 'initialize' event is handled internally by listening to the service
}

interface TaskCheckpointManagerOptions {
	taskId: string
	providerRef: WeakRef<TheaProvider> // Renamed type
	checkpointStorage: CheckpointStorage
	getMessages: () => TheaMessage[] // Renamed type
	saveMessages: (messages: TheaMessage[]) => Promise<void> // Renamed type
}

export class TaskCheckpointManager extends EventEmitter<CheckpointManagerEvents> {
	private taskId: string
	private providerRef: WeakRef<TheaProvider> // Renamed type
	private checkpointStorage: CheckpointStorage
	private getMessages: () => TheaMessage[] // Renamed type
	private saveMessages: (messages: TheaMessage[]) => Promise<void> // Renamed type
	private service?: RepoPerTaskCheckpointService | RepoPerWorkspaceCheckpointService
	private _isEnabled: boolean = true
	private _isInitialized: boolean = false

	constructor({ taskId, providerRef, checkpointStorage, getMessages, saveMessages }: TaskCheckpointManagerOptions) {
		super()
		this.taskId = taskId
		this.providerRef = providerRef
		this.checkpointStorage = checkpointStorage
		this.getMessages = getMessages
		this.saveMessages = saveMessages
	}

	get isEnabled(): boolean {
		return this._isEnabled
	}

	get isInitialized(): boolean {
		return this._isInitialized
	}

	private log(message: string) {
		console.log(`[TaskCheckpointManager:${this.taskId}] ${message}`)
		try {
			void this.providerRef.deref()?.log(`[TaskCheckpointManager:${this.taskId}] ${message}`)
		} catch {
			// NO-OP
		}
	}

	public initialize() {
		if (!this._isEnabled) {
			this.log("Initialization skipped: Checkpoints are disabled.")
			return
		}
		if (this.service) {
			this.log("Initialization skipped: Service already exists.")
			return // Already initialized or initializing
		}

		this.log("Initializing checkpoint service...")

		try {
			const workspaceDir = getWorkspacePath()
			if (!workspaceDir) {
				this.log("Workspace folder not found, disabling checkpoints.")
				this._isEnabled = false
				this.emit("checkpointsDisabled")
				return
			}

			const globalStorageDir = this.providerRef.deref()?.context.globalStorageUri.fsPath
			if (!globalStorageDir) {
				this.log("Global storage directory not found, disabling checkpoints.")
				this._isEnabled = false
				this.emit("checkpointsDisabled")
				return
			}

			const options: CheckpointServiceOptions = {
				taskId: this.taskId,
				workspaceDir,
				shadowDir: globalStorageDir,
				log: (msg) => this.log(`[Service] ${msg}`), // Prefix service logs
			}

			// Currently only 'task' storage is fully supported
			if (this.checkpointStorage !== "task") {
				this.log(`Unsupported checkpoint storage type '${this.checkpointStorage}', disabling checkpoints.`)
				this._isEnabled = false
				this.emit("checkpointsDisabled")
				return
			}
			const serviceInstance = RepoPerTaskCheckpointService.create(options)
			this.service = serviceInstance // Assign early to prevent re-entry

			serviceInstance.on("initialize", () => {
				try {
					this._isInitialized = true
					this.log("Checkpoint service initialized.")
					const messages = this.getMessages()
					const isCheckpointNeeded =
						typeof messages.find(({ say }) => say === "checkpoint_saved") === "undefined"

					if (isCheckpointNeeded) {
						this.log("No previous checkpoints found, saving initial checkpoint.")
						this.save() // Save initial checkpoint
					}
				} catch (err) {
					this.log(
						`Error during 'initialize' event: ${err instanceof Error ? err.message : String(err)}. Disabling checkpoints.`,
					)
					this._isEnabled = false
					this.service = undefined // Clear service on error
					this._isInitialized = false
					this.emit("checkpointsDisabled")
				}
			})

			serviceInstance.on("checkpoint", ({ isFirst, fromHash: from, toHash: to }) => {
				try {
					this.log(`Checkpoint saved: ${to} (First: ${isFirst}, From: ${from})`)
					void this.providerRef.deref()?.postMessageToWebview({ type: "currentCheckpointUpdated", text: to })
					this.emit("checkpointSaved", to)
					// The 'say' call is now handled by TheaTask listening to 'checkpointSaved'
				} catch (err) {
					this.log(
						`Error during 'checkpoint' event: ${err instanceof Error ? err.message : String(err)}. Disabling checkpoints.`,
					)
					this._isEnabled = false
					this.service = undefined
					this._isInitialized = false
					this.emit("checkpointsDisabled")
				}
			})

			serviceInstance.initShadowGit().catch((err) => {
				this.log(
					`Error initializing shadow Git: ${err instanceof Error ? err.message : String(err)}. Disabling checkpoints.`,
				)
				console.error(err)
				this._isEnabled = false
				this.service = undefined
				this._isInitialized = false
				this.emit("checkpointsDisabled")
			})
		} catch (err) {
			this.log(
				`Unexpected error during initialization: ${err instanceof Error ? err.message : String(err)}. Disabling checkpoints.`,
			)
			console.error(err)
			this._isEnabled = false
			this.service = undefined
			this._isInitialized = false
			this.emit("checkpointsDisabled")
		}
	}

	private async getInitializedService({
		interval = 250,
		timeout = 15_000,
	}: { interval?: number; timeout?: number } = {}): Promise<
		RepoPerTaskCheckpointService | RepoPerWorkspaceCheckpointService | undefined
	> {
		if (!this._isEnabled) {
			this.log("Cannot get service: Checkpoints are disabled.")
			return undefined
		}
		if (!this.service) {
			this.log("Cannot get service: Service not created (initialization might have failed).")
			return undefined
		}

		if (this._isInitialized) {
			return this.service
		}

		this.log("Waiting for checkpoint service to initialize...")
		try {
			await pWaitFor(() => this._isInitialized, { interval, timeout })
			this.log("Checkpoint service is now initialized.")
			return this.service
		} catch {
			this.log("Timeout waiting for checkpoint service initialization. Disabling checkpoints.")
			this._isEnabled = false
			this.service = undefined // Ensure service is cleared on timeout
			this._isInitialized = false
			this.emit("checkpointsDisabled")
			return undefined
		}
	}

	public async diff({
		ts,
		previousCommitHash,
		commitHash,
		mode,
	}: {
		ts: number
		previousCommitHash?: string
		commitHash: string
		mode: "full" | "checkpoint"
	}) {
		const service = await this.getInitializedService()
		if (!service) {
			this.log("Diff cancelled: Checkpoint service not available.")
			vscode.window.showWarningMessage("Checkpoint service is not available.")
			return
		}

		telemetryService.captureCheckpointDiffed(this.taskId)
		this.log(`Performing diff: Mode=${mode}, To=${commitHash}, From=${previousCommitHash ?? "(auto)"}`)

		if (!previousCommitHash && mode === "checkpoint") {
			const messages = this.getMessages()
			const previousCheckpoint = messages
				.filter(({ say }) => say === "checkpoint_saved")
				.sort((a, b) => b.ts - a.ts)
				.find((message) => message.ts < ts)
			previousCommitHash = previousCheckpoint?.text
			this.log(`Auto-determined previous commit hash for checkpoint diff: ${previousCommitHash}`)
		}

		try {
			const changes = await service.getDiff({ from: previousCommitHash, to: commitHash })

			if (!changes?.length) {
				this.log("No changes found for diff.")
				vscode.window.showInformationMessage("No changes found.")
				return
			}

			this.log(`Found ${changes.length} changes for diff. Opening diff view.`)
			await vscode.commands.executeCommand(
				"vscode.changes",
				mode === "full" ? "Changes since task started" : "Changes since previous checkpoint",
				changes.map((change) => [
					vscode.Uri.file(change.paths.absolute),
					vscode.Uri.parse(`${DIFF_VIEW_URI_SCHEME}:${change.paths.relative}`).with({
						query: Buffer.from(change.content.before ?? "").toString("base64"),
					}),
					vscode.Uri.parse(`${DIFF_VIEW_URI_SCHEME}:${change.paths.relative}`).with({
						query: Buffer.from(change.content.after ?? "").toString("base64"),
					}),
				]),
			)
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : String(err)
			this.log(`Error during diff operation: ${errorMessage}. Disabling checkpoints.`)
			console.error(err)
			this._isEnabled = false
			this.service = undefined
			this._isInitialized = false
			this.emit("checkpointsDisabled")
			vscode.window.showErrorMessage(`Failed to generate diff: ${errorMessage}`)
		}
	}

	public save() {
		if (!this._isEnabled || !this.service) {
			this.log(`Checkpoint save skipped: Service enabled=${this._isEnabled}, exists=${!!this.service}`)
			return
		}

		if (!this._isInitialized) {
			// This case should ideally not happen frequently if initialize() is called early
			// and getInitializedService() is awaited before critical operations.
			// However, if save() is called before initialization completes, we log it.
			this.log("Checkpoint save attempted before service initialization completed.")
			// We don't queue the save here anymore as the initial save is handled by the 'initialize' event handler.
			return
		}

		telemetryService.captureCheckpointCreated(this.taskId)
		this.log("Saving checkpoint...")

		// Start the checkpoint process in the background.
		this.service.saveCheckpoint(`Task: ${this.taskId}, Time: ${Date.now()}`).catch((err) => {
			this.log(
				`Error saving checkpoint: ${err instanceof Error ? err.message : String(err)}. Disabling checkpoints.`,
			)
			console.error(err)
			this._isEnabled = false
			this.service = undefined
			this._isInitialized = false
			this.emit("checkpointsDisabled")
		})
	}

	public async restore({
		commitHash,
		mode, // ts is needed by caller (TheaTask) to truncate messages
	}: {
		ts: number // Keep ts for caller logic, but don't use it directly here
		commitHash: string
		mode: "preview" | "restore"
	}): Promise<boolean> {
		const service = await this.getInitializedService()
		if (!service) {
			this.log("Restore cancelled: Checkpoint service not available.")
			vscode.window.showWarningMessage("Checkpoint service is not available.")
			return false
		}

		this.log(`Restoring checkpoint: Mode=${mode}, Commit=${commitHash}`)

		try {
			await service.restoreCheckpoint(commitHash)
			telemetryService.captureCheckpointRestored(this.taskId)
			this.log(`Checkpoint ${commitHash} restored successfully.`)

			void this.providerRef.deref()?.postMessageToWebview({ type: "currentCheckpointUpdated", text: commitHash })
			this.emit("checkpointRestored", commitHash)

			// Message truncation and task re-init are handled by TheaTask after restore succeeds
			return true
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : String(err)
			this.log(`Error restoring checkpoint ${commitHash}: ${errorMessage}. Disabling checkpoints.`)
			console.error(err)
			this._isEnabled = false
			this.service = undefined
			this._isInitialized = false
			this.emit("checkpointsDisabled")
			vscode.window.showErrorMessage(`Failed to restore checkpoint: ${errorMessage}`)
			return false
		}
	}

	public dispose() {
		this.log("Disposing checkpoint manager.")
		// Removed this.service?.dispose() as the service classes don't seem to have it.
		this.service = undefined
		this._isEnabled = false
		this._isInitialized = false
		this.removeAllListeners() // Clean up event listeners
	}
}
