# Rebranding Guide

This document explains how to rebrand the extension from "Thea Code" to your own branding.

## Understanding the Rebranding System

The extension uses a template-based system for rebranding that solves several challenges:

1. **VS Code Extension Loading**: VS Code loads package.json when building the extension and certain identifiers cannot be changed at runtime.

2. **Key vs Value Changes**: Changing keys in JSON can break functionality, while changing values is generally safe.

3. **Template Processing**: Instead of global search and replace, we use a template system with placeholders.

## Rebranding Steps

### 1. Configure Your Brand

Edit the `branding.json` file in the root directory with your brand details:

```json
{
  "name": "your-extension-name",
  "displayName": "Your Display Name",
  "description": "Your description",
  "publisher": "YourPublisherId",
  "extensionSecretsPrefix": "your_extension_config_",
  "icon": "assets/icons/your-icon.png",
  "author": {
    "name": "Your Name"
  },
  "repository": {
    "type": "git",
    "url": "https://github.com/YourUsername/Your-Repo"
  },
  "homepage": "https://github.com/YourUsername/Your-Repo",
  "keywords": [
    "your-keywords"
  ]
}
```

### 2. Apply the Branding

Run the apply-branding script:

```bash
node scripts/apply-branding.js
```

This script:
- Updates package.json with your branding values
- Processes templates using these values
- Ensures VS Code identifiers are updated correctly

### 3. Update Visual Assets

Replace the icon file referenced in your branding.json:
- Default location: `assets/icons/your-icon.png`

### 4. Test Your Branding

Build and run the extension to verify the branding appears correctly:

```bash
npm run build
npm run start
```

## How the System Works

The rebranding system consists of several components:

### 1. Branding Configuration (branding.json)

This file contains all your brand-specific values, separated from the extension's technical details.

### 2. Template Files (dist/templates/*)

These files use placeholders like `COMMANDPREFIX` and `DISPLAYNAME` that get replaced with your actual branding values.

### 3. Branding Module (src/core/branding.ts)

A runtime module that provides branding values to the codebase through functions like:
- `displayName()`
- `extensionName()`
- `repositoryUrl()`

### 4. Constants Module (src/core/constants.ts)

Creates constants for command IDs, view IDs, etc., using the extension base ID from package.json.

### 5. Processing Scripts

- `scripts/process-templates.js`: Replaces placeholders in templates
- `scripts/apply-branding.js`: Updates package.json and runs the template processor

## Technical Details

### Avoiding Common Issues

1. **Do Not Change Keys**: Only change values in JSON structures, not the keys themselves.

2. **VS Code Immutability**: VS Code loads package.json during build, making certain fields effectively immutable at runtime.

3. **Extension ID Impact**: The extension ID (publisher.name) affects many aspects of VS Code integration, including:
   - Command registration
   - View containers
   - Configuration sections

### Package.json Template

The package.json.dist template uses these key placeholders:
- `COMMANDPREFIX`: Used for command IDs, view IDs, etc.
- `DISPLAYNAME`: Used for UI display text
- `PUBLISHERID`: Used for extension identification

## Troubleshooting

If you encounter issues after rebranding:

1. **Command Not Found**: Ensure all command IDs in your code use the branding.prefixCommand() function.

2. **Configuration Issues**: Check if configuration sections use extensionName() for access.

3. **VS Code Activation Events**: If the extension isn't activating, check that activation events in package.json are correct.

4. **Context Menus Missing**: Verify that menu IDs in the contributes section use the correct COMMANDPREFIX.