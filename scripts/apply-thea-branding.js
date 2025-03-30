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
  const configDir = branding.configDirName || `.${name.toLowerCase()}`; // Use configDirName instead
  const repoUrl = branding.repository?.url || '';
  const homepageUrl = branding.homepage || '';
  const extensionId = `${publisher}.${name}`;
  const authorName = branding.author?.name || 'Unknown Author';
  const authorEmail = branding.author?.email || 'unknown@example.com';
  const ignoreFileName = branding.ignoreFileName || `.${name.toLowerCase()}ignore`;
  const modesFileName = branding.modesFileName || `.${name.toLowerCase()}modes`;
  const aiIdentityName = branding.aiIdentityName || displayName;
  const branchPrefix = branding.branchPrefix || `${name.toLowerCase()}-`;
  const configDirName = branding.configDirName || `.${name.toLowerCase()}`; // Add configDirName field
 
  // Recreate constants structure using branding values
  const commands = {
  	PLUS_BUTTON: `${name}.plusButtonClicked`, MCP_BUTTON: `${name}.mcpButtonClicked`, PROMPTS_BUTTON: `${name}.promptsButtonClicked`, HISTORY_BUTTON: `${name}.historyButtonClicked`, POPOUT_BUTTON: `${name}.popoutButtonClicked`, SETTINGS_BUTTON: `${name}.settingsButtonClicked`, HELP_BUTTON: `${name}.helpButtonClicked`, OPEN_NEW_TAB: `${name}.openInNewTab`, EXPLAIN_CODE: `${name}.explainCode`, FIX_CODE: `${name}.fixCode`, IMPROVE_CODE: `${name}.improveCode`, ADD_TO_CONTEXT: `${name}.addToContext`, TERMINAL_ADD_TO_CONTEXT: `${name}.terminalAddToContext`, TERMINAL_FIX: `${name}.terminalFixCommand`, TERMINAL_EXPLAIN: `${name}.terminalExplainCommand`, TERMINAL_FIX_CURRENT: `${name}.terminalFixCommandInCurrentTask`, TERMINAL_EXPLAIN_CURRENT: `${name}.terminalExplainCommandInCurrentTask`, NEW_TASK: `${name}.newTask`,
  };
  const views = { SIDEBAR: `${name}.SidebarProvider`, TAB_PANEL: `${name}.TabPanelProvider`, ACTIVITY_BAR: `${name}-ActivityBar` };
  const config = { SECTION: name, ALLOWED_COMMANDS: `allowedCommands`, VS_CODE_LM_SELECTOR: `vsCodeLmModelSelector`, CHECKPOINTS_PREFIX: `${name}-checkpoints` };
  const menuGroups = { AI_COMMANDS: `${displayName} Commands`, NAVIGATION: 'navigation' };
  const apiReferences = { REPO_URL: repoUrl, HOMEPAGE: homepageUrl, APP_TITLE: displayName };
  const globalFileNames = { IGNORE_FILENAME: ignoreFileName, MODES_FILENAME: modesFileName };
 
  // Define functions as strings for TEXT_PATTERNS
  const createRoleDefinitionFunc = `(role: string, modeName?: string): string => { return \`You are \${AI_IDENTITY_NAME}, \${role}\`; }`;
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
 export const CONFIG_DIR_NAME = "${configDirName}"; // Export configDirName constant
 export const REPOSITORY_URL = "${repoUrl}";
 export const HOMEPAGE_URL = "${homepageUrl}";
 export const AUTHOR_NAME = "${authorName}";
 export const AUTHOR_EMAIL = "${authorEmail}";
 export const AI_IDENTITY_NAME = "${aiIdentityName}";
 export const BRANCH_PREFIX = "${branchPrefix}"; // Export BRANCH_PREFIX
 
 export const COMMANDS = ${JSON.stringify(commands, null, 2)};
export const VIEWS = ${JSON.stringify(views, null, 2)};
export const CONFIG = ${JSON.stringify(config, null, 2)};
export const MENU_GROUPS = ${JSON.stringify(menuGroups, null, 2)};
export const TEXT_PATTERNS = ${textPatternsString};
export const API_REFERENCES = ${JSON.stringify(apiReferences, null, 2)};
export const GLOBAL_FILENAMES = ${JSON.stringify(globalFileNames, null, 2)}; // Add export for global filenames

