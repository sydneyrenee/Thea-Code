# Bug Reports

## Failing Test: ShadowCheckpointService › getTaskStorage › returns 'workspace' when workspace repo exists with task branch

**Observed on Branch:** `thea-dev` (after branding/refactoring merge)

**File:** `src/services/checkpoints/__tests__/ShadowCheckpointService.test.ts`

**Test Description:** This test aims to verify that the static `ShadowCheckpointService.getTaskStorage` method correctly identifies when a task is using the "workspace" storage strategy. This relies on the corresponding `RepoPerWorkspaceCheckpointService` instance having successfully initialized its shadow git repository and created/checked out the task-specific branch (e.g., `task/test-task-storage`) within that shadow repo.

**Failure:** The test fails with `Expected: "workspace", Received: undefined`.

**Analysis:**
*   The test setup correctly creates a mock workspace directory and initializes a `RepoPerWorkspaceCheckpointService`.
*   It then calls `service.initShadowGit()`, which *should* create the workspace shadow repo (`.git` inside `globalStorageDir/checkpoints/${workspaceHash}`) and fetch/checkout the `task/${taskId}` branch.
*   However, the assertion `expect(storage).toBe("workspace")` fails immediately after `initShadowGit`, indicating that `ShadowCheckpointService.getTaskStorage` (which likely calls `workspaceRepoHasTaskBranch`) does not detect the required task branch within the workspace shadow repo.
*   Attempts to fix this by explicitly adding the branch to the *workspace* repo *before* `initShadowGit` were rejected as potentially masking the real issue or being out of scope.
*   The root cause might be within the `initShadowGit` logic of `RepoPerWorkspaceCheckpointService` (potentially related to how `fetch` or `checkout` behaves with `simple-git` after dependency updates or refactoring) or within the `workspaceRepoHasTaskBranch` check itself. It seems `initShadowGit` is not reliably ensuring the task branch exists in the shadow repo under the test conditions on this branch.

**Status:** Not fixed. Marked as out-of-scope for the branding task. Needs further investigation into the checkpoint service logic or test environment interaction.