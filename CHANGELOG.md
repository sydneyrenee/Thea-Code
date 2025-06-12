# Thea Code Changelog

All notable changes to Thea Code will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## About Thea Code

Thea Code is a community-driven fork that evolved from the original Cline project. The project was initially forked as "Roo Code" and later rebranded to "Thea Code" in April 2025 to establish its own identity and development direction.

## June 2025

### Added

- Add master test coverage checklist generator ([6da1f775](https://github.com/SolaceHarmony/Thea-Code/commit/6da1f775))
- Add tests for accessMcpResourceTool ([8231f202](https://github.com/SolaceHarmony/Thea-Code/commit/8231f202))
- Add parseAssistantMessage coverage ([dbb559d6](https://github.com/SolaceHarmony/Thea-Code/commit/dbb559d6))
- Add applyDiffTool partial and error cases ([831b9a34](https://github.com/SolaceHarmony/Thea-Code/commit/831b9a34))
- Add tests for askFollowupQuestionTool ([ef7f1336](https://github.com/SolaceHarmony/Thea-Code/commit/ef7f1336))
- Add express dev dependency ([26fd6e29](https://github.com/SolaceHarmony/Thea-Code/commit/26fd6e29))
- Add OpenAI API mock setup ([8e10c12a](https://github.com/SolaceHarmony/Thea-Code/commit/8e10c12a))
- Add OpenAI mock and fix UI tests ([7ea515ef](https://github.com/SolaceHarmony/Thea-Code/commit/7ea515ef))
- Add coverage for nonce and object parsing ([d76292f3](https://github.com/SolaceHarmony/Thea-Code/commit/d76292f3))
- Add Copilot setup steps workflow for automated environment configuration ([2c2ce43e](https://github.com/SolaceHarmony/Thea-Code/commit/2c2ce43e))
- Add new constants and refactor McpToolExecutor for improved initialization and teardown ([7dcfaccb](https://github.com/SolaceHarmony/Thea-Code/commit/7dcfaccb))
- Refactor MCP implementation and migrate to NeutralAnthropicClient ([9d033684](https://github.com/SolaceHarmony/Thea-Code/commit/9d033684))
- Re-enable and update provider handlers with neutral format integration ([67498832](https://github.com/SolaceHarmony/Thea-Code/commit/67498832))
- Enhance dependency installation steps by skipping updates for pinned dependencies ([4e15bb73](https://github.com/SolaceHarmony/Thea-Code/commit/4e15bb73))

### Changed

- Update migration checklist ([3fc23037](https://github.com/SolaceHarmony/Thea-Code/commit/3fc23037))
- Use factory method for embedded MCP server ([d783285f](https://github.com/SolaceHarmony/Thea-Code/commit/d783285f))
- Refactor(openai-test): use OpenAI mock server ([2dc4b387](https://github.com/SolaceHarmony/Thea-Code/commit/2dc4b387))
- Refactor remaining OpenAI tests ([cbd3ed8e](https://github.com/SolaceHarmony/Thea-Code/commit/cbd3ed8e))
- Update test checklist coverage ([14c4fd8b](https://github.com/SolaceHarmony/Thea-Code/commit/14c4fd8b))
- Restore checklist ([4c56b439](https://github.com/SolaceHarmony/Thea-Code/commit/4c56b439))
- Update src/core/prompts/__tests__/sections.test.ts ([e97a360f](https://github.com/SolaceHarmony/Thea-Code/commit/e97a360f))
- Refactor tests and code structure for improved type safety and clarity ([ebd5ba93](https://github.com/SolaceHarmony/Thea-Code/commit/ebd5ba93))
- Update jest and jest-environment-jsdom to version 29.7.0 ([5e200d50](https://github.com/SolaceHarmony/Thea-Code/commit/5e200d50))
- Update jest and jest-environment-jsdom to version 29.7.0 ([91748368](https://github.com/SolaceHarmony/Thea-Code/commit/91748368))
- Enhance error handling and type safety across various modules ([44954df8](https://github.com/SolaceHarmony/Thea-Code/commit/44954df8))
- Remove npm-check-updates bump commands from setup steps ([3983b599](https://github.com/SolaceHarmony/Thea-Code/commit/3983b599))
- Improve dependency update steps by refining pinned dependencies and adjusting directory checks ([75f560f2](https://github.com/SolaceHarmony/Thea-Code/commit/75f560f2))
- Remove silent flags from npm install commands for better visibility ([7b00800f](https://github.com/SolaceHarmony/Thea-Code/commit/7b00800f))
- Merge branch 'main' into copilot/fix-109-2 ([1b168976](https://github.com/SolaceHarmony/Thea-Code/commit/1b168976))
- Update jest and jest-environment-jsdom to version 29.7.0 ([31024143](https://github.com/SolaceHarmony/Thea-Code/commit/31024143))

### Fixed

- Fix test import path ([63b061c9](https://github.com/SolaceHarmony/Thea-Code/commit/63b061c9))
- Start mock servers with correct SDK imports ([e2684a7c](https://github.com/SolaceHarmony/Thea-Code/commit/e2684a7c))
- Fix jest teardown and openai mock ([c4c0a8cd](https://github.com/SolaceHarmony/Thea-Code/commit/c4c0a8cd))
- Fix Ollama tests to use local mock service ([91b2a82d](https://github.com/SolaceHarmony/Thea-Code/commit/91b2a82d))
- Fix imports for runtime constants ([be84c3cb](https://github.com/SolaceHarmony/Thea-Code/commit/be84c3cb))
- Fix tests and update eslint config ([edd22bd4](https://github.com/SolaceHarmony/Thea-Code/commit/edd22bd4))
- Fix express transport types and update checklist ([4d6a3a79](https://github.com/SolaceHarmony/Thea-Code/commit/4d6a3a79))
- Resolve lint issue in ollama tests ([a63098d8](https://github.com/SolaceHarmony/Thea-Code/commit/a63098d8))
- Fix lint warnings ([ce3029ed](https://github.com/SolaceHarmony/Thea-Code/commit/ce3029ed))
- Handle async check in waitFor ([24aa19a6](https://github.com/SolaceHarmony/Thea-Code/commit/24aa19a6))
- Fix lint issues ([93ca22d2](https://github.com/SolaceHarmony/Thea-Code/commit/93ca22d2))
- Fix lint for unbound handler ([388971ad](https://github.com/SolaceHarmony/Thea-Code/commit/388971ad))
- Address lint warnings ([e94aabf4](https://github.com/SolaceHarmony/Thea-Code/commit/e94aabf4))
- Fix lint issues in apply diff test ([c6335503](https://github.com/SolaceHarmony/Thea-Code/commit/c6335503))
- Update runner environment from ubuntu to macos for Copilot setup steps ([a061e378](https://github.com/SolaceHarmony/Thea-Code/commit/a061e378))
- Change output format to ESM in extension configuration and update build script ([64c13cd0](https://github.com/SolaceHarmony/Thea-Code/commit/64c13cd0))
- Remove TypeScript and webview-ui build steps from Copilot setup workflow ([39e6f1bb](https://github.com/SolaceHarmony/Thea-Code/commit/39e6f1bb))
- Revert runner environment from macos to ubuntu for Copilot setup steps ([cbb35ef6](https://github.com/SolaceHarmony/Thea-Code/commit/cbb35ef6))
- Fix import statement for EXTENSION_CONFIG_DIR in custom-system-prompt test ([f699c2f2](https://github.com/SolaceHarmony/Thea-Code/commit/f699c2f2))
- Update npm install commands to include --legacy-peer-deps for compatibility ([84c6b7f8](https://github.com/SolaceHarmony/Thea-Code/commit/84c6b7f8))
- Enhance provider tests with async handling and type improvements ([3147622a](https://github.com/SolaceHarmony/Thea-Code/commit/3147622a))
- Simplify mockFakeAI methods by removing unused parameters ([79c5eb8f](https://github.com/SolaceHarmony/Thea-Code/commit/79c5eb8f))

### Testing

- Use real MCP SDK in tests ([4cf716a7](https://github.com/SolaceHarmony/Thea-Code/commit/4cf716a7))
- Cover path and array utilities ([b35c694a](https://github.com/SolaceHarmony/Thea-Code/commit/b35c694a))
- Silence logs during tests ([b48a4eaf](https://github.com/SolaceHarmony/Thea-Code/commit/b48a4eaf))
- Silence lint errors in tests ([ea9a6235](https://github.com/SolaceHarmony/Thea-Code/commit/ea9a6235))

### Maintenance

- Revert anthropic sdk version ([eae946d9](https://github.com/SolaceHarmony/Thea-Code/commit/eae946d9))

## May 2025

### Added

- Add comprehensive documentation for Transformer architecture and comparison with xLSTM ([fe215bcc](https://github.com/SolaceHarmony/Thea-Code/commit/fe215bcc))
- Remove legacy MCP implementation ([00c669c9](https://github.com/SolaceHarmony/Thea-Code/commit/00c669c9))
- Add provider and transport abstractions ([58b321eb](https://github.com/SolaceHarmony/Thea-Code/commit/58b321eb))
- Add integration and management layers ([f911eb9f](https://github.com/SolaceHarmony/Thea-Code/commit/f911eb9f))
- Register common MCP tools ([4ed20b86](https://github.com/SolaceHarmony/Thea-Code/commit/4ed20b86))
- Add tool call handling to OpenRouter ([174337d1](https://github.com/SolaceHarmony/Thea-Code/commit/174337d1))
- Simplify mock implementation for McpToolExecutor in tests ([ba6ddb56](https://github.com/SolaceHarmony/Thea-Code/commit/ba6ddb56))
- Restructure MCP service components and implement transport layers ([1d4f932a](https://github.com/SolaceHarmony/Thea-Code/commit/1d4f932a))
- Refactor McpToolExecutor initialization and fix TypeScript errors ([b0180b34](https://github.com/SolaceHarmony/Thea-Code/commit/b0180b34))
- Add initial project configuration files for IDE setup ([32552c10](https://github.com/SolaceHarmony/Thea-Code/commit/32552c10))
- Update gluegun version and add npm-check-updates dependency ([ad2a107e](https://github.com/SolaceHarmony/Thea-Code/commit/ad2a107e))
- Update dependencies and add overrides ([cf70b672](https://github.com/SolaceHarmony/Thea-Code/commit/cf70b672))
- Remove deprecated dependencies and add overrides for glob and jsdom ([fee5fe63](https://github.com/SolaceHarmony/Thea-Code/commit/fee5fe63))
- Refactor: Replace VSCode webview UI toolkit components with custom implementations ([62ccd58d](https://github.com/SolaceHarmony/Thea-Code/commit/62ccd58d))
- Add configuration constants and command mappings to thea-config.ts ([f2ffee38](https://github.com/SolaceHarmony/Thea-Code/commit/f2ffee38))
- Refactor checkbox handlers to use boolean parameters for onChange events across multiple components; update VSCode components to improve type definitions and add new panel components. ([76884fd3](https://github.com/SolaceHarmony/Thea-Code/commit/76884fd3))
- Add lint.js to support nvm run ([e0f65201](https://github.com/SolaceHarmony/Thea-Code/commit/e0f65201))
- Add neutral anthropic client stub ([8c378591](https://github.com/SolaceHarmony/Thea-Code/commit/8c378591))
- Update migration plan to implement an SDK-independent Anthropic client ([3befd9d0](https://github.com/SolaceHarmony/Thea-Code/commit/3befd9d0))
- Implement NeutralAnthropicClient wrapper ([d816d7f9](https://github.com/SolaceHarmony/Thea-Code/commit/d816d7f9))

### Changed

- Refactor TaskHeader component to use TheaMessage type; update localization strings for clarity and consistency across multiple languages. ([156eadac](https://github.com/SolaceHarmony/Thea-Code/commit/156eadac))
- Refactor tests for TheaStateManager, TheaTaskHistory, and TheaTaskStack ([fd9de968](https://github.com/SolaceHarmony/Thea-Code/commit/fd9de968))
- Refactor localization JSON for improved formatting and consistency; update API callback URL construction; adjust Storybook import syntax; enhance context-mentions utility for better browser compatibility. ([ed272354](https://github.com/SolaceHarmony/Thea-Code/commit/ed272354))
- Move EmbeddedMcpServer to provider ([fd11a8d4](https://github.com/SolaceHarmony/Thea-Code/commit/fd11a8d4))
- Update MCP tests for refactored core ([e493c26c](https://github.com/SolaceHarmony/Thea-Code/commit/e493c26c))
- Mark client refactor started ([13adee52](https://github.com/SolaceHarmony/Thea-Code/commit/13adee52))
- Update MCP checklist phase 4 ([316c2f34](https://github.com/SolaceHarmony/Thea-Code/commit/316c2f34))
- Update dependencies and devDependencies in package.json ([1f3523ab](https://github.com/SolaceHarmony/Thea-Code/commit/1f3523ab))
- Remove isolatedModules option from ts-jest configuration; update mock server to allow direct execution for testing ([f9be4c7a](https://github.com/SolaceHarmony/Thea-Code/commit/f9be4c7a))
- Update dependencies and improve string similarity evaluation ([43b4b2cf](https://github.com/SolaceHarmony/Thea-Code/commit/43b4b2cf))
- Update MCP README for SSE and function calls ([ffa8f697](https://github.com/SolaceHarmony/Thea-Code/commit/ffa8f697))
- Docs(plan): link archived phases ([122334e0](https://github.com/SolaceHarmony/Thea-Code/commit/122334e0))
- Refactor logging and transport utilities, enhance error handling, and improve type safety ([22dd2fd2](https://github.com/SolaceHarmony/Thea-Code/commit/22dd2fd2))
- Update @radix-ui and other dependencies to latest versions ([e3647029](https://github.com/SolaceHarmony/Thea-Code/commit/e3647029))
- Update puppeteer-core to version 24.9.0 and knip to version 5.57.1 ([f51c2749](https://github.com/SolaceHarmony/Thea-Code/commit/f51c2749))
- Update Node.js version and dependencies ([8cfca902](https://github.com/SolaceHarmony/Thea-Code/commit/8cfca902))
- Merge branch 'main' into codex/rename-mockembeddedmcpserver-to-mockembeddedmcpprovider ([7db1bcf0](https://github.com/SolaceHarmony/Thea-Code/commit/7db1bcf0))
- Move eslint plugins to devDependencies ([93d3708d](https://github.com/SolaceHarmony/Thea-Code/commit/93d3708d))
- Refactor tests and core logic for improved type safety and clarity ([4cd879af](https://github.com/SolaceHarmony/Thea-Code/commit/4cd879af))
- Refactor code for improved type safety and error handling ([98675536](https://github.com/SolaceHarmony/Thea-Code/commit/98675536))
- Simplify applyDiff method and improve error handling ([956194a6](https://github.com/SolaceHarmony/Thea-Code/commit/956194a6))
- Refactor unified test cases to remove async/await for applyDiff calls ([61837358](https://github.com/SolaceHarmony/Thea-Code/commit/61837358))
- Refactor TheaTask and related modules for improved metrics handling and neutral message conversion ([15996037](https://github.com/SolaceHarmony/Thea-Code/commit/15996037))
- Update audit document for Anthropic SDK removal and migration plan ([7f5fc225](https://github.com/SolaceHarmony/Thea-Code/commit/7f5fc225))
- Update dependencies in package.json ([a6edbb2a](https://github.com/SolaceHarmony/Thea-Code/commit/a6edbb2a))
- Update src/services/anthropic/NeutralAnthropicClient.ts ([55bb6b3a](https://github.com/SolaceHarmony/Thea-Code/commit/55bb6b3a))
- Switch providers to neutral anthropic client ([7781736e](https://github.com/SolaceHarmony/Thea-Code/commit/7781736e))
- Merge branch 'main' into 8lcsjq-codex/refactor-api-provider-files-for-neutralanthropicclient ([32769bbe](https://github.com/SolaceHarmony/Thea-Code/commit/32769bbe))
- Remove anthropic deps from transform ([a0891f29](https://github.com/SolaceHarmony/Thea-Code/commit/a0891f29))

### Fixed

- Fix test infrastructure ([8e76798d](https://github.com/SolaceHarmony/Thea-Code/commit/8e76798d))
- Update tests and fix typings ([9ac240bf](https://github.com/SolaceHarmony/Thea-Code/commit/9ac240bf))
- Update Node version and fix lint config ([3e3de0ee](https://github.com/SolaceHarmony/Thea-Code/commit/3e3de0ee))
- Fix lint issues in shared utils ([8094c17e](https://github.com/SolaceHarmony/Thea-Code/commit/8094c17e))
- Fix linter issues in shared and services ([7a145d03](https://github.com/SolaceHarmony/Thea-Code/commit/7a145d03))
- Lint warnings in mcp provider and transport ([b9c42b4e](https://github.com/SolaceHarmony/Thea-Code/commit/b9c42b4e))
- Fix lint config and provider typings ([7beb3861](https://github.com/SolaceHarmony/Thea-Code/commit/7beb3861))
- Fix lint issues in MCP tests and core ([be72e996](https://github.com/SolaceHarmony/Thea-Code/commit/be72e996))
- Fix build errors ([eff79b8b](https://github.com/SolaceHarmony/Thea-Code/commit/eff79b8b))
- Address lint errors in MCP tests ([1ba6d485](https://github.com/SolaceHarmony/Thea-Code/commit/1ba6d485))
- Update @types/node to version 22.16.0 across multiple package.json files ([8ef3346c](https://github.com/SolaceHarmony/Thea-Code/commit/8ef3346c))
- Downgrade @types/node to version 22.15.21 in multiple package.json files ([cba76819](https://github.com/SolaceHarmony/Thea-Code/commit/cba76819))
- Update dependencies in package.json and webview-ui/package.json ([33b02aac](https://github.com/SolaceHarmony/Thea-Code/commit/33b02aac))
- Fix lint errors in MCP tests ([b49ff2c2](https://github.com/SolaceHarmony/Thea-Code/commit/b49ff2c2))
- Fix lint errors in few files ([6aa5cd84](https://github.com/SolaceHarmony/Thea-Code/commit/6aa5cd84))
- Chore(test): fix some lint issues ([6978836b](https://github.com/SolaceHarmony/Thea-Code/commit/6978836b))
- Fix lint issues in checkpoint service tests ([662ac236](https://github.com/SolaceHarmony/Thea-Code/commit/662ac236))
- Address linter issues in browser utilities ([a347ee8e](https://github.com/SolaceHarmony/Thea-Code/commit/a347ee8e))
- Fix lint issues in workspace tracker and theme ([985f3a82](https://github.com/SolaceHarmony/Thea-Code/commit/985f3a82))
- Chore(lint): fix tests lint errors ([8191f001](https://github.com/SolaceHarmony/Thea-Code/commit/8191f001))
- Fix lint issues in terminal registry and tests ([32ec3de3](https://github.com/SolaceHarmony/Thea-Code/commit/32ec3de3))
- Fix lint errors in terminal modules ([4645165d](https://github.com/SolaceHarmony/Thea-Code/commit/4645165d))
- Fix lint issues in editor and i18n ([660a80fc](https://github.com/SolaceHarmony/Thea-Code/commit/660a80fc))
- Fix lint errors in i18n and extension ([1a6dc1be](https://github.com/SolaceHarmony/Thea-Code/commit/1a6dc1be))
- Fix lint issues in webview modules ([5bfa72f1](https://github.com/SolaceHarmony/Thea-Code/commit/5bfa72f1))
- Fix lint issues in webview tests ([8f35407e](https://github.com/SolaceHarmony/Thea-Code/commit/8f35407e))
- Improve type handling in tests and update clipboard utility imports ([279c17bc](https://github.com/SolaceHarmony/Thea-Code/commit/279c17bc))
- Fix lint script ([0fd957b0](https://github.com/SolaceHarmony/Thea-Code/commit/0fd957b0))
- Fix lint issues in test files ([afcabb3b](https://github.com/SolaceHarmony/Thea-Code/commit/afcabb3b))

### Removed

- Chore: Remove legacy McpToolRegistry.ts from src/services/mcp/ ([d9a08fac](https://github.com/SolaceHarmony/Thea-Code/commit/d9a08fac))
- Remove eslint-config-react-app dependency from package.json ([fad7d7d5](https://github.com/SolaceHarmony/Thea-Code/commit/fad7d7d5))
- Drop outdated TODO comment ([b30d3e2c](https://github.com/SolaceHarmony/Thea-Code/commit/b30d3e2c))

### Documentation

- Rename MCP components ([0c468e77](https://github.com/SolaceHarmony/Thea-Code/commit/0c468e77))
- Audit anthropic sdk usage ([149a76d5](https://github.com/SolaceHarmony/Thea-Code/commit/149a76d5))
- Replace audit checklist with neutral client migration ([3d54bd4e](https://github.com/SolaceHarmony/Thea-Code/commit/3d54bd4e))

### Testing

- Start MCP server in global setup ([1a2bebb2](https://github.com/SolaceHarmony/Thea-Code/commit/1a2bebb2))
- Rename MockEmbeddedMcpServer ([f8d086cf](https://github.com/SolaceHarmony/Thea-Code/commit/f8d086cf))
- Merge branch 'main' into codex/verify-feature-completion-and-run-tests ([57899a6e](https://github.com/SolaceHarmony/Thea-Code/commit/57899a6e))

### Maintenance

- Begin addressing linter issues ([8a312688](https://github.com/SolaceHarmony/Thea-Code/commit/8a312688))
- Chore(lint): type webview integration ([2f52a731](https://github.com/SolaceHarmony/Thea-Code/commit/2f52a731))
- Start lint fixes ([6a48e9c4](https://github.com/SolaceHarmony/Thea-Code/commit/6a48e9c4))
- Merge branch 'main' into codex/fix-linting-errors-in-cline_docs ([5ad77c9e](https://github.com/SolaceHarmony/Thea-Code/commit/5ad77c9e))
- Address lint errors in misc integrations ([2dd39719](https://github.com/SolaceHarmony/Thea-Code/commit/2dd39719))
- Address lint errors in webview components ([7f1d0a25](https://github.com/SolaceHarmony/Thea-Code/commit/7f1d0a25))

## April 2025

### Added

- Update version to 0.0.5, add custom modes configuration, and clean up code comments ([20e02bc7](https://github.com/SolaceHarmony/Thea-Code/commit/20e02bc7))
- Implement ClineCacheManager for disk cache operations ([00dce06b](https://github.com/SolaceHarmony/Thea-Code/commit/00dce06b))

### Changed

- Refactor project references from Roo Code to Thea Code and update localization files ([83da9839](https://github.com/SolaceHarmony/Thea-Code/commit/83da9839))
- Update references and localization for Thea branding ([2342995c](https://github.com/SolaceHarmony/Thea-Code/commit/2342995c))
- Refactor ClineProvider to replace TheaCodeSettings with RooCodeSettings and update related identifiers ([3ff1ef70](https://github.com/SolaceHarmony/Thea-Code/commit/3ff1ef70))

## [0.0.5] - 2025-04-02

### Changed
- Rebranded project from "Roo Code" to "Thea Code" 
- Updated all project references and documentation to reflect new identity
- Established community-driven development approach
- Updated version to 0.0.5 to mark the official Thea Code release

### Added
- Custom modes configuration system
- Enhanced localization support across multiple languages
- Community guidelines and contributing documentation

---

## Project History

**Thea Code** represents the evolution of an AI-powered coding assistant:

- **2024-07**: Original **Cline** project created
- **2024-11**: Forked as **Roo Code** 
- **2025-04**: Rebranded to **Thea Code** with community focus

This changelog documents changes since the Thea Code rebranding. For earlier history, please refer to the git commit history.

