# Remaining Issues — Implementation Plan

> **Created:** 2026-02-10  
> **Context:** Code review identified 29 issues. 22 have been resolved. This plan covers the **7 remaining issues** with full task breakdowns, acceptance criteria, and test expectations.

---

## Table of Contents

1. [Issue #8 — Replace `innerHTML` with Safe DOM Construction](#issue-8)
2. [Issue #9 — Optimize `toggleSelection` to Avoid Full Re-render](#issue-9)
3. [Issue #19 — Fix Placeholder Repository URL](#issue-19)
4. [Issue #20 — Fix Directory Name Typo](#issue-20)
5. [Issue #22 — Add `.vscode/launch.json`](#issue-22)
6. [Issue #25 — Add JSDoc Comments](#issue-25)
7. [Issue #26 — Upgrade ESLint Packages](#issue-26)
8. [Execution Order & Dependencies](#execution-order)

---

<a id="issue-8"></a>
## Issue #8 — Replace `innerHTML` with Safe DOM Construction

**Severity:** High  
**File:** `media/main.js` — `renderGrid()` function  
**Risk:** XSS defense-in-depth; `innerHTML` bypasses the browser's built-in text escaping even when wrapped in `escapeHtml()`  

### Problem

The `renderGrid()` function builds table rows using `tr.innerHTML = \`...\``, which:
- Relies entirely on `escapeHtml()` for XSS prevention — if a future developer forgets to wrap a value, it's a vulnerability
- Forces the browser to parse HTML strings instead of creating DOM nodes directly
- Makes it harder to attach event listeners cleanly (currently queries the checkbox after `innerHTML` is set)

### Tasks

#### Task 8.1 — Create a `createRow(item, isSelected)` helper function
- **File:** `media/main.js`
- **Action:** Extract row creation into a dedicated function that uses `document.createElement` for every cell
- **Details:**
  ```
  function createRow(item, isSelected) {
      const tr = document.createElement('tr');
      tr.role = 'row';
      tr.dataset.id = item.id;
      if (isSelected) tr.classList.add('selected');

      // Checkbox cell
      const tdCheckbox = document.createElement('td');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = isSelected;
      checkbox.setAttribute('aria-label', `Select ${item.componentName}`);
      checkbox.addEventListener('change', () => toggleSelection(item.id));
      tdCheckbox.appendChild(checkbox);
      tr.appendChild(tdCheckbox);

      // Name cell
      const tdName = document.createElement('td');
      tdName.textContent = item.componentName;
      tdName.title = item.componentName;
      tr.appendChild(tdName);

      // Type cell
      const tdType = document.createElement('td');
      tdType.textContent = item.type;
      tr.appendChild(tdType);

      // Modified By cell
      const tdModifiedBy = document.createElement('td');
      tdModifiedBy.textContent = item.modifiedBy;
      tr.appendChild(tdModifiedBy);

      // Date cell
      const tdDate = document.createElement('td');
      tdDate.textContent = formatDate(item.date);
      tdDate.title = item.date || '';
      tr.appendChild(tdDate);

      // Created By cell
      const tdCreatedBy = document.createElement('td');
      tdCreatedBy.textContent = item.modifiedBy;
      tr.appendChild(tdCreatedBy);

      // Row click handler (toggle on click, but not on checkbox)
      tr.addEventListener('click', (e) => {
          if (e.target.tagName !== 'INPUT') {
              toggleSelection(item.id);
          }
      });

      return tr;
  }
  ```

#### Task 8.2 — Update `renderGrid()` to use `createRow()`
- **File:** `media/main.js`
- **Action:** Replace the `innerHTML` block inside the `pageItems.forEach(...)` loop with a call to `createRow(item, isSelected)`
- **Remove:** The separate `tr.querySelector('input[type="checkbox"]').addEventListener(...)` line (now handled inside `createRow`)
- **Before:**
  ```js
  tr.innerHTML = `<td>...</td>...`;
  const checkbox = tr.querySelector('input[type="checkbox"]');
  checkbox.addEventListener('change', () => toggleSelection(item.id));
  ```
- **After:**
  ```js
  const tr = createRow(item, isSelected);
  dom.gridBody.appendChild(tr);
  ```

#### Task 8.3 — Remove `escapeHtml()` calls from row rendering
- **File:** `media/main.js`
- **Action:** Since `textContent` auto-escapes, remove all `escapeHtml()` calls that were wrapping cell values in the row template
- **Keep:** `escapeHtml()` function itself — it may still be needed elsewhere (e.g., ARIA labels if constructed via strings)

### Testing

#### Unit Tests (add to `src/test/utils.test.ts`)
- **Test:** Verify `createRow()` returns a `<tr>` element with 6 child `<td>` cells
- **Test:** Verify the first cell contains an `<input type="checkbox">`
- **Test:** Verify `textContent` of each cell matches the input item properties
- **Test:** Verify that HTML entities in `item.componentName` (e.g., `<script>alert('xss')</script>`) are displayed as text, not parsed as HTML
- **Test:** Verify `data-id` attribute is set correctly on the `<tr>`
- **Test:** Verify `.selected` class is applied when `isSelected=true`

> **Note:** These tests require a DOM. Use `jsdom` or run in the VS Code test host. If running standalone, add `jsdom` as a dev dependency.

### Acceptance Criteria
- [ ] Zero uses of `innerHTML` in `renderGrid()`
- [ ] All cell content set via `textContent` (not `innerText`, not `innerHTML`)
- [ ] Event listeners attached directly via `addEventListener`, not via inline HTML attributes
- [ ] Visual output is identical to current behavior
- [ ] No regressions in sorting, filtering, or pagination

---

<a id="issue-9"></a>
## Issue #9 — Optimize `toggleSelection` to Avoid Full Re-render

**Severity:** High  
**File:** `media/main.js` — `toggleSelection()` function  
**Risk:** Performance degradation with large datasets; checkbox focus loss on toggle  

### Problem

`toggleSelection(id)` currently calls `renderGrid()`, which destroys and recreates every DOM node in the table body. For a 100-row table, this means:
- ~600 DOM nodes destroyed and recreated on every checkbox click
- The clicked checkbox loses focus
- Visible flicker on slower machines

### Tasks

#### Task 9.1 — Update `toggleSelection()` to modify only the affected row
- **File:** `media/main.js`
- **Action:** Replace the `renderGrid()` call with targeted DOM manipulation
- **Implementation:**
  ```js
  function toggleSelection(id) {
      if (state.selectedIds.has(id)) {
          state.selectedIds.delete(id);
      } else {
          state.selectedIds.add(id);
      }

      // Update only the affected row's visual state
      const row = dom.gridBody.querySelector(`tr[data-id="${CSS.escape(id)}"]`);
      if (row) {
          const isSelected = state.selectedIds.has(id);
          row.classList.toggle('selected', isSelected);
          const checkbox = row.querySelector('input[type="checkbox"]');
          if (checkbox) {
              checkbox.checked = isSelected;
          }
      }

      // If viewing the "Selected" tab and we deselected, remove the row
      if (state.currentTab === 'selected' && !state.selectedIds.has(id)) {
          const row = dom.gridBody.querySelector(`tr[data-id="${CSS.escape(id)}"]`);
          if (row) {
              row.remove();
          }
          // Update filtered data to keep counts accurate
          updateFilteredData();
      }

      updatePaginationUI();
      updateUI();
      debouncedSaveState();
  }
  ```

#### Task 9.2 — Use `CSS.escape()` for safe selector construction
- **File:** `media/main.js`
- **Action:** Wrap `id` in `CSS.escape()` when used inside `querySelector` to prevent selector injection if IDs contain special characters
- **Fallback:** If `CSS.escape` is not available in the Webview environment, implement a simple polyfill

#### Task 9.3 — Handle "Selected" tab row removal
- **File:** `media/main.js`
- **Action:** When on the "Selected" tab and a row is deselected:
  1. Remove the `<tr>` from the DOM
  2. Call `updateFilteredData()` to recalculate the filtered list
  3. Call `updatePaginationUI()` to update counts
- **Edge case:** If removing the last item on a page, decrement `currentPage` (but don't go below 1)

### Testing

#### Unit Tests (add to `src/test/utils.test.ts`)
- **Test:** After `toggleSelection(id)`, the Set is updated correctly (already covered)
- **Test:** `CSS.escape` properly escapes IDs with special characters (`.`, `:`, `[`, `]`)

#### Manual Verification
- [ ] Click a checkbox — only that row's visual state changes, no flicker
- [ ] The clicked checkbox retains focus after toggle
- [ ] Tab counts update correctly
- [ ] "Select All" checkbox state (checked / indeterminate / unchecked) updates correctly
- [ ] On "Selected" tab: deselecting an item removes only that row
- [ ] On "Selected" tab: deselecting the last item on a page navigates to previous page

### Acceptance Criteria
- [ ] `toggleSelection()` does NOT call `renderGrid()`
- [ ] Only the affected `<tr>` is visually modified
- [ ] No DOM destruction/recreation on single checkbox toggle
- [ ] All edge cases for "Selected" tab handled

---

<a id="issue-19"></a>
## Issue #19 — Fix Placeholder Repository URL

**Severity:** Low  
**File:** `package.json`  

### Problem

The `repository.url` field is set to `https://github.com/example/sf-commit-studio.git`, a placeholder that will appear in the VS Code Marketplace and npm metadata if published.

### Tasks

#### Task 19.1 — Update `repository.url` with the actual GitHub URL
- **File:** `package.json`
- **Action:** Replace `"url": "https://github.com/example/sf-commit-studio.git"` with the actual repository URL
- **If no public repo exists yet:** Set to the correct GitHub username/org, e.g., `"url": "https://github.com/evan-hyer/sf-commit-studio.git"`

### Testing
- **Verify:** `npm pack --dry-run` shows the correct repository metadata
- **Verify:** `package.json` is valid JSON after the edit

### Acceptance Criteria
- [ ] `repository.url` points to a real repository
- [ ] No broken links in generated metadata

---

<a id="issue-20"></a>
## Issue #20 — Fix Directory Name Typo

**Severity:** Low  
**Root Cause:** The project directory is named `sf-commit-sudio` (missing the "t" in "studio")  

### Problem

The typo `sudio` vs `studio` will propagate into:
- Git remote URLs
- CI/CD paths
- Developer documentation
- File system references

### Tasks

#### Task 20.1 — Rename the project directory
- **Action:** Rename `c:\Repos\sf-commit-sudio` → `c:\Repos\sf-commit-studio`
- **Method:** 
  1. Close VS Code
  2. Rename the folder via File Explorer or PowerShell: `Rename-Item "C:\Repos\sf-commit-sudio" "sf-commit-studio"`
  3. Reopen VS Code in the renamed folder
- **Impact:** Any absolute paths in configs, `.git/config`, or bookmarks will need updating

#### Task 20.2 — Verify no internal references use the old path
- **Action:** Search all project files for `sudio`:
  ```powershell
  Select-String -Path "C:\Repos\sf-commit-studio\**\*" -Pattern "sudio" -Recurse
  ```
- **Fix:** Update any references found

#### Task 20.3 — Update Git remote (if applicable)
- **Action:** If the GitHub repo is also misnamed, rename it on GitHub first, then:
  ```bash
  git remote set-url origin https://github.com/<user>/sf-commit-studio.git
  ```

### Testing
- **Verify:** `npm run compile` succeeds from the renamed directory
- **Verify:** `npm test` passes from the renamed directory
- **Verify:** `git status` is clean (no unexpected changes from rename)

### Acceptance Criteria
- [ ] Directory name is `sf-commit-studio`
- [ ] No files contain the typo `sudio`
- [ ] Build and tests pass from the new location

---

<a id="issue-22"></a>
## Issue #22 — Add `.vscode/launch.json`

**Severity:** Low  
**Impact:** Developer experience — makes it easy to F5-debug the extension  

### Problem

There is no `.vscode/launch.json`, so developers must manually configure the debugger to test the extension. The standard VS Code extension generator creates this file by default.

### Tasks

#### Task 22.1 — Create `.vscode/launch.json` with extension debug configs
- **File:** `.vscode/launch.json`
- **Content:**
  ```json
  {
      "version": "0.2.0",
      "configurations": [
          {
              "name": "Run Extension",
              "type": "extensionHost",
              "request": "launch",
              "args": [
                  "--extensionDevelopmentPath=${workspaceFolder}"
              ],
              "outFiles": [
                  "${workspaceFolder}/dist/**/*.js"
              ],
              "preLaunchTask": "${defaultBuildTask}"
          },
          {
              "name": "Extension Tests",
              "type": "extensionHost",
              "request": "launch",
              "args": [
                  "--extensionDevelopmentPath=${workspaceFolder}",
                  "--extensionTestsPath=${workspaceFolder}/dist/test/index"
              ],
              "outFiles": [
                  "${workspaceFolder}/dist/**/*.js"
              ],
              "preLaunchTask": "${defaultBuildTask}"
          }
      ]
  }
  ```

#### Task 22.2 — Create `.vscode/tasks.json` (if missing)
- **File:** `.vscode/tasks.json`
- **Content:**
  ```json
  {
      "version": "2.0.0",
      "tasks": [
          {
              "type": "npm",
              "script": "compile",
              "problemMatcher": "$tsc",
              "isBackground": false,
              "label": "npm: compile",
              "group": {
                  "kind": "build",
                  "isDefault": true
              }
          },
          {
              "type": "npm",
              "script": "watch",
              "problemMatcher": "$tsc-watch",
              "isBackground": true,
              "label": "npm: watch",
              "group": "build"
          }
      ]
  }
  ```

### Testing
- **Verify:** Press F5 in VS Code → a new Extension Host window opens with the extension loaded
- **Verify:** The "Extension Tests" configuration runs the test suite
- **Verify:** Breakpoints hit in `.ts` source files (source maps working)

### Acceptance Criteria
- [ ] `.vscode/launch.json` exists with both "Run Extension" and "Extension Tests" configs
- [ ] `.vscode/tasks.json` exists with compile and watch tasks
- [ ] F5 launches the extension successfully
- [ ] Breakpoints work in TypeScript source

---

<a id="issue-25"></a>
## Issue #25 — Add JSDoc Comments

**Severity:** Low  
**Impact:** Maintainability and developer onboarding  

### Problem

Public methods and key interfaces lack JSDoc comments, making it harder for new contributors to understand the codebase.

### Tasks

#### Task 25.1 — Add JSDoc to `types.ts` interfaces
- **File:** `src/types.ts`
- **Action:** Add JSDoc to every exported interface and type alias
- **Focus on:**
  - `MetadataChange` — what each field means and its expected format
  - `WebviewMessage` / `HostMessage` — document the message protocol
  - `OrgInfo`, `RetrieveResult`, `CommitResult` — purpose and lifecycle

#### Task 25.2 — Add JSDoc to `ExtensionHostService.ts` public methods
- **File:** `src/services/ExtensionHostService.ts`
- **Action:** Document:
  - `handleMessage()` — the main entry point, what messages it handles
  - Each private method — describe purpose, params, return values, and thrown errors
- **Template:**
  ```typescript
  /**
   * Routes an incoming Webview message to the appropriate handler.
   *
   * @param message - The typed message from the Webview
   * @param webview - The Webview instance to send responses to
   * @throws Never — all errors are caught and sent as error messages
   */
  ```

#### Task 25.3 — Add JSDoc to `CommitStudioPanel.ts` public methods
- **File:** `src/panels/CommitStudioPanel.ts`
- **Action:** Document:
  - `createOrShow()` — singleton behavior, when to call
  - `dispose()` — cleanup behavior
  - `_getWebviewOptions()` — security implications of the options

#### Task 25.4 — Add JSDoc to `extension.ts`
- **File:** `src/extension.ts`
- **Action:** Document `activate()` and `deactivate()` functions

#### Task 25.5 — Add JSDoc to key functions in `main.js`
- **File:** `media/main.js`
- **Action:** Document:
  - `renderGrid()` — what triggers it, performance notes
  - `toggleSelection()` — behavior on each tab
  - `commitChanges()` — the large commit confirmation flow
  - `escapeHtml()` / `formatDate()` — already partially documented

### Testing
- **Verify:** `npx tsc --noEmit` still passes (JSDoc doesn't break types)
- **Verify:** Hover over documented symbols in VS Code shows the JSDoc tooltips

### Acceptance Criteria
- [ ] Every exported function, class, and interface has a JSDoc comment
- [ ] JSDoc includes `@param` and `@returns` where applicable
- [ ] JSDoc includes `@throws` for methods that may throw
- [ ] No TypeScript compilation errors introduced

---

<a id="issue-26"></a>
## Issue #26 — Upgrade ESLint Packages

**Severity:** Low  
**Impact:** Technical debt; current versions may have known bugs or missing rules  

### Problem

| Package | Current | Latest Stable |
|---------|---------|---------------|
| `eslint` | `^8.39.0` | `^9.x` (flat config) |
| `@typescript-eslint/eslint-plugin` | `^5.59.1` | `^8.x` |
| `@typescript-eslint/parser` | `^5.59.1` | `^8.x` |

ESLint 9 introduces breaking changes (flat config format), and `typescript-eslint` v8 drops support for ESLint < 8.57.

### Tasks

#### Task 26.1 — Evaluate upgrade path
- **Decision Point:** Upgrade to ESLint 9 + flat config, or stay on ESLint 8 with updated `typescript-eslint`?
- **Recommendation:** Upgrade `typescript-eslint` to `^8.x` while staying on ESLint 8, to minimize disruption. ESLint 9 flat config migration can be done later.

#### Task 26.2 — Upgrade `typescript-eslint` packages
- **Action:**
  ```bash
  npm install --save-dev @typescript-eslint/eslint-plugin@^8 @typescript-eslint/parser@^8
  ```
- **Verify:** `.eslintrc.json` is still compatible with the new package versions
- **Fix:** Update any rule names that were renamed or removed in v8

#### Task 26.3 — Update `.eslintrc.json` for compatibility
- **File:** `.eslintrc.json`
- **Action:** Review the [typescript-eslint v8 migration guide](https://typescript-eslint.io/blog/announcing-typescript-eslint-v8/) for breaking rule changes
- **Likely changes:**
  - `@typescript-eslint/naming-convention` may need updated options
  - Some rules may have been renamed or moved

#### Task 26.4 — Run lint and fix issues
- **Action:**
  ```bash
  npm run lint -- --fix
  ```
- **Review:** Any remaining lint errors that can't be auto-fixed

#### Task 26.5 — (Optional, Future) Migrate to ESLint 9 flat config
- **Action:** Convert `.eslintrc.json` to `eslint.config.js`
- **This is optional and can be deferred** — ESLint 8 is still supported

### Testing
- **Verify:** `npm run lint` passes with zero errors
- **Verify:** `npm run compile` still passes
- **Verify:** `npm test` still passes
- **Verify:** No new lint warnings introduced that weren't there before

### Acceptance Criteria
- [ ] `@typescript-eslint/*` packages are on v8.x
- [ ] `npm run lint` runs successfully
- [ ] No regressions in build or tests
- [ ] `.eslintrc.json` is updated for compatibility

---

<a id="execution-order"></a>
## Execution Order & Dependencies

```
Phase 1 — High-Severity DOM Fixes (do together, they touch the same functions)
├── Issue #8  — Replace innerHTML with safe DOM construction
└── Issue #9  — Optimize toggleSelection

Phase 2 — Developer Experience (independent, can be done in any order)
├── Issue #22 — Add .vscode/launch.json + tasks.json
├── Issue #25 — Add JSDoc comments
└── Issue #26 — Upgrade ESLint packages

Phase 3 — Housekeeping (independent, low-risk)
├── Issue #19 — Fix repository URL
└── Issue #20 — Rename directory (do last — impacts all file paths)
```

### Dependency Notes
- **#8 and #9 must be done together** — #9's optimized `toggleSelection` depends on rows having `data-id` attributes, which is established in #8's `createRow()` refactor
- **#20 (directory rename) should be done last** — it changes the workspace root and may require reopening VS Code
- **#22, #25, #26 are fully independent** and can be parallelized

### Estimated Effort

| Issue | Estimated Time | Complexity |
|-------|---------------|------------|
| #8 — innerHTML → createElement | 30 min | Medium |
| #9 — toggleSelection optimization | 20 min | Medium |
| #19 — Repository URL | 2 min | Trivial |
| #20 — Directory rename | 10 min | Low (but disruptive) |
| #22 — launch.json | 5 min | Low |
| #25 — JSDoc comments | 45 min | Low (tedious) |
| #26 — ESLint upgrade | 30 min | Medium |
| **Total** | **~2.5 hours** | |

---

## Verification Checklist (Post-Implementation)

After all issues are resolved, run this full verification:

```bash
# 1. TypeScript compilation
npx tsc --noEmit

# 2. Linting
npm run lint

# 3. Unit tests
npm test

# 4. Full build
npm run compile

# 5. Package dry run (check for bloat)
npx vsce package --no-dependencies --dry-run

# 6. Manual smoke test
# Press F5 → Extension Host opens
# Open SF Commit Studio panel
# Select an org → metadata loads
# Toggle checkboxes → no flicker, focus retained
# Filter/sort → pagination resets correctly
# Enter commit message → commit button enables
# Check "Selected" tab → only selected items shown
```
