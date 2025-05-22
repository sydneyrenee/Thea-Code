import { ExperimentId } from "../schemas"
import { AssertEqual, Equals, Keys, Values } from "../utils/type-fu"

export type { ExperimentId }

export const EXPERIMENT_IDS = {
	DIFF_STRATEGY_UNIFIED: "experimentalDiffStrategy",
	INSERT_BLOCK: "insert_content",
	SEARCH_AND_REPLACE: "search_and_replace",
	POWER_STEERING: "powerSteering",
} as const satisfies Record<string, ExperimentId>

// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _AssertExperimentIds = AssertEqual<Equals<ExperimentId, Values<typeof EXPERIMENT_IDS>>>

type ExperimentKey = Keys<typeof EXPERIMENT_IDS>

interface ExperimentConfig {
	enabled: boolean
}

export const experimentConfigsMap: Record<ExperimentKey, ExperimentConfig> = {
	DIFF_STRATEGY_UNIFIED: { enabled: false },
	INSERT_BLOCK: { enabled: false },
	SEARCH_AND_REPLACE: { enabled: false },
	POWER_STEERING: { enabled: false },
}

export const experimentDefault: Record<ExperimentId, boolean> = Object.fromEntries(
        Object.entries(experimentConfigsMap).map(([key, config]) => [
                EXPERIMENT_IDS[key as ExperimentKey],
                config.enabled,
        ]),
)

export const experiments = {
	get: (id: ExperimentKey): ExperimentConfig | undefined => experimentConfigsMap[id],
	isEnabled: (experimentsConfig: Record<ExperimentId, boolean>, id: ExperimentId) =>
		experimentsConfig[id] ?? experimentDefault[id],
} as const
