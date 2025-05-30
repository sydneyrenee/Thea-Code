import { VSCodeButton, VSCodeLink } from "../ui/vscode-components"
import "../ui/vscode-components.css"
import { memo } from "react"
import { useAppTranslation } from "@/i18n/TranslationContext"
import { Trans } from "react-i18next"

interface AnnouncementProps {
	version: string
	hideAnnouncement: () => void
}
/*
You must update the latestAnnouncementId in TheaProvider for new announcements to show to users. This new id will be compared with whats in state for the 'last announcement shown', and if it's different then the announcement will render. As soon as an announcement is shown, the id will be updated in state. This ensures that announcements are not shown more than once, even if the user doesn't close it themselves.
*/
const Announcement = ({ hideAnnouncement }: AnnouncementProps) => {
	const { t } = useAppTranslation()

	const discordLink = (
		<VSCodeLink
			href="https://discord.gg/thea-placeholder"
			onClick={(e) => {
				e.preventDefault()
				window.postMessage(
					{ type: "action", action: "openExternal", data: { url: "https://discord.gg/thea-placeholder" } },
					"*",
				)
			}}>
			Discord
		</VSCodeLink>
	)

	const redditLink = (
		<VSCodeLink
			href="https://reddit.com/r/thea-placeholder"
			onClick={(e) => {
				e.preventDefault()
				window.postMessage(
					{ type: "action", action: "openExternal", data: { url: "https://reddit.com/r/thea-placeholder" } },
					"*",
				)
			}}>
			Reddit
		</VSCodeLink>
	)

	return (
		<div
			style={{
				backgroundColor: "var(--vscode-editor-inactiveSelectionBackground)",
				borderRadius: "3px",
				padding: "12px 16px",
				margin: "5px 15px 5px 15px",
				position: "relative",
				flexShrink: 0,
			}}>
			<VSCodeButton
				appearance="icon"
				onClick={hideAnnouncement}
				title={t("chat:announcement.hideButton")}
				style={{ position: "absolute", top: "8px", right: "8px" }}>
				<span className="codicon codicon-close"></span>
			</VSCodeButton>
			<h2 style={{ margin: "0 0 8px" }}>{t("chat:announcement.title")}</h2>

			<p style={{ margin: "5px 0px" }}>{t("chat:announcement.description")}</p>

			<h3 style={{ margin: "12px 0 8px" }}>{t("chat:announcement.whatsNew")}</h3>
			<div style={{ margin: "5px 0px" }}>
				<ul style={{ margin: "4px 0 6px 0px", padding: 0 }}>
					{[1, 2, 3, 4, 5].map((num) => {
						const feature = t(`chat:announcement.feature${num}`)
						return feature ? <li key={num}>• {feature}</li> : null
					})}
				</ul>
			</div>

			<p style={{ margin: "10px 0px 0px" }}>
				<Trans
					i18nKey="chat:announcement.detailsDiscussLinks"
					components={{
						discordLink: discordLink,
						redditLink: redditLink,
					}}
				/>
			</p>
		</div>
	)
}

export default memo(Announcement)
