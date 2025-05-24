// Mock implementation for ShadowCheckpointService
import EventEmitter from "events"
import { CheckpointStorage } from "../../../shared/checkpoints"

export abstract class ShadowCheckpointService extends EventEmitter {
        public static getTaskStorage = jest
                .fn()
                .mockImplementation(
                        (): Promise<CheckpointStorage | undefined> =>
                                Promise.resolve("task"),
                )

	// Use Jest mock functions for these methods
	public static deleteTask = jest.fn().mockResolvedValue(undefined)
	public static deleteBranch = jest.fn().mockResolvedValue(true)
	public static hashWorkspaceDir = jest.fn().mockReturnValue("mock-hash")
}
