import path from "path"

import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

// https://vitejs.dev/config/
export default defineConfig({
	plugins: [react(), tailwindcss()],
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
	build: {
		outDir: "build",
		reportCompressedSize: false,
		rollupOptions: {
			output: {
				entryFileNames: `assets/[name].js`,
				chunkFileNames: `assets/[name].js`,
				assetFileNames: `assets/[name].[ext]`,
				manualChunks: (id) => {
					if (id.includes("node_modules")) {
						// Explicitly separate large libraries
						if (id.includes("mermaid")) return "vendor-mermaid"
						if (id.includes("cytoscape")) return "vendor-cytoscape"
						if (id.includes("katex")) return "vendor-katex"
						if (id.includes("highlight.js")) return "vendor-highlightjs"
						if (id.includes("react-dom")) return "vendor-react-dom"
						if (id.includes("zod")) return "vendor-zod"
						if (id.includes("@microsoft/fast-foundation")) return "vendor-fast-foundation"
						// Group all other node_modules into a single vendor chunk
						return "vendor"
					}
					// Create a separate chunk for the main application code
					if (id.includes("src")) {
						return "main"
					}
				},
			},
		},
	},
	server: {
		hmr: {
			host: "localhost",
			protocol: "ws",
		},
		cors: {
			origin: "*",
			methods: "*",
			allowedHeaders: "*",
		},
	},
	define: {
		"process.platform": JSON.stringify(process.platform),
		"process.env.VSCODE_TEXTMATE_DEBUG": JSON.stringify(process.env.VSCODE_TEXTMATE_DEBUG),
	},
})
