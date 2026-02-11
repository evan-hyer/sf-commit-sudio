// SF Commit Studio - Main Script
(function() {
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
        orgSelector: document.getElementById('org-selector'),
        userStoryRef: document.getElementById('user-story-ref'),
        commitMessage: document.getElementById('commit-message'),
        btnCommit: document.getElementById('btn-commit'),
        tabAll: document.getElementById('tab-all'),
        tabSelected: document.getElementById('tab-selected'),
        gridBody: document.getElementById('grid-body'),
        itemCount: document.getElementById('item-count'),
        selectAll: document.getElementById('select-all'),
        loadingOverlay: document.getElementById('loading-overlay'),
        errorBanner: document.getElementById('error-banner'),
        errorMessage: document.getElementById('error-message'),
        btnRetry: document.getElementById('btn-retry'),
        pageSize: document.getElementById('page-size'),
        btnPrev: document.getElementById('btn-prev'),
        btnNext: document.getElementById('btn-next'),
        pageNumbers: document.getElementById('page-numbers'),
        
        // Headers for sorting
        headers: document.querySelectorAll('.grid__header--sortable'),
        
        // Filters
        filterName: document.getElementById('filter-name'),
        filterType: document.getElementById('filter-type'),
        filterUser: document.getElementById('filter-user')
    };

    // --- Initialization ---
    // Fetch orgs first
    vscode.postMessage({ command: 'getOrgList', requestId: 'init-orgs' });

    // If we have no data, fetch it (assuming default org for now, or wait for org list)
    if (state.allMetadata.length === 0) {
       // We'll wait for the org list to trigger the first fetch
    } else {
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
        renderGrid(); // Re-render to update checkboxes
        updateUI();
    });

    // Org Selector
    dom.orgSelector.addEventListener('change', () => {
        fetchMetadata();
    });

    // Retry Button
    dom.btnRetry.addEventListener('click', () => {
        fetchMetadata();
    });

    // Refresh Button
    const btnRefresh = document.getElementById('btn-refresh');
    if (btnRefresh) {
        btnRefresh.addEventListener('click', () => fetchMetadata());
    }

    // Commit Button
    dom.btnCommit.addEventListener('click', () => {
        commitChanges();
    });
    
    // Commit Message Input (to enable button)
    dom.commitMessage.addEventListener('input', () => {
        updateUI();
    });
    
    // Shortcuts
    dom.commitMessage.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            if (!dom.btnCommit.disabled) {
                commitChanges();
            }
        }
    });

    // Global shortcuts
    window.addEventListener('keydown', (e) => {
        // Ctrl+A to select all (only if not in input)
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

        if (selectedIds.length > 50) {
            if (!confirm(`You are about to retrieve and commit ${selectedIds.length} items. Continue?`)) {
                return;
            }
        }

        showLoading(true, "Starting commit...");
        hideError();
        dom.btnCommit.disabled = true;

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

    function handleOrgList(payload) {
        const { orgs } = payload;
        dom.orgSelector.innerHTML = '';
        
        if (orgs.length === 0) {
             const option = document.createElement('option');
             option.text = "No orgs found";
             dom.orgSelector.add(option);
             return;
        }

        orgs.forEach(org => {
            const option = document.createElement('option');
            option.value = org.alias || org.username;
            option.text = org.alias ? `${org.alias} (${org.username})` : org.username;
            dom.orgSelector.add(option);
        });

        // Trigger fetch if we have orgs and no data
        if (state.allMetadata.length === 0) {
            fetchMetadata();
        }
    }

    function handleMetadataLoaded(items) {
        showLoading(false);
        state.allMetadata = items;
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
            // Success
            dom.commitMessage.value = '';
            state.selectedIds.clear();
            
            // Show a temporary success message or toast (using vscode API if available, or just an alert/banner)
            // Since we don't have a toast UI, we'll replace the loading overlay or use the error banner style but green.
            // For now, let's just refresh the data
            fetchMetadata();
            
            // Simple success indicator in error banner for now (Phase 5 can improve)
            dom.errorBanner.classList.remove('hidden');
            dom.errorBanner.style.backgroundColor = 'var(--vscode-notificationsInfoIcon-foreground)'; // Hacky color
            dom.errorBanner.style.color = 'var(--vscode-editor-background)';
            dom.errorMessage.textContent = `✓ Committed ${payload.filesCommitted} files.`;
            
            setTimeout(() => {
                dom.errorBanner.classList.add('hidden');
                 // Reset style
                dom.errorBanner.style.backgroundColor = '';
                dom.errorBanner.style.color = '';
            }, 5000);

        } else {
            // Should be handled by error handler, but just in case
            handleError({ message: 'Commit reported failure without error details.' });
        }
        updateUI();
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
        dom.tabAll.setAttribute('aria-selected', tab === 'all');
        dom.tabSelected.classList.toggle('active', tab === 'selected');
        dom.tabSelected.setAttribute('aria-selected', tab === 'selected');
        
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
            let valA = a[column];
            let valB = b[column];
            
            // Handle undefined
            if (!valA) valA = '';
            if (!valB) valB = '';

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
            const isSelected = state.selectedIds.has(item.id);
            if (isSelected) tr.classList.add('selected');

            // Toggle selection on row click
            tr.addEventListener('click', (e) => {
                // Prevent duplicate toggle if clicking directly on checkbox
                if (e.target.tagName !== 'INPUT') {
                    toggleSelection(item.id);
                }
            });

            tr.innerHTML = `
                <td><input type="checkbox" ${isSelected ? 'checked' : ''} aria-label="Select ${escapeHtml(item.componentName)}"></td>
                <td title="${escapeHtml(item.componentName)}">${escapeHtml(item.componentName)}</td>
                <td>${escapeHtml(item.type)}</td>
                <td>${escapeHtml(item.modifiedBy)}</td>
                <td>${formatDate(item.date)}</td>
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
        
        // Save state
        vscode.setState({
            ...state,
            selectedIds: Array.from(state.selectedIds) // Convert Set to Array for storage
        });
    }

    function toggleSelection(id) {
        if (state.selectedIds.has(id)) {
            state.selectedIds.delete(id);
        } else {
            state.selectedIds.add(id);
        }
        
        // If in "Selected" tab and we deselect, we need to refresh the list immediately
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

    function escapeHtml(unsafe) {
        if (!unsafe) return '';
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function formatDate(isoString) {
        if (!isoString) return '';
        const date = new Date(isoString);
        return date.toLocaleString(); // Use local format
    }
})();