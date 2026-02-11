// SF Commit Studio - Webview Main Script
(function () {
    const vscode = acquireVsCodeApi();

    // --- State ---
    let state = {
        allMetadata: [],
        filteredMetadata: [],
        selectedIds: new Set(),
        currentTab: 'all', // 'all' | 'selected'
        sort: {
            column: 'date',
            direction: 'desc' // 'asc' | 'desc'
        },
        filters: {
            name: '',
            type: '',
            user: ''
        },
        pagination: {
            currentPage: 1,
            pageSize: 25
        }
    };

    // Restore state if available
    const previousState = vscode.getState();
    if (previousState) {
        state = { ...state, ...previousState, selectedIds: new Set(previousState.selectedIds) };
    }

    // --- DOM Elements ---
    const dom = {
        orgSelector: requireElement('org-selector'),
        userStoryRef: requireElement('user-story-ref'),
        commitMessage: requireElement('commit-message'),
        btnCommit: requireElement('btn-commit'),
        btnRefresh: requireElement('btn-refresh'),
        tabAll: requireElement('tab-all'),
        tabSelected: requireElement('tab-selected'),
        gridBody: requireElement('grid-body'),
        itemCount: requireElement('item-count'),
        selectAll: requireElement('select-all'),
        loadingOverlay: requireElement('loading-overlay'),
        errorBanner: requireElement('error-banner'),
        errorMessage: requireElement('error-message'),
        successBanner: requireElement('success-banner'),
        successMessage: requireElement('success-message'),
        btnRetry: requireElement('btn-retry'),
        pageSize: requireElement('page-size'),
        btnPrev: requireElement('btn-prev'),
        btnNext: requireElement('btn-next'),
        pageNumbers: requireElement('page-numbers'),

        // Headers for sorting
        headers: document.querySelectorAll('.grid__header--sortable'),

        // Filters
        filterName: requireElement('filter-name'),
        filterType: requireElement('filter-type'),
        filterUser: requireElement('filter-user')
    };

    // --- State save debounce ---
    let _saveTimeout = null;
    function debouncedSaveState() {
        if (_saveTimeout) clearTimeout(_saveTimeout);
        _saveTimeout = setTimeout(() => {
            vscode.setState({
                ...state,
                selectedIds: Array.from(state.selectedIds)
            });
        }, 300);
    }

    // --- Initialization ---
    vscode.postMessage({ command: 'getOrgList', requestId: 'init-orgs' });

    if (state.allMetadata.length > 0) {
        updateFilteredData();
        renderGrid();
        updateUI();
    }

    // --- Event Listeners ---

    // Message Handling
    window.addEventListener('message', event => {
        const message = event.data;
        switch (message.command) {
            case 'metadataLoaded':
                handleMetadataLoaded(message.payload);
                break;
            case 'orgList':
                handleOrgList(message.payload);
                break;
            case 'error':
                handleError(message.payload);
                break;
            case 'progress':
                handleProgress(message.payload);
                break;
            case 'commitResult':
                handleCommitResult(message.payload);
                break;
        }
    });

    // Tab Switching
    dom.tabAll.addEventListener('click', () => switchTab('all'));
    dom.tabSelected.addEventListener('click', () => switchTab('selected'));

    // Sorting
    dom.headers.forEach(header => {
        header.addEventListener('click', () => {
            const column = header.dataset.sort;
            if (state.sort.column === column) {
                state.sort.direction = state.sort.direction === 'asc' ? 'desc' : 'asc';
            } else {
                state.sort.column = column;
                state.sort.direction = 'asc';
            }
            updateFilteredData();
            renderGrid();
        });
    });

    // Filtering
    dom.filterName.addEventListener('input', (e) => {
        state.filters.name = e.target.value.toLowerCase();
        state.pagination.currentPage = 1;
        updateFilteredData();
        renderGrid();
    });

    dom.filterType.addEventListener('change', (e) => {
        state.filters.type = e.target.value;
        state.pagination.currentPage = 1;
        updateFilteredData();
        renderGrid();
    });

    dom.filterUser.addEventListener('input', (e) => {
        state.filters.user = e.target.value.toLowerCase();
        state.pagination.currentPage = 1;
        updateFilteredData();
        renderGrid();
    });

    // Pagination
    dom.pageSize.addEventListener('change', (e) => {
        state.pagination.pageSize = parseInt(e.target.value);
        state.pagination.currentPage = 1;
        renderGrid();
    });

    dom.btnPrev.addEventListener('click', () => {
        if (state.pagination.currentPage > 1) {
            state.pagination.currentPage--;
            renderGrid();
        }
    });

    dom.btnNext.addEventListener('click', () => {
        const totalPages = Math.ceil(state.filteredMetadata.length / state.pagination.pageSize);
        if (state.pagination.currentPage < totalPages) {
            state.pagination.currentPage++;
            renderGrid();
        }
    });

    // Selection
    dom.selectAll.addEventListener('change', (e) => {
        const isChecked = e.target.checked;
        const visibleItems = getPageSlice();
        visibleItems.forEach(item => {
            if (isChecked) state.selectedIds.add(item.id);
            else state.selectedIds.delete(item.id);
        });
        renderGrid();
        updateUI();
    });

    // Org Selector
    dom.orgSelector.addEventListener('change', () => fetchMetadata());

    // Retry Button
    dom.btnRetry.addEventListener('click', () => fetchMetadata());

    // Refresh Button
    dom.btnRefresh.addEventListener('click', () => fetchMetadata());

    // Commit Button
    dom.btnCommit.addEventListener('click', () => commitChanges());

    // Commit Message Input (to enable button)
    dom.commitMessage.addEventListener('input', () => updateUI());

    // Keyboard Shortcut: Ctrl+Enter to commit
    dom.commitMessage.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            if (!dom.btnCommit.disabled) {
                commitChanges();
            }
        }
    });

    // Global Keyboard Shortcut: Ctrl+A to select all visible
    window.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
            const tagName = e.target.tagName.toLowerCase();
            if (tagName !== 'input' && tagName !== 'textarea') {
                e.preventDefault();
                const visibleItems = getPageSlice();
                visibleItems.forEach(item => state.selectedIds.add(item.id));
                renderGrid();
                updateUI();
            }
        }
    });


    // --- Core Logic ---

    function fetchMetadata() {
        const targetOrg = dom.orgSelector.value;
        if (!targetOrg) return;

        showLoading(true);
        hideError();
        hideSuccess();

        vscode.postMessage({
            command: 'fetchMetadata',
            payload: { targetOrg },
            requestId: 'fetch-' + Date.now()
        });
    }

    function commitChanges() {
        const targetOrg = dom.orgSelector.value;
        const message = dom.commitMessage.value;
        const userStoryRef = dom.userStoryRef.value;
        const selectedIds = Array.from(state.selectedIds);

        if (!message || selectedIds.length === 0) return;

        showLoading(true, 'Starting commit...');
        hideError();
        hideSuccess();
        dom.btnCommit.disabled = true;

        // For large commits, delegate confirmation to the Extension Host
        // which can use native VS Code dialogs (confirm() doesn't work in webviews)
        if (selectedIds.length > 50) {
            vscode.postMessage({
                command: 'confirmLargeCommit',
                payload: {
                    itemCount: selectedIds.length,
                    selectedIds,
                    message,
                    userStoryRef,
                    targetOrg
                },
                requestId: 'commit-' + Date.now()
            });
        } else {
            vscode.postMessage({
                command: 'commitChanges',
                payload: {
                    selectedIds,
                    message,
                    userStoryRef,
                    targetOrg
                },
                requestId: 'commit-' + Date.now()
            });
        }
    }

    function handleOrgList(payload) {
        const { orgs } = payload;
        dom.orgSelector.innerHTML = '';

        if (orgs.length === 0) {
            const option = document.createElement('option');
            option.text = 'No orgs found';
            dom.orgSelector.add(option);
            return;
        }

        orgs.forEach(org => {
            const option = document.createElement('option');
            option.value = org.alias || org.username;
            option.text = org.alias ? `${org.alias} (${org.username})` : org.username;
            dom.orgSelector.add(option);
        });

        // Trigger first fetch if no data loaded yet
        if (state.allMetadata.length === 0) {
            fetchMetadata();
        }
    }

    function handleMetadataLoaded(items) {
        showLoading(false);
        state.allMetadata = items;
        state.pagination.currentPage = 1; // Fix: reset page on reload
        populateTypeFilter();
        updateFilteredData();
        renderGrid();
    }

    function handleError(payload) {
        showLoading(false);
        dom.errorBanner.classList.remove('hidden');
        dom.errorMessage.textContent = payload.message;
        console.error(payload.detail);
        updateUI(); // Re-enable buttons if needed
    }

    function handleProgress(payload) {
        const { step, detail } = payload;
        showLoading(true, `${step} ${detail ? `(${detail})` : ''}`);
    }

    function handleCommitResult(payload) {
        showLoading(false);
        if (payload.success) {
            dom.commitMessage.value = '';
            state.selectedIds.clear();

            // Show success banner
            showSuccess(`✓ Committed ${payload.filesCommitted || 0} files to ${payload.branch || 'branch'} (${payload.commit || ''})`);

            // Refresh metadata after successful commit
            fetchMetadata();
        } else {
            // Cancelled or failed without a separate error
            updateUI();
        }
    }

    function populateTypeFilter() {
        const types = new Set(state.allMetadata.map(m => m.type));
        dom.filterType.innerHTML = '<option value="">All Types</option>';
        Array.from(types).sort().forEach(type => {
            const option = document.createElement('option');
            option.value = type;
            option.textContent = type;
            dom.filterType.appendChild(option);
        });
    }

    function switchTab(tab) {
        state.currentTab = tab;
        state.pagination.currentPage = 1;

        dom.tabAll.classList.toggle('active', tab === 'all');
        dom.tabAll.setAttribute('aria-selected', String(tab === 'all'));
        dom.tabSelected.classList.toggle('active', tab === 'selected');
        dom.tabSelected.setAttribute('aria-selected', String(tab === 'selected'));

        updateFilteredData();
        renderGrid();
    }

    function updateFilteredData() {
        let data = state.allMetadata;

        // 1. Filter by Tab
        if (state.currentTab === 'selected') {
            data = data.filter(item => state.selectedIds.has(item.id));
        }

        // 2. Filter by Columns
        if (state.filters.name) {
            data = data.filter(item => item.componentName.toLowerCase().includes(state.filters.name));
        }
        if (state.filters.type) {
            data = data.filter(item => item.type === state.filters.type);
        }
        if (state.filters.user) {
            data = data.filter(item => item.modifiedBy.toLowerCase().includes(state.filters.user));
        }

        // 3. Sort
        const { column, direction } = state.sort;
        data.sort((a, b) => {
            let valA = a[column] || '';
            let valB = b[column] || '';

            if (valA < valB) return direction === 'asc' ? -1 : 1;
            if (valA > valB) return direction === 'asc' ? 1 : -1;
            return 0;
        });

        state.filteredMetadata = data;

        // Update header sort icons
        dom.headers.forEach(h => {
            h.removeAttribute('data-sort-dir');
            if (h.dataset.sort === column) {
                h.setAttribute('data-sort-dir', direction);
            }
        });
    }

    function getPageSlice() {
        const start = (state.pagination.currentPage - 1) * state.pagination.pageSize;
        const end = start + state.pagination.pageSize;
        return state.filteredMetadata.slice(start, end);
    }

    function renderGrid() {
        dom.gridBody.innerHTML = '';
        const pageItems = getPageSlice();

        pageItems.forEach(item => {
            const tr = document.createElement('tr');
            tr.role = 'row';
            tr.dataset.id = item.id;
            const isSelected = state.selectedIds.has(item.id);
            if (isSelected) tr.classList.add('selected');

            // Toggle selection on row click
            tr.addEventListener('click', (e) => {
                if (e.target.tagName !== 'INPUT') {
                    toggleSelection(item.id);
                }
            });

            tr.innerHTML = `
                <td><input type="checkbox" ${isSelected ? 'checked' : ''} aria-label="Select ${escapeHtml(item.componentName)}"></td>
                <td title="${escapeHtml(item.componentName)}">${escapeHtml(item.componentName)}</td>
                <td>${escapeHtml(item.type)}</td>
                <td>${escapeHtml(item.modifiedBy)}</td>
                <td title="${escapeHtml(item.date)}">${formatDate(item.date)}</td>
                <td>${escapeHtml(item.modifiedBy)}</td>
            `;

            // Wire up checkbox explicitly
            const checkbox = tr.querySelector('input[type="checkbox"]');
            checkbox.addEventListener('change', () => toggleSelection(item.id));

            dom.gridBody.appendChild(tr);
        });

        // Update UI status
        updatePaginationUI();
        updateUI();

        // Debounced state save — avoids excessive calls on rapid interaction
        debouncedSaveState();
    }

    function toggleSelection(id) {
        if (state.selectedIds.has(id)) {
            state.selectedIds.delete(id);
        } else {
            state.selectedIds.add(id);
        }

        // If in "Selected" tab and we deselect, refresh the filtered list
        if (state.currentTab === 'selected' && !state.selectedIds.has(id)) {
            updateFilteredData();
        }

        renderGrid();
    }

    function updatePaginationUI() {
        const totalItems = state.filteredMetadata.length;
        const totalPages = Math.ceil(totalItems / state.pagination.pageSize) || 1;
        const start = (state.pagination.currentPage - 1) * state.pagination.pageSize + 1;
        const end = Math.min(start + state.pagination.pageSize - 1, totalItems);

        dom.itemCount.textContent = totalItems > 0
            ? `Showing ${start}-${end} of ${totalItems} items`
            : 'No items found';

        dom.btnPrev.disabled = state.pagination.currentPage === 1;
        dom.btnNext.disabled = state.pagination.currentPage === totalPages;
        dom.pageNumbers.textContent = `Page ${state.pagination.currentPage} of ${totalPages}`;

        // Update Select All checkbox state
        const visibleIds = getPageSlice().map(i => i.id);
        const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => state.selectedIds.has(id));
        const someVisibleSelected = visibleIds.some(id => state.selectedIds.has(id));

        dom.selectAll.checked = allVisibleSelected;
        dom.selectAll.indeterminate = someVisibleSelected && !allVisibleSelected;
    }

    function updateUI() {
        // Tab Counts
        dom.tabSelected.textContent = `Selected Metadata (${state.selectedIds.size})`;

        // Commit Button
        const hasMessage = dom.commitMessage.value.trim().length > 0;
        const hasSelection = state.selectedIds.size > 0;
        dom.btnCommit.disabled = !(hasMessage && hasSelection);
    }

    // --- Helpers ---

    /**
     * Requires a DOM element to exist, throws with a clear error if missing.
     */
    function requireElement(id) {
        const el = document.getElementById(id);
        if (!el) {
            throw new Error(`[SF Commit Studio] Required DOM element #${id} not found. Check the HTML template.`);
        }
        return el;
    }

    function showLoading(isLoading, message) {
        if (isLoading) {
            dom.loadingOverlay.classList.remove('hidden');
            if (message) {
                const span = dom.loadingOverlay.querySelector('span');
                if (span) span.textContent = message;
            }
        } else {
            dom.loadingOverlay.classList.add('hidden');
        }
    }

    function hideError() {
        dom.errorBanner.classList.add('hidden');
    }

    function showSuccess(message) {
        dom.successBanner.classList.remove('hidden');
        dom.successMessage.textContent = message;
        setTimeout(() => hideSuccess(), 5000);
    }

    function hideSuccess() {
        dom.successBanner.classList.add('hidden');
    }

    /**
     * Escapes HTML entities to prevent XSS in innerHTML.
     */
    function escapeHtml(unsafe) {
        if (!unsafe) return '';
        return unsafe
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    /**
     * Formats an ISO date string to YYYY-MM-DD HH:mm as specified in AGENTS.md.
     */
    function formatDate(isoString) {
        if (!isoString) return '';
        const d = new Date(isoString);
        if (isNaN(d.getTime())) return isoString; // Fallback for invalid dates
        const pad = n => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
})();