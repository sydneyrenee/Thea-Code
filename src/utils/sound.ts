import * as vscode from "vscode"
import * as path from "path"
import soundPlay from "sound-play"

type SoundPlayFunction = (filepath: string, volume?: number) => Promise<void>

const sound: SoundPlayFunction = soundPlay

/**
 * Minimum interval (in milliseconds) to prevent continuous playback
 */
const MIN_PLAY_INTERVAL = 500

/**
 * Timestamp of when sound was last played
 */
let lastPlayedTime = 0

/**
 * Determine if a file is a WAV file
 * @param filepath string
 * @returns boolean
 */
export const isWAV = (filepath: string): boolean => {
	return path.extname(filepath).toLowerCase() === ".wav"
}

let isSoundEnabled = false
let volume = 0.5

/**
 * Set sound configuration
 * @param enabled boolean
 */
export const setSoundEnabled = (enabled: boolean): void => {
	isSoundEnabled = enabled
}

/**
 * Set sound volume
 * @param volume number
 */
export const setSoundVolume = (newVolume: number): void => {
	volume = newVolume
}

/**
 * Play a sound file
 * @param filepath string
 * @return void
 */
export const playSound = (filepath: string): void => {
	try {
		if (!isSoundEnabled) {
			return
		}

		if (!filepath) {
			return
		}

		if (!isWAV(filepath)) {
			throw new Error("Only wav files are supported.")
		}

		const currentTime = Date.now()
		if (currentTime - lastPlayedTime < MIN_PLAY_INTERVAL) {
			return // Skip playback within minimum interval to prevent continuous playback
		}

		sound(filepath, volume).catch((error: unknown) => {
			if (error instanceof Error) {
				throw new Error(`Failed to play sound effect: ${error.message}`)
			} else {
				throw new Error("Failed to play sound effect: An unknown error occurred")
			}
		})

		lastPlayedTime = currentTime
	} catch (error: unknown) {
		if (error instanceof Error) {
			vscode.window.showErrorMessage(error.message)
		} else {
			vscode.window.showErrorMessage("An unknown error occurred while playing sound.")
		}
	}
}