// Helper function equivalents
export const prefixCommand = (command: string): string => \`\${EXTENSION_NAME}.\${command}\`;
export const brandMessage = (message: string): string => \`\${EXTENSION_DISPLAY_NAME}: \${message}\`;
export const configSection = (): string => CONFIG.SECTION; 
// Add other helpers if needed, e.g., getConfig, getTabTitle etc. mirroring branding.ts
`;
}

// --- Helper to find common.json files ---
function findJsonFiles(dir, fileName = "common.json") {
  let results = [];
  if (!fs.existsSync(dir)) return results; // Skip if dir doesn't exist

  const list = fs.readdirSync(dir);
  list.forEach(function(file) {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) { 
      // Recurse into subdirectories, excluding 'en'
      if (path.basename(file) !== 'en') {
         results = results.concat(findJsonFiles(file, fileName));
      }
    } else if (path.basename(file) === fileName) { 
      results.push(file);
    }
  });
  return results;
}

// --- Helper to update a single JSON file ---
function updateJsonFile(filePath, branding) {
  try {
    console.log(`Processing i18n file: ${filePath}`);
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const jsonObj = JSON.parse(fileContent);
    const isEnglishFile = filePath.includes('/en/');

    // Only update fields that already exist, never add new ones
    if (jsonObj.extension?.name) {
      jsonObj.extension.name = branding.displayName;
    }
    
    if (jsonObj.input?.task_prompt) {
      // Replace 'Roo' specifically, case-sensitive, to avoid changing other words
      jsonObj.input.task_prompt = jsonObj.input.task_prompt.replace(/\bRoo\b/g, branding.aiIdentityName);
    }
    
    if (jsonObj.errors?.create_mcp_json) {
      // Get the config dir name from branding
      const configDirName = branding.configDirName || `.${branding.name.toLowerCase()}`;
      
      if (isEnglishFile) {
        // For English, replace the entire error message
        jsonObj.errors.create_mcp_json = `Failed to create or open ${configDirName}/mcp.json: {{error}}`;
      } else {
        // For non-English, only try to replace path part, preserving the localized text
        const currentMessage = jsonObj.errors.create_mcp_json;
        
        // Only replace if it's an English path (not already localized)
        if (currentMessage.includes('Failed to create or open')) {
          // It's still in English, replace fully
          jsonObj.errors.create_mcp_json = `Failed to create or open ${configDirName}/mcp.json: {{error}}`;
        } else {
          // It's localized, carefully replace just the path pattern
          jsonObj.errors.create_mcp_json = currentMessage.replace(/\.roo\/mcp\.json/g, `${configDirName}/mcp.json`)
                                                        .replace(/\.config\/mcp\.json/g, `${configDirName}/mcp.json`);
        }
      }
    }
    
    if (jsonObj.storage?.path_placeholder) {
        // Replace placeholder example path but preserve localization
        const oldStorageName = /RooCodeStorage/g;
        const newStorageName = `${branding.displayName.replace(/\s+/g, '')}Storage`;
        
        // Only replace if the old pattern exists
        if (oldStorageName.test(jsonObj.storage.path_placeholder)) {
          jsonObj.storage.path_placeholder = jsonObj.storage.path_placeholder.replace(oldStorageName, newStorageName);
        }
    }
    
    if (jsonObj.storage?.enter_absolute_path) {
        // Replace example path in instructions but preserve localization
        const oldStorageName = /RooCodeStorage/g;
        const newStorageName = `${branding.displayName.replace(/\s+/g, '')}Storage`;
        
        // Only replace if the old pattern exists
        if (oldStorageName.test(jsonObj.storage.enter_absolute_path)) {
          jsonObj.storage.enter_absolute_path = jsonObj.storage.enter_absolute_path.replace(oldStorageName, newStorageName);
        }
    }


    fs.writeFileSync(filePath, JSON.stringify(jsonObj, null, 2)); // Pretty print JSON
    console.log(`Successfully updated ${filePath}`);
  } catch (err) {
    console.error(`Failed to update ${filePath}: ${err.message}`);
    // Don't exit, just log the error and continue
  }
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

// --- Update i18n JSON files ---
console.log('Updating i18n common.json files...');
const i18nDirs = [
  path.join(__dirname, '..', 'src', 'i18n', 'locales'),
  path.join(__dirname, '..', 'webview-ui', 'src', 'i18n', 'locales')
];

// Function to safely check out just the common.json files if needed
function safelyCheckoutI18nFiles(files) {
  try {
    const { execSync } = require('child_process');
    const isGitRepo = execSync('git rev-parse --is-inside-work-tree', { stdio: 'pipe' }).toString().trim() === 'true';
    
    if (isGitRepo) {
      console.log('Git repository detected, checking common.json files...');
      // Create relative paths for git commands
      const repoRoot = execSync('git rev-parse --show-toplevel', { stdio: 'pipe' }).toString().trim();
      const relativePaths = files.map(file => path.relative(repoRoot, file));
      
      // Check which files have changes
      const changedFiles = [];
      for (const relPath of relativePaths) {
        try {
          const status = execSync(`git status --porcelain "${relPath}"`, { stdio: 'pipe' }).toString().trim();
          if (status) {
            changedFiles.push(relPath);
          }
        } catch (e) {
          // Ignore file-specific errors
        }
      }
      
      if (changedFiles.length > 0) {
        console.log(`Found ${changedFiles.length} modified common.json files. Checking out clean versions...`);
        for (const file of changedFiles) {
          try {
            execSync(`git checkout -- "${file}"`);
            console.log(`Restored ${file} to HEAD state`);
          } catch (e) {
            console.warn(`Warning: Could not check out ${file}: ${e.message}`);
          }
        }
      } else {
        console.log('All common.json files are clean, no checkout needed.');
      }
    }
  } catch (error) {
    console.warn('Warning: Could not check common.json files: ', error.message);
  }
}

// Collect all common.json files
let allJsonFiles = [];
i18nDirs.forEach(dir => {
  if (fs.existsSync(dir)) {
    const jsonFiles = findJsonFiles(dir, "common.json");
    // Also add the English file
    const enFilePath = path.join(dir, 'en', 'common.json');
    if (fs.existsSync(enFilePath)) {
      allJsonFiles.push(enFilePath);
    }
    allJsonFiles = allJsonFiles.concat(jsonFiles);
  }
});

// Checkout clean versions if files are modified
safelyCheckoutI18nFiles(allJsonFiles);

// Now process the files
i18nDirs.forEach(dir => {
  const jsonFiles = findJsonFiles(dir, "common.json"); // Find only common.json
  // Also update the English file
  const enFilePath = path.join(dir, 'en', 'common.json');
  if (fs.existsSync(enFilePath)) {
      updateJsonFile(enFilePath, brandingJson);
  }
  // Update other language files
  jsonFiles.forEach(file => updateJsonFile(file, brandingJson));
});

// --- Process Modes Template File ---
console.log('Processing modes template file...');
const modesTemplatePath = path.join(__dirname, '..', 'dist', 'modes_template.json');
const targetModesPath = path.join(__dirname, '..', brandingJson.modesFileName || `.${brandingJson.name.toLowerCase()}modes`); // Use modesFileName from branding.json

try {
  if (fs.existsSync(modesTemplatePath)) {
    let templateContent = fs.readFileSync(modesTemplatePath, 'utf8');
    const aiName = brandingJson.aiIdentityName || brandingJson.displayName; // Get AI name
    
    // Replace placeholder
    templateContent = templateContent.replaceAll('{{AI_IDENTITY_NAME}}', aiName);
    
    // Write the final modes file
    fs.writeFileSync(targetModesPath, templateContent);
    console.log(`Successfully created/updated modes file at ${targetModesPath}`);
  } else {
    console.warn(`Modes template file not found at ${modesTemplatePath}. Skipping modes file generation.`);
  }
} catch (err) {
  console.error(`Failed to process modes template file: ${err.message}`);
  // Don't exit, just log error
}


console.log('Finished updating i18n files.');

