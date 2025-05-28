import { Checkbox } from "vscrui"
import { useExtensionState } from "../../context/ExtensionStateContext"
import { useAppTranslation } from "../../i18n/TranslationContext"
import { vscode } from "../../utils/vscode"

const McpEnabledToggle = () => {
	const { mcpEnabled, setMcpEnabled } = useExtensionState()
	const { t } = useAppTranslation()

	const handleChange = (checked: boolean) => {
		setMcpEnabled(checked)
		vscode.postMessage({ type: "mcpEnabled", bool: checked })
	}

	return (
		<div style={{ marginBottom: "20px" }}>
			<Checkbox checked={mcpEnabled} onChange={handleChange}>
				<span style={{ fontWeight: "500" }}>{t("mcp:enableToggle.title")}</span>
			</Checkbox>
			<p
				style={{
					fontSize: "12px",
					marginTop: "5px",
					color: "var(--vscode-descriptionForeground)",
				}}>
				{t("mcp:enableToggle.description")}
			</p>
		</div>
	)
}

export default McpEnabledToggle
