<div align="center">
<sub>

English • [Català](locales/ca/README.md) • [Deutsch](locales/de/README.md) • [Español](locales/es/README.md) • [Français](locales/fr/README.md) • [हिन्दी](locales/hi/README.md) • [Italiano](locales/it/README.md)

</sub>
<sub>

[日本語](locales/ja/README.md) • [한국어](locales/ko/README.md) • [Polski](locales/pl/README.md) • [Português (BR)](locales/pt-BR/README.md) • [Türkçe](locales/tr/README.md) • [Tiếng Việt](locales/vi/README.md) • [简体中文](locales/zh-CN/README.md) • [繁體中文](locales/zh-TW/README.md)

</sub>
</div>
<br>

<div align="center">
  <!-- Community Links Removed -->
</div>
<br>
<br>

<div align="center">
<h1>Roo Code (prev. Roo Cline)</h1>

<!-- Marketplace/Feature/Review/Docs Badges Removed -->

</div>

**Roo Code** is an AI-powered **autonomous coding agent** that lives in your editor. It can:

- Communicate in natural language
- Read and write files directly in your workspace
- Run terminal commands
- Automate browser actions
- Integrate with any OpenAI-compatible or custom API/model
- Adapt its “personality” and capabilities through **Custom Modes**

Whether you’re seeking a flexible coding partner, a system architect, or specialized roles like a QA engineer or product manager, Roo Code can help you build software more efficiently.

Check out the [CHANGELOG](CHANGELOG.md) for detailed updates and fixes.

---

## 🎉 Thea Code 0.0.3

Roo Code 3.11 brings significant performance improvements and new features!

- Fast Edits - Edits now apply way faster. Less waiting, more coding.
- API Key Balances - View your OpenRouter and Requesty balances in settings.
- Project-Level MCP Config - Now you can configure it per project/workspace.
- Improved Gemini Support - Smarter retries, fixed escaping, added to Vertex provider.
- Import/Export Settings - Easily back up or share your config across setups.

---

## What Can Roo Code Do?

- 🚀 **Generate Code** from natural language descriptions
- 🔧 **Refactor & Debug** existing code
- 📝 **Write & Update** documentation
- 🤔 **Answer Questions** about your codebase
- 🔄 **Automate** repetitive tasks
- 🏗️ **Create** new files and projects

## Quick Start

1. Install Thea Code (instructions TBD or remove this section).
2. Connect Your AI Provider (instructions TBD or remove this section).
3. Try Your First Task (instructions TBD or remove this section).

## Key Features

### Multiple Modes

Thea Code adapts to your needs with specialized modes:

- **Code Mode:** For general-purpose coding tasks
- **Architect Mode:** For planning and technical leadership
- **Ask Mode:** For answering questions and providing information
- **Debug Mode:** For systematic problem diagnosis
- **Custom Modes:** Create unlimited specialized personas for security auditing, performance optimization, documentation, or any other task

### Smart Tools

Thea Code comes with powerful tools that can:

- Read and write files in your project
- Execute commands in your VS Code terminal
- Control a web browser
- Use external tools via MCP (Model Context Protocol)

MCP extends Thea Code's capabilities by allowing you to add unlimited custom tools. Integrate with external APIs, connect to databases, or create specialized development tools - MCP provides the framework to expand Thea Code's functionality to meet your specific needs.

### Customization
Make Thea Code work your way with:

- Custom Instructions for personalized behavior
- Custom Modes for specialized tasks
- Local Models for offline use
- Auto-Approval Settings for faster workflows
- [Auto-Approval Settings](https://docs.roocode.com/advanced-usage/auto-approving-actions) for faster workflows

## Resources

<!-- Documentation Section Removed -->

### Community

- **Discord:** [Join the Project Discord](https://discord.gg/your-discord-invite-code) <!-- Replace with actual invite code -->
- **GitHub:** Report issues or suggest features on the [project repository](https://github.com/sydneyrenee/Thea-Code).

---

## Local Setup & Development

1. **Clone** the repo:

```sh
git clone https://github.com/RooVetGit/Roo-Code.git
```

2. **Install dependencies**:

```sh
npm run install:all
```

3. **Start the webview (Vite/React app with HMR)**:

```sh
npm run dev
```

4. **Debug**:
   Press `F5` (or **Run** → **Start Debugging**) in VSCode to open a new session with Roo Code loaded.

Changes to the webview will appear immediately. Changes to the core extension will require a restart of the extension host.

Alternatively you can build a .vsix and install it directly in VSCode:

```sh
npm run build
```

A `.vsix` file will appear in the `bin/` directory which can be installed with:

```sh
code --install-extension bin/roo-cline-<version>.vsix
```

We use [changesets](https://github.com/changesets/changesets) for versioning and publishing. Check our `CHANGELOG.md` for release notes.

---

## Disclaimer

**Please note** that Roo Veterinary, Inc does **not** make any representations or warranties regarding any code, models, or other tools provided or made available in connection with Roo Code, any associated third-party tools, or any resulting outputs. You assume **all risks** associated with the use of any such tools or outputs; such tools are provided on an **"AS IS"** and **"AS AVAILABLE"** basis. Such risks may include, without limitation, intellectual property infringement, cyber vulnerabilities or attacks, bias, inaccuracies, errors, defects, viruses, downtime, property loss or damage, and/or personal injury. You are solely responsible for your use of any such tools or outputs (including, without limitation, the legality, appropriateness, and results thereof).

---

## Contributing

We love community contributions! Get started by reading our [CONTRIBUTING.md](CONTRIBUTING.md).

---

## Original Contributors

Recognition and thanks go to the original contributors of the Roo Code project, upon which Thea Code is based. You can find the original contributors list [here](https://github.com/RooVetGit/Roo-Code#contributors).

## License

[Apache License 2.0](./LICENSE) © 2025 Solace & Harmony, Inc. and Contributors

---

**Enjoy Thea Code!** We hope you find it a useful companion. Happy coding!
