// scripts/apply-thea-branding.js
const fs = require('fs');
const path = require('path');

console.log('Starting Thea Branding Application...');

// --- Configuration ---
const packageJsonPath = path.join(__dirname, '..', 'package.json');
const brandingJsonPath = path.join(__dirname, '..', 'branding.json');
const generatedConfigPath = path.join(__dirname, '..', 'dist', 'thea-config.ts'); // Define output path for generated TS config
const newVersion = '0.0.1'; // Define the starting version for this fork

// --- Read Files ---
let brandingJson;
let packageObj; 

try {
  console.log(`Reading branding config: ${brandingJsonPath}`);
  brandingJson = JSON.parse(fs.readFileSync(brandingJsonPath, 'utf8'));
  console.log('Branding config loaded.');
} catch (err) {
  console.error(`Failed to read branding.json: ${err.message}`);
  process.exit(1);
}

try {
  console.log(`Reading package.json: ${packageJsonPath}`);
  packageObj = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  console.log('package.json loaded.');
} catch (err) {
  console.error(`Failed to read package.json: ${err.message}`);
  process.exit(1);
}

// --- Backup ---
const packageJsonBackupPath = `${packageJsonPath}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
try {
  console.log(`Creating backup: ${packageJsonBackupPath}`);
  fs.copyFileSync(packageJsonPath, packageJsonBackupPath);
  console.log('Backup created.');
} catch (err) {
  console.error(`Failed to create backup: ${err.message}`);
  process.exit(1);
}

// --- Define String Replacements (Old -> New from branding.json) ---
const stringReplacements = {
  'roo-cline': brandingJson.name,
  'Roo Code': brandingJson.displayName, 
  'Roo Code (prev. Roo Cline)': brandingJson.displayName, 
  'RooVeterinaryInc': brandingJson.publisher,
  'Roo Vet': brandingJson.author.name,
  'https://github.com/RooVetGit/Roo-Code': brandingJson.repository.url,
  'roo code': brandingJson.name, 
  'roocode': brandingJson.name,  
};
console.log('Defined string replacements:', stringReplacements);

// --- Update Top-Level Fields ---
console.log('Updating top-level package.json fields...');
packageObj.name = brandingJson.name;
packageObj.displayName = brandingJson.displayName;
packageObj.description = brandingJson.description; 
packageObj.publisher = brandingJson.publisher;
packageObj.version = newVersion; 
packageObj.icon = brandingJson.icon;
packageObj.author = brandingJson.author;
packageObj.repository = brandingJson.repository;
packageObj.homepage = brandingJson.homepage;
if (brandingJson.extensionSecretsPrefix) {
    packageObj.extensionSecretsPrefix = brandingJson.extensionSecretsPrefix;
}
if (brandingJson.extensionConfigDir) { 
    packageObj.extensionConfigDir = brandingJson.extensionConfigDir;
} else {
    delete packageObj.extensionConfigDir;
}
console.log('Top-level fields updated.');

// --- Merge Keywords ---
console.log('Merging keywords...');
const currentKeywords = new Set(packageObj.keywords || []);
const oldKeywords = new Set(['roo code', 'roocode']); 
brandingJson.keywords.forEach(k => currentKeywords.add(k)); 
oldKeywords.forEach(k => currentKeywords.delete(k)); 
packageObj.keywords = Array.from(currentKeywords);
console.log('Keywords merged.');

// --- Recursive String Replacement Function ---
function replaceStringsRecursively(item) {
  if (typeof item === 'string') {
    let replacedItem = item;
    for (const [oldStr, newStr] of Object.entries(stringReplacements)) {
      replacedItem = replacedItem.replaceAll(oldStr, newStr);
    }
    return replacedItem;
  }
  if (Array.isArray(item)) {
    return item.map(replaceStringsRecursively);
  }
  if (typeof item === 'object' && item !== null) {
    const newItem = {};
    for (const key in item) {
      if (Object.prototype.hasOwnProperty.call(item, key)) {
        const newKey = replaceStringsRecursively(key); 
        const newValue = replaceStringsRecursively(item[key]); 
        newItem[newKey] = newValue;
      }
    }
    return newItem;
  }
  return item;
}

// --- Apply Recursive Replacement to package.json object ---
console.log('Applying recursive string replacements throughout package.json object...');
const finalPackageObj = replaceStringsRecursively(packageObj);
console.log('Recursive replacements applied to package.json object.');

// --- Write updated package.json ---
try {
  console.log(`Writing final branded content to ${packageJsonPath}...`);
  fs.writeFileSync(packageJsonPath, JSON.stringify(finalPackageObj, null, 2));
  console.log('Successfully wrote final branded package.json.');
} catch (err) {
  console.error(`Failed to write updated package.json: ${err.message}`);
  process.exit(1);
}

// --- Function to generate TypeScript config content ---
function generateTsConfigContent(branding, version) {
  const name = branding.name;
  const displayName = branding.displayName;
  const publisher = branding.publisher;
  const secretsPrefix = branding.extensionSecretsPrefix || `${name}_config_`;
  const configDir = branding.extensionConfigDir || '.config';
  const repoUrl = branding.repository?.url || '';
  const homepageUrl = branding.homepage || '';
  const extensionId = `${publisher}.${name}`;
  const authorName = branding.author?.name || 'Unknown Author'; // Read author name
  const authorEmail = branding.author?.email || 'unknown@example.com'; // Read author email

  // Recreate constants structure using branding values
  const commands = {
    PLUS_BUTTON: `${name}.plusButtonClicked`, MCP_BUTTON: `${name}.mcpButtonClicked`, PROMPTS_BUTTON: `${name}.promptsButtonClicked`, HISTORY_BUTTON: `${name}.historyButtonClicked`, POPOUT_BUTTON: `${name}.popoutButtonClicked`, SETTINGS_BUTTON: `${name}.settingsButtonClicked`, HELP_BUTTON: `${name}.helpButtonClicked`, OPEN_NEW_TAB: `${name}.openInNewTab`, EXPLAIN_CODE: `${name}.explainCode`, FIX_CODE: `${name}.fixCode`, IMPROVE_CODE: `${name}.improveCode`, ADD_TO_CONTEXT: `${name}.addToContext`, TERMINAL_ADD_TO_CONTEXT: `${name}.terminalAddToContext`, TERMINAL_FIX: `${name}.terminalFixCommand`, TERMINAL_EXPLAIN: `${name}.terminalExplainCommand`, TERMINAL_FIX_CURRENT: `${name}.terminalFixCommandInCurrentTask`, TERMINAL_EXPLAIN_CURRENT: `${name}.terminalExplainCommandInCurrentTask`, NEW_TASK: `${name}.newTask`, 
  };
  const views = { SIDEBAR: `${name}.SidebarProvider`, TAB_PANEL: `${name}.TabPanelProvider`, ACTIVITY_BAR: `${name}-ActivityBar` };
  const config = { SECTION: name, ALLOWED_COMMANDS: `allowedCommands`, VS_CODE_LM_SELECTOR: `vsCodeLmModelSelector`, CHECKPOINTS_PREFIX: `${name}-checkpoints` };
  const menuGroups = { AI_COMMANDS: `${displayName} Commands`, NAVIGATION: 'navigation' };
  const apiReferences = { REPO_URL: repoUrl, HOMEPAGE: homepageUrl, APP_TITLE: displayName };

  // Define functions as strings for TEXT_PATTERNS
  const createRoleDefinitionFunc = `(role: string, modeName?: string): string => { const nameWithFallback = modeName ? \`\${EXTENSION_DISPLAY_NAME} (\${modeName})\` : EXTENSION_DISPLAY_NAME; return \`You are \${nameWithFallback}, \${role}\`; }`;
  const logPrefixFunc = `(): string => \`\${EXTENSION_DISPLAY_NAME} <Language Model API>:\``;
  const textPatternsString = `{ createRoleDefinition: ${createRoleDefinitionFunc}, logPrefix: ${logPrefixFunc} }`;

  // Construct the full file content
  return `// Generated by scripts/apply-thea-branding.js - Do not edit manually

export const EXTENSION_NAME = "${name}";
export const EXTENSION_DISPLAY_NAME = "${displayName}";
export const EXTENSION_PUBLISHER = "${publisher}";
export const EXTENSION_VERSION = "${version}";
export const EXTENSION_ID = "${extensionId}";
export const EXTENSION_SECRETS_PREFIX = "${secretsPrefix}";
export const EXTENSION_CONFIG_DIR = "${configDir}"; 
export const REPOSITORY_URL = "${repoUrl}";
export const HOMEPAGE_URL = "${homepageUrl}";
export const AUTHOR_NAME = "${authorName}"; // Export author name
export const AUTHOR_EMAIL = "${authorEmail}"; // Export author email

export const COMMANDS = ${JSON.stringify(commands, null, 2)};
export const VIEWS = ${JSON.stringify(views, null, 2)};
export const CONFIG = ${JSON.stringify(config, null, 2)};
export const MENU_GROUPS = ${JSON.stringify(menuGroups, null, 2)};
export const TEXT_PATTERNS = ${textPatternsString};
export const API_REFERENCES = ${JSON.stringify(apiReferences, null, 2)};

// Helper function equivalents
export const prefixCommand = (command: string): string => \`\${EXTENSION_NAME}.\${command}\`;
export const brandMessage = (message: string): string => \`\${EXTENSION_DISPLAY_NAME}: \${message}\`;
export const configSection = (): string => CONFIG.SECTION; 
// Add other helpers if needed, e.g., getConfig, getTabTitle etc. mirroring branding.ts
`;
}

// --- Generate Runtime Config File ---
console.log('Generating runtime configuration file...');
const distDir = path.dirname(generatedConfigPath);
try {
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
    console.log(`Created directory: ${distDir}`);
  }
  const tsContent = generateTsConfigContent(brandingJson, newVersion);
  fs.writeFileSync(generatedConfigPath, tsContent);
  console.log(`Successfully wrote runtime config to ${generatedConfigPath}`);
} catch (err) {
  console.error(`Failed to generate runtime config file: ${err.message}`);
  process.exit(1);
}

console.log('Thea Branding applied successfully!');
console.log(`Version set to ${newVersion}.`);
console.log(`Please review package.json and test thoroughly.`);