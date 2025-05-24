import * as vscode from "vscode"
import { Browser, Page, chromium } from "playwright" // Changed to playwright
import * as cheerio from "cheerio"
import TurndownService from "turndown"

export class UrlContentFetcher {
	private context: vscode.ExtensionContext
	private browser?: Browser
	private page?: Page

        constructor(context: vscode.ExtensionContext) {
                this.context = context
        }

        // Historically BrowserSession relied on a puppeteer-based helper to
        // download Chromium if necessary. Playwright bundles a compatible
        // browser so here we simply expose its executable path alongside the
        // puppeteer module for backward compatibility.
        async ensureChromiumExists(): Promise<{
                puppeteer: typeof import("puppeteer-core")
                executablePath: string
        }> {
                const puppeteer = await import("puppeteer-core")
                const executablePath = puppeteer.executablePath()
                return { puppeteer, executablePath }
        }

        async launchBrowser(): Promise<void> {
		if (this.browser) {
			return
		}
		this.browser = await chromium.launch({ // Changed to playwright's chromium launch
			args: [
				"--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
			],
		})
		// (latest version of puppeteer does not add headless to user agent)
		this.page = await this.browser?.newPage()
	}

	async closeBrowser(): Promise<void> {
		await this.browser?.close()
		this.browser = undefined
		this.page = undefined
	}

	// must make sure to call launchBrowser before and closeBrowser after using this
	async urlToMarkdown(url: string): Promise<string> {
		if (!this.browser || !this.page) {
			throw new Error("Browser not initialized")
		}
		/*
		- networkidle2 is equivalent to playwright's networkidle where it waits until there are no more than 2 network connections for at least 500 ms.
		- domcontentloaded is when the basic DOM is loaded
		this should be sufficient for most doc sites
		*/
		await this.page.goto(url, { timeout: 10_000, waitUntil: "networkidle" })
		const content = await this.page.content()

		// use cheerio to parse and clean up the HTML
		const $ = cheerio.load(content)
		$("script, style, nav, footer, header").remove()

		// convert cleaned HTML to markdown
		const turndownService = new TurndownService()
		const markdown = turndownService.turndown($.html())

		return markdown
	}
}
