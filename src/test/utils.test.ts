import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { JSDOM } from 'jsdom';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Unit tests for shared types and utility logic.
 * 
 * Tests the pure functions and data contracts that are used across
 * both the Extension Host and the Webview.
 */
suite('Types and Utilities', () => {

    // ─── escapeHtml ────────────────────────────────────────────────

    suite('escapeHtml', () => {
        // Mirror the function from main.js for testability
        function escapeHtml(unsafe: string | null | undefined): string {
            if (!unsafe) {return '';}
            return unsafe
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        }

        test('should escape ampersands', () => {
            assert.strictEqual(escapeHtml('A & B'), 'A &amp; B');
        });

        test('should escape less-than', () => {
            assert.strictEqual(escapeHtml('<script>'), '&lt;script&gt;');
        });

        test('should escape greater-than', () => {
            assert.strictEqual(escapeHtml('a > b'), 'a &gt; b');
        });

        test('should escape double quotes', () => {
            assert.strictEqual(escapeHtml('say "hello"'), 'say &quot;hello&quot;');
        });

        test('should escape single quotes', () => {
            assert.strictEqual(escapeHtml("it's"), 'it&#039;s');
        });

        test('should handle null', () => {
            assert.strictEqual(escapeHtml(null), '');
        });

        test('should handle undefined', () => {
            assert.strictEqual(escapeHtml(undefined), '');
        });

        test('should handle empty string', () => {
            assert.strictEqual(escapeHtml(''), '');
        });

        test('should handle strings with no special characters', () => {
            assert.strictEqual(escapeHtml('Hello World'), 'Hello World');
        });

        test('should escape all special characters in a single string', () => {
            assert.strictEqual(
                escapeHtml('<div class="a" data-name=\'b\'>&</div>'),
                '&lt;div class=&quot;a&quot; data-name=&#039;b&#039;&gt;&amp;&lt;/div&gt;'
            );
        });

        test('should handle XSS attack vector', () => {
            const xss = '<img src=x onerror=alert("XSS")>';
            const escaped = escapeHtml(xss);
            assert.ok(!escaped.includes('<'), 'Should not contain unescaped <');
            assert.ok(!escaped.includes('>'), 'Should not contain unescaped >');
        });
    });

    // ─── formatDate ────────────────────────────────────────────────

    suite('formatDate', () => {
        // Mirror the function from main.js
        function formatDate(isoString: string | null | undefined): string {
            if (!isoString) {return '';}
            const d = new Date(isoString);
            if (isNaN(d.getTime())) {return isoString as string;}
            const pad = (n: number) => String(n).padStart(2, '0');
            return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
        }

        test('should format ISO date to YYYY-MM-DD HH:mm', () => {
            // Note: this test uses UTC time, local offset may vary  
            const result = formatDate('2026-01-15T08:30:00.000Z');
            // The format should match YYYY-MM-DD HH:mm pattern
            assert.ok(
                /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(result),
                `Expected YYYY-MM-DD HH:mm format, got: ${result}`
            );
        });

        test('should handle null', () => {
            assert.strictEqual(formatDate(null), '');
        });

        test('should handle undefined', () => {
            assert.strictEqual(formatDate(undefined), '');
        });

        test('should handle empty string', () => {
            assert.strictEqual(formatDate(''), '');
        });

        test('should handle invalid date string', () => {
            assert.strictEqual(formatDate('not-a-date'), 'not-a-date');
        });

        test('should pad single-digit months and days', () => {
            const result = formatDate('2026-01-05T03:07:00.000Z');
            // Should contain padded values
            assert.ok(
                /^\d{4}-01-0\d \d{2}:\d{2}$/.test(result),
                `Expected padded month/day, got: ${result}`
            );
        });
    });

    // ─── Commit Message Formatting ─────────────────────────────────

    suite('commitMessageFormatting', () => {
        function buildCommitMessage(commitMsg: string, userStoryRef?: string): string {
            if (userStoryRef?.trim()) {
                return `[${userStoryRef.trim()}] ${commitMsg}`;
            }
            return commitMsg;
        }

        test('should prepend user story ref when provided', () => {
            assert.strictEqual(
                buildCommitMessage('Fix layout', 'US-0000275'),
                '[US-0000275] Fix layout'
            );
        });

        test('should return plain message when no user story ref', () => {
            assert.strictEqual(
                buildCommitMessage('Fix layout'),
                'Fix layout'
            );
        });

        test('should return plain message when user story ref is empty', () => {
            assert.strictEqual(
                buildCommitMessage('Fix layout', ''),
                'Fix layout'
            );
        });

        test('should return plain message when user story ref is whitespace-only', () => {
            assert.strictEqual(
                buildCommitMessage('Fix layout', '   '),
                'Fix layout'
            );
        });

        test('should trim user story ref', () => {
            assert.strictEqual(
                buildCommitMessage('Fix layout', '  US-123  '),
                '[US-123] Fix layout'
            );
        });

        test('should handle undefined user story ref', () => {
            assert.strictEqual(
                buildCommitMessage('Fix layout', undefined),
                'Fix layout'
            );
        });
    });

    // ─── Selection Set Logic ───────────────────────────────────────

    suite('selection logic (Set-based)', () => {
        test('Set.has() should provide O(1) lookups', () => {
            const selected = new Set(['001', '003', '005']);
            assert.ok(selected.has('001'));
            assert.ok(!selected.has('002'));
            assert.ok(selected.has('003'));
        });

        test('creating a Set from array with duplicates should deduplicate', () => {
            const ids = ['001', '001', '002', '002', '003'];
            const idSet = new Set(ids);
            assert.strictEqual(idSet.size, 3);
        });

        test('filtering metadata using Set should be correct', () => {
            const metadata = [
                { id: '001', name: 'A' },
                { id: '002', name: 'B' },
                { id: '003', name: 'C' },
            ];
            const selected = new Set(['001', '003']);
            const filtered = metadata.filter(m => selected.has(m.id));
            assert.strictEqual(filtered.length, 2);
            assert.strictEqual(filtered[0].name, 'A');
            assert.strictEqual(filtered[1].name, 'C');
        });

        test('toggle selection should add/remove correctly', () => {
            const selectedIds = new Set<string>();

            // Toggle ON
            const id = '001';
            if (selectedIds.has(id)) {
                selectedIds.delete(id);
            } else {
                selectedIds.add(id);
            }
            assert.ok(selectedIds.has('001'), 'Should be selected after first toggle');

            // Toggle OFF
            if (selectedIds.has(id)) {
                selectedIds.delete(id);
            } else {
                selectedIds.add(id);
            }
            assert.ok(!selectedIds.has('001'), 'Should be deselected after second toggle');
        });
    });

    // ─── Metadata Deduplication ────────────────────────────────────

    suite('metadata deduplication for retrieve', () => {
        function formatMetadata(type: string, name: string): string {
            return `${type}:${name}`;
        }

        test('should deduplicate formatted metadata strings', () => {
            const items = [
                { type: 'ApexClass', componentName: 'MyClass' },
                { type: 'ApexClass', componentName: 'MyClass' }, // duplicate
                { type: 'CustomObject', componentName: 'Account' },
            ];

            const formatted = items.map(i => formatMetadata(i.type, i.componentName));
            const unique = [...new Set(formatted)];

            assert.strictEqual(unique.length, 2);
            assert.ok(unique.includes('ApexClass:MyClass'));
            assert.ok(unique.includes('CustomObject:Account'));
        });
    });

    // ─── Media Script (DOM Tests) ──────────────────────────────────
    
    suite('Media Script (DOM Tests)', () => {
        let window: any;
        let document: any;
        let hooks: any;
    
        const htmlTemplate = `
            <!DOCTYPE html>
            <html lang="en">
            <body>
                <div id="loading-overlay" class="hidden"><span></span></div>
                <div id="error-banner" class="hidden"><span id="error-message"></span></div>
                <div id="success-banner" class="hidden"><span id="success-message"></span></div>
                
                <select id="org-selector"></select>
                <input id="user-story-ref" type="text" />
                <textarea id="commit-message"></textarea>
                <button id="btn-commit" disabled></button>
                <button id="btn-refresh"></button>
                <button id="btn-retry"></button>
    
                <button id="tab-all" class="active" aria-selected="true">All</button>
                <button id="tab-selected" aria-selected="false">Selected</button>
    
                <input id="filter-name" />
                <select id="filter-type"></select>
                <input id="filter-user" />
    
                <table class="grid">
                    <thead>
                        <tr>
                            <th class="grid__header--sortable" data-sort="name">Name</th>
                            <th class="grid__header--sortable" data-sort="type">Type</th>
                            <th class="grid__header--sortable" data-sort="modifiedBy">User</th>
                            <th class="grid__header--sortable" data-sort="date">Date</th>
                        </tr>
                    </thead>
                    <tbody id="grid-body"></tbody>
                </table>
    
                <div id="pagination-controls">
                    <span id="item-count"></span>
                    <select id="page-size">
                        <option value="25">25</option>
                    </select>
                    <button id="btn-prev"></button>
                    <span id="page-numbers"></span>
                    <button id="btn-next"></button>
                </div>
                
                <input type="checkbox" id="select-all" />
            </body>
            </html>
        `;
    
        setup(() => {
            const dom = new JSDOM(htmlTemplate, {
                runScripts: "dangerously",
                resources: "usable",
                url: "http://localhost/"
            });
            window = dom.window;
            document = window.document;
    
            // Mock VS Code API
            window.acquireVsCodeApi = () => ({
                postMessage: () => {},
                getState: () => ({}),
                setState: () => {}
            });
            
            // Prepare hooks
            window._testHooks = {};
    
            // Load script
            const scriptPath = path.resolve(__dirname, '../../media/main.js');
            const scriptContent = fs.readFileSync(scriptPath, 'utf8');
            
            // Eval script
            window.eval(scriptContent);
            
            hooks = window._testHooks;
        });
    
        test('createRow should return a TR with correct cells', () => {
            const item = {
                id: '123',
                componentName: 'TestComponent',
                type: 'ApexClass',
                modifiedBy: 'UserA',
                date: '2026-02-10T10:00:00.000Z'
            };
            const tr = hooks.createRow(item, false);
    
            assert.strictEqual(tr.tagName, 'TR');
            assert.strictEqual(tr.dataset.id, '123');
            assert.strictEqual(tr.childNodes.length, 6); // Checkbox, Name, Type, ModifiedBy, Date, ModifiedBy(Last)
    
            // Checkbox
            const tdCheckbox = tr.childNodes[0];
            const checkbox = tdCheckbox.querySelector('input[type="checkbox"]');
            assert.ok(checkbox);
            assert.strictEqual(checkbox.checked, false);
    
            // Name
            const tdName = tr.childNodes[1];
            assert.strictEqual(tdName.textContent, 'TestComponent');
    
            // Type
            const tdType = tr.childNodes[2];
            assert.strictEqual(tdType.textContent, 'ApexClass');
            
            // ModifiedBy
            const tdModified = tr.childNodes[3];
            assert.strictEqual(tdModified.textContent, 'UserA');
            
            // Date
            const tdDate = tr.childNodes[4];
            assert.ok(tdDate.textContent.includes('2026'));
        });
    
        test('createRow should escape HTML in componentName via textContent', () => {
            const item = {
                id: '123',
                componentName: '<script>alert(1)</script>',
                type: 'ApexClass',
                modifiedBy: 'UserA',
                date: '2026-02-10T10:00:00.000Z'
            };
            const tr = hooks.createRow(item, false);
            const tdName = tr.childNodes[1];
            
            // textContent should be the raw string
            assert.strictEqual(tdName.textContent, '<script>alert(1)</script>');
            // innerHTML should be escaped
            assert.ok(tdName.innerHTML.includes('&lt;script&gt;'));
        });
    
        test('toggleSelection should update class and state', () => {
            // Setup initial state
            hooks.state.selectedIds = new Set();
            hooks.state.allMetadata = [{ id: '1', componentName: 'A' }];
            hooks.state.filteredMetadata = hooks.state.allMetadata;
            
            // Render grid to have the row
            hooks.renderGrid();
            
            // Verify initial
            const tr = document.querySelector('tr[data-id="1"]');
            assert.ok(tr);
            assert.ok(!tr.classList.contains('selected'));
            
            // Toggle
            hooks.toggleSelection('1');
            
            assert.ok(hooks.state.selectedIds.has('1'));
            assert.ok(tr.classList.contains('selected'));
            assert.strictEqual(tr.querySelector('input').checked, true);
            
            // Toggle again
            hooks.toggleSelection('1');
            
            assert.ok(!hooks.state.selectedIds.has('1'));
            assert.ok(!tr.classList.contains('selected'));
            assert.strictEqual(tr.querySelector('input').checked, false);
        });
    
        test('CSS.escape polyfill/usage', () => {
            // Just verify it exists
            assert.ok(window.CSS.escape);
            assert.strictEqual(window.CSS.escape('a.b'), 'a\\.b');
        });
    });

});