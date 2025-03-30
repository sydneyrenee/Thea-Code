# Rebranding Implementation Details

This document explains the specific implementation details of the rebranding process from "Roo Code" to "Thea Code".

## Overview

The rebranding process involved:

1. Updating the `branding.json` file with new values
2. Generating a `dist/thea-config.ts` file using the `apply-thea-branding.js` script
3. Updating references throughout the codebase to use the generated constants

## Changes to API Provider Files

Several API provider files needed updates to use the new branding information correctly:

### 1. OpenAI Provider (`src/api/providers/openai.ts`)

The original file exported a `defaultHeaders` constant that contained branding information:

```typescript
// Original code (simplified)
export const defaultHeaders = {
  "HTTP-Referer": "https://github.com/RooVetGit/Roo-Code",
  "X-Title": "Roo Code"
}
```

This was replaced with:

```typescript
// New code (simplified)
import { API_REFERENCES } from "../../../dist/thea-config";

const brandedHeaders = {
  "HTTP-Referer": API_REFERENCES.HOMEPAGE,
  "X-Title": API_REFERENCES.APP_TITLE
};
```

### 2. OpenRouter Provider (`src/api/providers/openrouter.ts`)

This file imported and used the `defaultHeaders` constant from `openai.ts`:

```typescript
// Original code (simplified)
import { defaultHeaders } from "./openai";

// In constructor:
this.client = new OpenAI({ baseURL, apiKey, defaultHeaders });
```

Since that constant was removed, this file needed to be updated to use the same pattern:

```typescript
// New code (simplified)
import { API_REFERENCES } from "../../../dist/thea-config";

// In constructor:
this.client = new OpenAI({ 
  baseURL, 
  apiKey, 
  defaultHeaders: {
    "HTTP-Referer": API_REFERENCES.HOMEPAGE,
    "X-Title": API_REFERENCES.APP_TITLE
  } 
});
```

## Branch Names in ShadowCheckpointService

In `src/services/checkpoints/ShadowCheckpointService.ts`, Git branch names were being created with a hardcoded "roo-" prefix:

```typescript
// Original code (simplified)
const branchName = `roo-${taskId}`;
```

This was updated to use the EXTENSION_NAME constant:

```typescript
// New code (simplified)
import { EXTENSION_NAME } from "../../../dist/thea-config";

const branchName = `${EXTENSION_NAME}-${taskId}`;
```

## Configuration Values

Many configuration values referenced the old name:

```typescript
// Original code (simplified)
const config = vscode.workspace.getConfiguration("roo-code");
```

These were updated to use the configSection helper function:

```typescript
// New code (simplified)
import { configSection } from "../../../dist/thea-config";

const config = vscode.workspace.getConfiguration(configSection());
```

## Rationale for Changes

While some changes might appear to be modifying API behavior, they are actually necessary for the rebranding:

1. **Centralization of Branding Information**: 
   - Previous approach scattered branding references throughout the codebase
   - New approach centralizes all branding in one generated file
   - This makes future rebranding simpler

2. **Removal of Inter-file Dependencies**:
   - Previous approach had files depending on other files for branding constants
   - New approach has each file import directly from the centralized config
   - This reduces coupling between files

3. **Consistency Across Codebase**:
   - All files now use the same pattern for branding references
   - This improves maintainability

## Testing

To test that all rebranding changes have been properly applied, run all API provider tests to ensure they still function correctly with the new branding information.