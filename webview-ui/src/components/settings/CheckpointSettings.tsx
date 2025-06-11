import React, { HTMLAttributes } from "react"
import { useAppTranslation } from "@/i18n/TranslationContext"
import { VSCodeCheckbox } from "@/components/ui/vscode-components"
import { GitBranch } from "lucide-react"

import { CheckpointStorage } from "../../../../src/shared/checkpoints"

import { SetCachedStateField } from "./types"
import { SectionHeader } from "./SectionHeader"
import { Section } from "./Section"

type CheckpointSettingsProps = HTMLAttributes<HTMLDivElement> & {
	enableCheckpoints?: boolean
	checkpointStorage?: CheckpointStorage
	setCachedStateField: SetCachedStateField<"enableCheckpoints" | "checkpointStorage">
}

export const CheckpointSettings = ({
	enableCheckpoints,
	checkpointStorage: _checkpointStorage = "task", // eslint-disable-line @typescript-eslint/no-unused-vars
	setCachedStateField,
	...props
}: CheckpointSettingsProps) => {
	const { t } = useAppTranslation()
	return (
		<div {...props}>
			<SectionHeader>
				<div className="flex items-center gap-2">
					<GitBranch className="w-4" />
					<div>{t("settings:sections.checkpoints")}</div>
				</div>
			</SectionHeader>

			<Section>
				<div>
					<VSCodeCheckbox
						checked={enableCheckpoints}
						onChange={(checked: boolean) => {
							setCachedStateField("enableCheckpoints", checked)
						}}>
						<span className="font-medium">{t("settings:checkpoints.enable.label")}</span>
					</VSCodeCheckbox>
					<p className="text-vscode-descriptionForeground text-sm mt-0">
						{t("settings:checkpoints.enable.description")}
					</p>
				</div>
			</Section>
		</div>
	)
}
