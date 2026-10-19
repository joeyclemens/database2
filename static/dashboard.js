// Global cache for item descriptions
const itemDescriptionCache = {};

// Global cache for union data with timestamp
const unionDataCache = {};
const UNION_CACHE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

function isUnionCacheStale(unionCode) {
    if (!unionDataCache[unionCode]) return true;
    const age = Date.now() - unionDataCache[unionCode].timestamp;
    return age > UNION_CACHE_EXPIRY_MS;
}

async function loadDescriptionsForItems(dbName, itemCodes) {
    // Filter to only codes not already in cache
    const codesToFetch = itemCodes.filter(code => !itemDescriptionCache[code]);
    
    if (codesToFetch.length === 0) {
        return; // All already cached
    }
    
    try {
        // Batch fetch in groups of 100 to avoid huge queries
        const batchSize = 100;
        const batches = [];
        
        for (let i = 0; i < codesToFetch.length; i += batchSize) {
            const batch = codesToFetch.slice(i, i + batchSize);
            const orConditions = batch.map(code => `ADB_Ref='${code.replace(/'/g, "''")}'`).join(' OR ');
            
            batches.push(
                fetch(`/api/execute`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        db: dbName,
                        sql: `SELECT [ADB_Ref], [Item_Description] FROM [Item_descriptions] WHERE ${orConditions}`
                    })
                })
                .then(r => r.json())
                .then(result => {
                    if (result.data) {
                        result.data.forEach(row => {
                            if (row.length >= 2) {
                                itemDescriptionCache[row[0]] = row[1];
                            }
                        });
                    }
                })
                .catch(err => console.warn('Error loading descriptions batch:', err))
            );
        }
        
        await Promise.all(batches);
    } catch (err) {
        console.warn('Failed to load descriptions:', err);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const dbName = sessionStorage.getItem('selectedDb');
    if (!dbName) {
        window.location.href = 'index.html';
        return;
    }

    document.getElementById('current-db').textContent = dbName;

    const navItems = document.querySelectorAll('.nav-item');
    const views = document.querySelectorAll('.view');
    const viewTitle = document.getElementById('view-title');
    const dbBtn = document.getElementById('btn-areas');
    const itemDescBtn = document.getElementById('btn-item-descriptions');
    const tableHead = document.getElementById('table-head');
    const tableBody = document.getElementById('table-body');
    const loader = document.getElementById('loader');
    const breadcrumbsContainer = document.getElementById('breadcrumbs');
    const shutdownOverlay = document.getElementById('shutdown-overlay');
    const shutdownClose = document.getElementById('shutdown-close');
    const shutdownMessage = document.getElementById('shutdown-message');
    const todoInput = document.getElementById('todo-input');
    const todoAddBtn = document.getElementById('todo-add-btn');
    const todoList = document.getElementById('todo-list');
    const pingValue = document.getElementById('ping-value');
    const pingTrend = document.getElementById('ping-trend');
    const pingRefreshBtn = document.getElementById('ping-refresh-btn');
    const totalItemsValue = document.getElementById('total-items-value');
    const totalItemsTrend = document.getElementById('total-items-trend');
    const activeRoomsValue = document.getElementById('active-rooms-value');
    const activeRoomsTrend = document.getElementById('active-rooms-trend');
    const sqlInput = document.getElementById('sql-input');
    const sqlRunBtn = document.getElementById('sql-run-btn');
    const sqlResult = document.getElementById('sql-result');
    const sqlDbName = document.getElementById('sql-db-name');
    const sqlTableContainer = document.getElementById('sql-table-container');
    const sqlTableHead = document.getElementById('sql-table-head');
    const sqlTableBody = document.getElementById('sql-table-body');
    const auditTableBody = document.getElementById('audit-table-body');
    const auditRefreshBtn = document.getElementById('audit-refresh-btn');

    const localTableName = document.getElementById('local-table-name');
    const localTableColumns = document.getElementById('local-table-columns');
    const localTableCsv = document.getElementById('local-table-csv');
    const localTableCreate = document.getElementById('local-table-create');
    const localTableImport = document.getElementById('local-table-import');
    const localTableFile = document.getElementById('local-table-file');
    const localTableMessage = document.getElementById('local-table-message');
    const localTableList = document.getElementById('local-table-list');
    const localTableToggle = document.getElementById('local-table-toggle');
    const localTableContent = document.getElementById('local-table-content');
    const localTableManager = document.getElementById('local-table-manager');
    const auditFilterUser = document.getElementById('audit-filter-user');
    const auditFilterTable = document.getElementById('audit-filter-table');
    const tableSearchInput = document.getElementById('table-search');
    const addRowBtn = document.getElementById('add-row-btn');
    const addModalOverlay = document.getElementById('add-modal-overlay');
    const addModalClose = document.getElementById('add-modal-close');
    const addModalCancel = document.getElementById('add-modal-cancel');
    const addModalSave = document.getElementById('add-modal-save');
    const addRowForm = document.getElementById('add-row-form');
    const chartModal = document.getElementById('chart-modal');
    const chartModalTitle = document.getElementById('chart-modal-title');
    const chartModalClose = document.getElementById('chart-modal-close');
    const expandedChartCanvas = document.getElementById('expanded-chart');

    // Add Row Modal Handlers
    if (addRowBtn) {
        addRowBtn.addEventListener('click', () => {
            openAddRowModal(currentTableName);
        });
    }

    if (addModalClose) {
        addModalClose.addEventListener('click', () => {
            closeAddRowModal();
        });
    }

    if (addModalCancel) {
        addModalCancel.addEventListener('click', () => {
            closeAddRowModal();
        });
    }

    if (addModalSave) {
        addModalSave.addEventListener('click', () => {
            submitAddRow();
        });
    }

    if (addModalOverlay) {
        // Close modal when clicking on the overlay background
        addModalOverlay.addEventListener('click', (e) => {
            if (e.target === addModalOverlay) {
                closeAddRowModal();
            }
        });
    }

    // Set SQL Runner database name
    if (sqlDbName) {
        sqlDbName.textContent = dbName;
    }

    // Ping refresh button handler
    if (pingRefreshBtn) {
        pingRefreshBtn.addEventListener('click', measureServerPing);
    }

    if (sqlRunBtn) {
        sqlRunBtn.addEventListener('click', runSqlCommand);
    }

    if (localTableCreate) {
        localTableCreate.addEventListener('click', createLocalTable);
    }

    if (localTableToggle && localTableContent) {
        localTableToggle.addEventListener('click', () => {
            localTableContent.classList.toggle('hidden');
            if (localTableManager) {
                localTableManager.classList.toggle('collapsed');
            }
            // Update arrow direction in button text
            localTableToggle.textContent = localTableContent.classList.contains('hidden')
                ? '▶ Local Tables (Temp) - for SQL Runner joins'
                : '▼ Local Tables (Temp) - for SQL Runner joins';
        });
    }

    if (localTableImport && localTableFile) {
        localTableImport.addEventListener('click', () => localTableFile.click());

        localTableFile.addEventListener('change', async (event) => {
            const file = event.target.files && event.target.files[0];
            if (!file) return;

            localTableMessage.textContent = 'Importing file...';

            try {
                const buffer = await file.arrayBuffer();
                let rows = [];
                let columns = [];

                if (file.name.endsWith('.csv')) {
                    const text = new TextDecoder('utf-8').decode(buffer);
                const lines = text.split(/\r?\n/).filter(Boolean);
                if (lines.length === 0) throw new Error('CSV file is empty');

                const sanitize = (value) => {
                    let key = value.trim().replace(/[^A-Za-z0-9_ ]/g, '_');
                    if (!key || /[^A-Za-z_ ]/.test(key.charAt(0))) {
                        key = '_' + key;
                    }
                    return key;
                };

                const head = lines[0].split(',').map(v => v.trim());
                columns = head.map(h => {
                    const safeName = sanitize(h);
                    return `[${safeName}] NVARCHAR(255)`;
                });
                rows = lines.slice(1).map(line => line.split(',').map(v => v.trim()));
                } else {
                    const workbook = XLSX.read(buffer, { type: 'array' });
                    const sheetName = workbook.SheetNames[0];
                const sheet = workbook.Sheets[sheetName];
                const json = XLSX.utils.sheet_to_json(sheet, { header: 1 });

                if (json.length < 1) throw new Error('Worksheet is empty');

                const head = json[0];
                const sanitize = (value) => {
                    let key = String(value).trim().replace(/[^A-Za-z0-9_ ]/g, '_');
                    if (!key || /[^A-Za-z_ ]/.test(key.charAt(0))) {
                        key = '_' + key;
                    }
                    return key;
                };

                columns = head.map(h => {
                    const safeName = sanitize(h);
                    return `[${safeName}] NVARCHAR(255)`;
                });

                rows = json.slice(1).map(r => head.map((_, i) => r[i] != null ? String(r[i]) : ''));
                }

                localTableName.value = file.name.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9_ ]/g, '_');
                localTableColumns.value = columns.join(', ');
                localTableCsv.value = JSON.stringify(rows); // Store as JSON string instead of CSV

                localTableMessage.textContent = `Loaded ${rows.length} rows from ${file.name}. Click Create to add to temp table.`;

            } catch (err) {
                console.error('File import failed', err);
                localTableMessage.textContent = 'Failed to import file: ' + (err.message || err);
            } finally {
                localTableFile.value = '';
            }
        });
    }

    if (auditRefreshBtn) {
        auditRefreshBtn.addEventListener('click', loadAuditLog);
    }

    if (tableSearchInput) {
        tableSearchInput.addEventListener('input', (e) => {
            currentSearchTerm = e.target.value.toLowerCase();
            applyFilters();
        });

        tableSearchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                // Optional: force stricter search or just ensure it runs (already running on input)
                currentSearchTerm = e.target.value.toLowerCase();
                applyFilters();
            }
        });
    }

    // Chart modal event listeners
    if (chartModalClose) {
        chartModalClose.addEventListener('click', closeChartModal);
    }

    if (chartModal) {
        chartModal.addEventListener('click', (e) => {
            if (e.target === chartModal) {
                closeChartModal();
            }
        });
    }

    // Keyboard support for modal
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !chartModal.classList.contains('hidden')) {
            closeChartModal();
        }
    });

    // Add click handlers to visual cards for expansion
    document.querySelectorAll('.visual-card').forEach(card => {
        card.addEventListener('click', () => expandChart(card));
    });

    // Ensure overlay stays hidden on load
    if (shutdownOverlay) shutdownOverlay.classList.add('hidden');

    // Charts
    let statusChart, categoryChart, priorityChart, categoryMixChart;
    let expandedChartInstance = null;

    // Ping interval
    let pingInterval = null;

    // Navigation State
    let currentLevel = 3; // Start at Level 3 (Hierarchy Explorer)
    let breadcrumbs = [{ label: 'Areas Level 3', table: 'Areaslevel3', filter: null }];

    // Data State
    let currentTableData = [];
    let currentTableColumns = [];
    let currentTableName = '';
    let currentPrimaryKey = '';
    // activeFilters: { colIndex: Set(selectedValues) }
    let activeFilters = {};
    let currentSearchTerm = '';

    async function measureServerPing() {
        try {
            const start = performance.now();
            const resp = await fetch('/api/databases');
            const end = performance.now();
            const ping = Math.round(end - start);

            if (pingValue) pingValue.textContent = `${ping}ms`;
            if (pingTrend) {
                if (ping < 50) {
                    pingTrend.textContent = 'Excellent latency';
                    pingTrend.className = 'trend positive';
                } else if (ping < 100) {
                    pingTrend.textContent = 'Good latency';
                    pingTrend.className = 'trend positive';
                } else if (ping < 200) {
                    pingTrend.textContent = 'Acceptable latency';
                    pingTrend.className = 'trend';
                } else {
                    pingTrend.textContent = 'High latency';
                    pingTrend.className = 'trend';
                }
            }
        } catch (error) {
            console.error('Failed to measure ping:', error);
            if (pingValue) pingValue.textContent = '—';
            if (pingTrend) pingTrend.textContent = 'Connection issue';
        }
    }

    async function updateTotalItems() {
        try {
            // Only fetch 1 row to get the total_count efficiently
            const url = `/api/table/${encodeURIComponent(dbName)}/Item_descriptions?limit=1&page=1`;

            const resp = await fetch(url);

            if (!resp.ok) {
                const errorText = await resp.text();
                console.error('Failed to fetch items:', resp.status, errorText);
                throw new Error(`Failed to fetch items: ${resp.status}`);
            }

            const result = await resp.json();
            const totalCount = result.pagination?.total || result.total || 0;

            if (totalItemsValue) {
                totalItemsValue.textContent = totalCount.toLocaleString();
            }
            if (totalItemsTrend) {
                totalItemsTrend.textContent = 'Current count';
                totalItemsTrend.className = 'trend';
            }
        } catch (error) {
            console.error('Failed to update total items:', error);
            if (totalItemsValue) totalItemsValue.textContent = '—';
            if (totalItemsTrend) {
                totalItemsTrend.textContent = 'Not available';
                totalItemsTrend.className = 'trend';
            }
        }
    }

    async function updateActiveRooms() {
        try {
            // Use server-side filtering and only fetch 1 row to get the count efficiently
            const resp = await fetch(`/api/table/${encodeURIComponent(dbName)}/Room_schedule?limit=1&page=1&filter_col=Ignore_Flag&filter_val=N`);

            if (!resp.ok) throw new Error('Failed to fetch rooms');

            const result = await resp.json();
            const activeCount = result.pagination?.total || result.total || 0;

            if (activeRoomsValue) {
                activeRoomsValue.textContent = activeCount.toLocaleString();
            }
            if (activeRoomsTrend) {
                activeRoomsTrend.textContent = 'Not ignored';
                activeRoomsTrend.className = 'trend';
            }
        } catch (error) {
            console.error('Failed to update active rooms:', error);
            if (activeRoomsValue) activeRoomsValue.textContent = '—';
            if (activeRoomsTrend) {
                activeRoomsTrend.textContent = 'Not available';
                activeRoomsTrend.className = 'trend';
            }
        }
    }

    async function runSqlCommand() {
        if (!sqlInput || !sqlResult) return;

        const sql = (sqlInput.value || '').trim();
        if (!sql) {
            sqlResult.textContent = 'Enter SQL to run.';
            return;
        }

        const lower = sql.toLowerCase();
        const isDangerous = /\bdrop\b|\btruncate\b/.test(lower);
        const isDelete = /\bdelete\b/.test(lower) && !/\bwhere\b/.test(lower);
        const isUpdateNoWhere = /\bupdate\b/.test(lower) && /\bset\b/.test(lower) && !/\bwhere\b/.test(lower);

        if (isDangerous || isDelete || isUpdateNoWhere) {
            const ok = confirm('This looks destructive (DROP/TRUNCATE or UPDATE/DELETE without WHERE). Proceed?');
            if (!ok) return;
        }

        sqlResult.textContent = 'Running...';

        try {
            const resp = await fetch('/api/execute', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ db: dbName, sql })
            });

            const result = await resp.json();

            if (!resp.ok) {
                sqlResult.textContent = result.error || 'Execution failed';
                if (sqlTableContainer) sqlTableContainer.classList.add('hidden');
                return;
            }

            // If result has columns and data, display in table
            if (result.columns && result.data && sqlTableContainer && sqlTableHead && sqlTableBody) {
                sqlTableContainer.classList.remove('hidden');

                // Populate table header
                sqlTableHead.innerHTML = '<tr>' +
                    result.columns.map(col => `<th>${col}</th>`).join('') +
                    '</tr>';

                // Populate table body
                sqlTableBody.innerHTML = result.data.map(row =>
                    '<tr>' + row.map(cell => `<td>${cell !== null ? cell : '<em>NULL</em>'}</td>`).join('') + '</tr>'
                ).join('');

                sqlResult.textContent = result.message || 'Query executed successfully';
            } else {
                // Hide table for non-SELECT queries
                if (sqlTableContainer) sqlTableContainer.classList.add('hidden');
                sqlResult.textContent = result.message || 'Query executed successfully';
            }
        } catch (err) {
            console.error('SQL execute failed', err);
            sqlResult.textContent = 'Error executing SQL';
            if (sqlTableContainer) sqlTableContainer.classList.add('hidden');
        }
    }

    async function loadLocalTables() {
        if (!localTableList) return;

        localTableList.innerHTML = '<p>Loading local tables...</p>';

        try {
            const resp = await fetch('/api/local-tables');
            const result = await resp.json();

            if (!resp.ok) {
                localTableList.innerHTML = '<p>Error loading local tables</p>';
                return;
            }

            const tables = result.tables || [];
            if (tables.length === 0) {
                localTableList.innerHTML = '<p>No local tables defined.</p>';
                return;
            }

            localTableList.innerHTML = tables.map(table => {
                return `<div class="local-table-entry">
                    <span><strong>#${table.name}</strong> (${table.rowCount} rows)</span>
                    <div style="display: flex; gap: 0.5rem; align-items: center;">
                        <button class="btn-clear" onclick="navigator.clipboard.writeText('#${table.name}')" title="Copy table name">📋</button>
                        <button class="btn-clear local-table-view" data-name="${table.name}">View</button>
                        <button class="btn-clear local-table-delete" data-name="${table.name}">Delete</button>
                    </div>
                </div>`;
            }).join('');

            localTableList.querySelectorAll('.local-table-delete').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const name = btn.getAttribute('data-name');
                    if (!name) return;
                    await deleteLocalTable(name);
                    await loadLocalTables();
                });
            });

            localTableList.querySelectorAll('.local-table-view').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const name = btn.getAttribute('data-name');
                    if (!name) return;
                    await viewLocalTable(name);
                });
            });
        } catch (err) {
            console.error('Local table fetch failed', err);
            localTableList.innerHTML = '<p>Error loading local tables</p>';
        }
    }

    async function createLocalTable() {
        if (!localTableName || !localTableColumns || !localTableCsv || !localTableMessage) return;

        const name = localTableName.value.trim();
        const columns = localTableColumns.value.trim();
        const csv = localTableCsv.value.trim();

        if (!name || !columns || !csv) {
            localTableMessage.textContent = 'Name, columns, and CSV row content are required.';
            return;
        }

        // Sanitize the table name on the frontend to match backend
        const sanitizedName = name.replace(/[^A-Za-z0-9_ ]/g, '_').replace(/^[^A-Za-z_ ]/, '_$&');

        localTableMessage.textContent = 'Saving local table...';

        let payloadRows = [];
        try {
            if (csv.trim().startsWith('[')) {
                payloadRows = JSON.parse(csv);
            }
        } catch (e) {}

        try {
            const bodyObj = { name: sanitizedName, columns };
            if (payloadRows.length > 0) {
                bodyObj.rows = payloadRows;
            } else {
                bodyObj.csv_data = csv;
            }

            const resp = await fetch('/api/local-tables', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(bodyObj)
            });

            const result = await resp.json();
            if (!resp.ok) {
                localTableMessage.textContent = result.error || 'Failed to create local table';
                return;
            }

            localTableMessage.textContent = `Local table ${result.table} created/updated.`;
            localTableName.value = '';
            localTableColumns.value = '';
            localTableCsv.value = '';

            await loadLocalTables();
        } catch (err) {
            console.error('Create local table failed', err);
            localTableMessage.textContent = 'Error creating local table';
        }
    }

    async function deleteLocalTable(name) {
        if (!name || !localTableMessage) return;

        try {
            const resp = await fetch(`/api/local-table/${encodeURIComponent(name)}`, {
                method: 'DELETE'
            });

            if (!resp.ok) {
                localTableMessage.textContent = 'Failed to delete local table.';
                return;
            }

            localTableMessage.textContent = `Local table ${name} deleted.`;
            await loadLocalTables();
        } catch (err) {
            console.error('Delete local table failed', err);
            localTableMessage.textContent = 'Error deleting local table';
        }
    }

    async function viewLocalTable(name) {
        if (!name) return;

        try {
            const resp = await fetch('/api/local-tables');
            if (!resp.ok) {
                localTableMessage && (localTableMessage.textContent = 'Failed to load local tables');
                return;
            }

            const result = await resp.json();
            const local = (result.tables || []).find(t => t.name === name);
            if (!local) {
                localTableMessage && (localTableMessage.textContent = `Local table ${name} not found`);
                return;
            }

            let modal = document.getElementById('local-table-view-modal');
            let modalBody = document.getElementById('local-table-view-body');
            let modalTitle = document.getElementById('local-table-view-title');
            if (!modal || !modalBody || !modalTitle) return;

            modalTitle.textContent = `Local table: ${name}`;
            modalBody.innerHTML = `<p>Row count: ${local.rowCount}</p><p>Columns: ${local.columns.map(c => c.name).join(', ')}</p>`;

            const tableEl = document.createElement('table');
            tableEl.className = 'data-table';
            const thead = document.createElement('thead');
            const headerRow = document.createElement('tr');

            local.columns.forEach(col => {
                const th = document.createElement('th');
                th.textContent = col.name;
                headerRow.appendChild(th);
            });
            thead.appendChild(headerRow);
            tableEl.appendChild(thead);

            const tbody = document.createElement('tbody');
            (local.rows || []).forEach(row => {
                const tr = document.createElement('tr');
                row.forEach(cell => {
                    const td = document.createElement('td');
                    td.textContent = cell || '';
                    tr.appendChild(td);
                });
                tbody.appendChild(tr);
            });

            tableEl.appendChild(tbody);
            modalBody.appendChild(tableEl);
            modal.classList.remove('hidden');
        } catch (err) {
            console.error('View local table failed', err);
            localTableMessage && (localTableMessage.textContent = 'Error viewing local table');
        }
    }

    async function loadAuditLog() {
        if (!auditTableBody) return;

        auditTableBody.innerHTML = '<tr><td colspan="11">Loading...</td></tr>';

        try {
            const params = new URLSearchParams();
            params.append('limit', '200');

            if (dbName) {
                params.append('database', dbName);
            }
            if (auditFilterUser && auditFilterUser.value.trim()) {
                params.append('username', auditFilterUser.value.trim());
            }
            if (auditFilterTable && auditFilterTable.value.trim()) {
                params.append('table_name', auditFilterTable.value.trim());
            }

            const resp = await fetch(`/api/audit-log?${params.toString()}`);
            const result = await resp.json();

            if (!resp.ok || !result.data || result.data.length === 0) {
                auditTableBody.innerHTML = '<tr><td colspan="11">No audit records found</td></tr>';
                return;
            }

            // Data columns: AuditId, Timestamp, Username, DatabaseName, TableName, Operation, 
            //               PrimaryKeyColumn, PrimaryKeyValue, ColumnName, OldValue, NewValue, SqlStatement
            auditTableBody.innerHTML = result.data.map(row => {
                const [auditId, timestamp, username, dbName, tableName, operation, pkCol, pkVal, colName, oldVal, newVal, sql] = row;

                return `
                    <tr>
                        <td title="${timestamp}">${timestamp}</td>
                        <td title="${username}">${username}</td>
                        <td title="${dbName}">${dbName}</td>
                        <td title="${tableName}">${tableName}</td>
                        <td><span class="audit-operation ${operation.toLowerCase()}">${operation}</span></td>
                        <td title="${colName || ''}">${colName || '-'}</td>
                        <td title="${oldVal || ''}">${oldVal || '-'}</td>
                        <td title="${newVal || ''}">${newVal || '-'}</td>
                    </tr>
                `;
            }).join('');

            // Initialize resizable columns after loading audit data
            setTimeout(() => initResizableColumns(), 0);
        } catch (err) {
            console.error('Failed to load audit log', err);
            auditTableBody.innerHTML = '<tr><td colspan="11">Error loading audit log</td></tr>';
        }
    }

    // Chart modal functions
    function expandChart(cardElement) {
        const title = cardElement.querySelector('h3').textContent;
        const canvas = cardElement.querySelector('canvas');
        const chartId = canvas.id;

        // Set modal title
        chartModalTitle.textContent = title;

        // Get the original chart data
        let originalChart;
        switch (chartId) {
            case 'statusChart':
                originalChart = statusChart;
                break;
            case 'categoryChart':
                originalChart = categoryChart;
                break;
            case 'priorityChart':
                originalChart = priorityChart;
                break;
            case 'categoryMixChart':
                originalChart = categoryMixChart;
                break;
            default:
                return;
        }

        if (!originalChart) return;

        // Create expanded chart with same data
        const ctx = expandedChartCanvas.getContext('2d');
        const isDark = document.body.classList.contains('dark-mode');
        const isTerminal = document.body.classList.contains('terminal-mode');

        let textColor = '#666';
        let gridColor = '#e5e5e5';

        if (isDark) {
            textColor = '#d0d0d0';
            gridColor = '#404040';
        } else if (isTerminal) {
            textColor = '#33ff33';
            gridColor = '#33ff33';
        }

        const expandedOptions = {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { usePointStyle: true, boxWidth: 8, font: { size: 12 }, color: textColor }
                }
            },
            scales: originalChart.config.type !== 'doughnut' ? {
                x: {
                    ticks: { color: textColor, font: { size: 12 } },
                    grid: { color: isTerminal ? 'rgba(51, 255, 51, 0.2)' : gridColor }
                },
                y: {
                    ticks: { color: textColor, font: { size: 12 } },
                    grid: { color: isTerminal ? 'rgba(51, 255, 51, 0.2)' : gridColor }
                }
            } : undefined
        };

        // Create the expanded chart
        expandedChartInstance = new Chart(ctx, {
            type: originalChart.config.type,
            data: originalChart.config.data,
            options: expandedOptions
        });

        // Show modal
        chartModal.classList.remove('hidden');
    }

    function closeChartModal() {
        chartModal.classList.add('hidden');
        // Destroy the expanded chart instance if it exists
        if (expandedChartInstance) {
            expandedChartInstance.destroy();
            expandedChartInstance = null;
        }
        // Clear the expanded chart canvas
        const ctx = expandedChartCanvas.getContext('2d');
        ctx.clearRect(0, 0, expandedChartCanvas.width, expandedChartCanvas.height);
    }

    function initCharts() {
        const ctxStat = document.getElementById('statusChart').getContext('2d');
        const ctxCat = document.getElementById('categoryChart').getContext('2d');
        const ctxPrio = document.getElementById('priorityChart').getContext('2d');
        const ctxCatMix = document.getElementById('categoryMixChart').getContext('2d');

        if (statusChart) statusChart.destroy();
        if (categoryChart) categoryChart.destroy();
        if (priorityChart) priorityChart.destroy();
        if (categoryMixChart) categoryMixChart.destroy();

        const isDark = document.body.classList.contains('dark-mode');
        const isTerminal = document.body.classList.contains('terminal-mode');

        // Initial colors
        let textColor = '#666';
        let gridColor = '#e5e5e5';

        if (isDark) {
            textColor = '#d0d0d0';
            gridColor = '#404040';
        } else if (isTerminal) {
            textColor = '#33ff33';
            gridColor = '#33ff33';
        }

        const commonOptions = {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { usePointStyle: true, boxWidth: 6, font: { size: 10 }, color: textColor }
                }
            },
            scales: {
                x: {
                    ticks: { color: textColor },
                    grid: { color: isTerminal ? 'rgba(51, 255, 51, 0.2)' : gridColor }
                },
                y: {
                    ticks: { color: textColor },
                    grid: { color: isTerminal ? 'rgba(51, 255, 51, 0.2)' : gridColor }
                }
            }
        };

        // To Do List Status - fetch real data (async, won't block)
        updateTodoChart(ctxStat, commonOptions);

        // Department Area (sqm) - fetch real data (async, won't block)
        updateDepartmentChart(ctxCat, commonOptions);

        // Equipment Group Mix - fetch real data (async, won't block)
        updateEquipmentChart(ctxPrio, commonOptions);

        // Equipment Category Mix - fetch real data (async, won't block)
        updateCategoryMixChart(ctxCatMix, commonOptions);
    }

    async function updateTodoChart(ctx, commonOptions) {
        try {
            const resp = await fetch(`/api/table/${encodeURIComponent(dbName)}/ToDo`);
            if (!resp.ok) throw new Error('Failed to fetch todos');

            const result = await resp.json();
            const todos = result.data || [];

            let completed = 0;
            let notCompleted = 0;

            todos.forEach(row => {
                const isCompleted = row[2] === 1 || row[2] === '1' || row[2] === true;
                if (isCompleted) {
                    completed++;
                } else {
                    notCompleted++;
                }
            });

            statusChart = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: ['Done', 'Not Done'],
                    datasets: [{
                        data: [completed, notCompleted],
                        backgroundColor: ['#34c759', '#ff3b30'],
                        borderWidth: 0,
                        cutout: '70%'
                    }]
                },
                options: commonOptions
            });
        } catch (error) {
            console.error('Failed to update todo chart:', error);
            // Fall back to placeholder
            statusChart = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: ['Done', 'Not Done'],
                    datasets: [{
                        data: [0, 0],
                        backgroundColor: ['#34c759', '#ff3b30'],
                        borderWidth: 0,
                        cutout: '70%'
                    }]
                },
                options: commonOptions
            });
        }
    }

    async function updateDepartmentChart(ctx, commonOptions) {
        try {
            const resp = await fetch(`/api/table/${encodeURIComponent(dbName)}/Areaslevel2`);
            if (!resp.ok) throw new Error('Failed to fetch departments');

            const result = await resp.json();
            const departments = result.data || [];

            const labels = [];
            const data = [];

            departments.forEach(row => {
                // row[0] = ArealevelID, row[1] = ParentArea, row[2] = AreaDescription, row[3] = TotalArea
                const deptName = row[2] || `Dept ${row[0]}`;
                const totalArea = parseFloat(row[3]) || 0;
                labels.push(deptName);
                data.push(totalArea);
            });

            categoryChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels.length > 0 ? labels : ['No Data'],
                    datasets: [{
                        label: 'sqm',
                        data: data.length > 0 ? data : [0],
                        backgroundColor: '#0071e3',
                        borderRadius: 4
                    }]
                },
                options: {
                    ...commonOptions,
                    plugins: { legend: { display: false } },
                    scales: {
                        x: { grid: { display: false }, ticks: { font: { size: 8 } } },
                        y: { grid: { color: '#f5f5f7' }, ticks: { font: { size: 8 } } }
                    }
                }
            });
        } catch (error) {
            console.error('Failed to update department chart:', error);
            // Fall back to placeholder
            categoryChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: ['No Data'],
                    datasets: [{
                        label: 'sqm',
                        data: [0],
                        backgroundColor: '#0071e3',
                        borderRadius: 4
                    }]
                },
                options: {
                    ...commonOptions,
                    plugins: { legend: { display: false } },
                    scales: {
                        x: { grid: { display: false }, ticks: { font: { size: 8 } } },
                        y: { grid: { color: '#f5f5f7' }, ticks: { font: { size: 8 } } }
                    }
                }
            });
        }
    }

    async function updateEquipmentChart(ctx, commonOptions) {
        try {
            const resp = await fetch(`/api/table/${encodeURIComponent(dbName)}/ERM`);
            if (!resp.ok) throw new Error('Failed to fetch equipment data');

            const result = await resp.json();
            const items = result.data || [];
            const columns = result.columns || [];

            // Find the "Group" column index
            const groupColIndex = columns.findIndex(col => col.toLowerCase() === 'group');
            if (groupColIndex === -1) {
                throw new Error('Group column not found in ERM table');
            }

            const groupCounts = {};
            const colors = ['#ff3b30', '#ff9500', '#34c759', '#0071e3', '#5856d6', '#ff2d55', '#a2845c', '#00c7be'];

            items.forEach(row => {
                const groupValue = row[groupColIndex];
                if (groupValue !== null && groupValue !== undefined && groupValue !== '') {
                    const groupLabel = `Group ${groupValue}`;
                    groupCounts[groupLabel] = (groupCounts[groupLabel] || 0) + 1;
                }
            });

            const labels = Object.keys(groupCounts).sort();
            const data = labels.map(label => groupCounts[label]);
            const backgroundColor = labels.map((_, i) => colors[i % colors.length]);

            priorityChart = new Chart(ctx, {
                type: 'pie',
                data: {
                    labels: labels.length > 0 ? labels : ['No Data'],
                    datasets: [{
                        data: data.length > 0 ? data : [0],
                        backgroundColor: backgroundColor.length > 0 ? backgroundColor : ['#f5f5f7'],
                        borderWidth: 0
                    }]
                },
                options: commonOptions
            });
        } catch (error) {
            console.error('Failed to update equipment chart:', error);
            // Fall back to placeholder
            priorityChart = new Chart(ctx, {
                type: 'pie',
                data: {
                    labels: ['No Data'],
                    datasets: [{
                        data: [0],
                        backgroundColor: ['#f5f5f7'],
                        borderWidth: 0
                    }]
                },
                options: commonOptions
            });
        }
    }

    async function updateCategoryMixChart(ctx, commonOptions) {
        try {
            const resp = await fetch(`/api/table/${encodeURIComponent(dbName)}/ERM`);
            if (!resp.ok) throw new Error('Failed to fetch equipment data');

            const result = await resp.json();
            const items = result.data || [];
            const columns = result.columns || [];

            // Find the "Cat" column index
            const catColIndex = columns.findIndex(col => col.toLowerCase() === 'cat');
            if (catColIndex === -1) {
                throw new Error('Cat column not found in ERM table');
            }

            const catCounts = {};
            const colors = ['#ff3b30', '#ff9500', '#34c759', '#0071e3', '#5856d6', '#ff2d55', '#a2845c', '#00c7be'];

            items.forEach(row => {
                const catValue = row[catColIndex];
                if (catValue !== null && catValue !== undefined && catValue !== '') {
                    const catLabel = `Cat ${catValue}`;
                    catCounts[catLabel] = (catCounts[catLabel] || 0) + 1;
                }
            });

            const labels = Object.keys(catCounts).sort();
            const data = labels.map(label => catCounts[label]);
            const backgroundColor = labels.map((_, i) => colors[i % colors.length]);

            categoryMixChart = new Chart(ctx, {
                type: 'pie',
                data: {
                    labels: labels.length > 0 ? labels : ['No Data'],
                    datasets: [{
                        data: data.length > 0 ? data : [0],
                        backgroundColor: backgroundColor.length > 0 ? backgroundColor : ['#f5f5f7'],
                        borderWidth: 0
                    }]
                },
                options: commonOptions
            });
        } catch (error) {
            console.error('Failed to update category mix chart:', error);
            // Fall back to placeholder
            categoryMixChart = new Chart(ctx, {
                type: 'pie',
                data: {
                    labels: ['No Data'],
                    datasets: [{
                        data: [0],
                        backgroundColor: ['#f5f5f7'],
                        borderWidth: 0
                    }]
                },
                options: commonOptions
            });
        }
    }

    // Close dropdowns when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.th-content') && !e.target.closest('.filter-dropdown')) {
            document.querySelectorAll('.filter-dropdown').forEach(el => el.remove());
        }
    });

    async function fetchTableData(tableName, filter = null) {
        loader.classList.remove('hidden');
        tableHead.innerHTML = '';
        tableBody.innerHTML = '';

        activeFilters = {}; // Reset filters on new table load
        currentSearchTerm = '';
        if (tableSearchInput) tableSearchInput.value = '';
        if (addRowBtn) {
            const tn = tableName.toLowerCase();
            // Allow add rows for Item_Schedule and Item_descriptions
            if (tn === 'item_schedule' || tn === 'item_descriptions') {
                addRowBtn.style.display = 'inline-block';
            } else {
                addRowBtn.style.display = 'none';
            }
        }

        const CHUNK_SIZE = 10000;
        let offset = 0;
        let allData = [];
        let fetchedColumns = [];

        // Show loading state
        tableBody.innerHTML = '<tr><td colspan="100%" class="text-center">Loading...</td></tr>';

        try {
            while (true) {
                // Update loading text if we have some data
                if (offset > 0) {
                    // Find the loading cell if it exists, otherwise just log (or could update a status element)
                    const loadingCell = tableBody.querySelector('td');
                    if (loadingCell) loadingCell.textContent = `Loading... (${offset} rows fetched)`;
                }

                const url = `/api/table/${encodeURIComponent(dbName)}/${encodeURIComponent(tableName)}?limit=${CHUNK_SIZE}&page=${(offset / CHUNK_SIZE) + 1}` +
                    (filter ? `&filter_col=${encodeURIComponent(filter.col)}&filter_val=${encodeURIComponent(filter.val)}` : '');

                const response = await fetch(url);

                if (!response.ok) {
                    const text = await response.text();
                    throw new Error(`Server error (${response.status}): ${text}`);
                }

                const result = await response.json();
                const { columns, data } = result;

                if (offset === 0) {
                    fetchedColumns = columns;
                }

                if (data.length === 0) {
                    break;
                }

                allData = allData.concat(data);
                offset += data.length;

                // If we got less than requested, we are done
                if (data.length < CHUNK_SIZE) {
                    break;
                }
            }

            // For Item_descriptions, limit and order columns
            if (tableName === 'Item_descriptions') {
                const desired = ['ADB_Ref', 'Item_Description', 'Unit_Cost', 'Cost_Date'];
                const available = desired.filter(col => fetchedColumns.includes(col));
                const indices = available.map(col => fetchedColumns.indexOf(col));

                allData = allData.map(row => indices.map(i => row[i]));
                fetchedColumns = available;
            }

            currentTableData = allData;
            currentTableColumns = fetchedColumns;
            currentTableName = tableName;

            // Clear loading message
            tableBody.innerHTML = '';

            if (fetchedColumns && fetchedColumns.length > 0) {
                console.log("Fetched columns:", fetchedColumns);

                // Add "Explore" column if we can drill down
                const canDrillDown = tableName === 'Areaslevel3' || tableName === 'Areaslevel2' || tableName === 'Areaslevel1' || tableName === 'Room_schedule';

                // Create Header Row
                const headerRow = document.createElement('tr');
                console.log("Created Header Row");

                // Action Header - Always add if we have data (for Delete button)
                const th = document.createElement('th');
                th.textContent = 'Action';
                headerRow.appendChild(th);

                // Data Headers with Filters
                fetchedColumns.forEach((col, index) => {
                    // Skip instance_variant column (hidden PK column)
                    if (col === 'instance_variant') {
                        return;
                    }

                    const th = document.createElement('th');

                    const container = document.createElement('div');
                    container.className = 'th-content';

                    const text = document.createElement('span');
                    text.textContent = col;

                    const icon = document.createElement('span');
                    icon.className = 'filter-icon';
                    icon.innerHTML = '&#9662;'; // Down arrow

                    icon.onclick = (e) => {
                        e.stopPropagation();
                        toggleFilterMenu(index, icon);
                    };

                    container.appendChild(text);
                    container.appendChild(icon);
                    th.appendChild(container);

                    headerRow.appendChild(th);
                });

                console.log("Header Row Children Count:", headerRow.children.length);
                tableHead.innerHTML = ''; // Explicitly clear again to be super sure
                tableHead.appendChild(headerRow);
                renderTableRows(allData, tableName);
            } else {
                tableBody.innerHTML = '<tr><td colspan="100%">No data found</td></tr>';
            }
        } catch (error) {
            console.error(error);
            tableBody.innerHTML = `<tr><td colspan="100%" style="color:red">Error: ${error.message}</td></tr>`;
        } finally {
            loader.classList.add('hidden');
        }
    }

    function toggleFilterMenu(colIndex, iconElement) {
        // Close existing
        document.querySelectorAll('.filter-dropdown').forEach(el => el.remove());

        const th = iconElement.closest('th');
        const dropdown = document.createElement('div');
        dropdown.className = 'filter-dropdown';

        // 1. Search Input
        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.className = 'filter-search';
        searchInput.placeholder = 'Search...';

        // 2. Top Actions (Select All / Clear)
        const topActions = document.createElement('div');
        topActions.className = 'filter-actions-top';

        const selectAllLink = document.createElement('a');
        selectAllLink.className = 'filter-link';
        selectAllLink.textContent = 'Select All';

        const clearAllLink = document.createElement('a');
        clearAllLink.className = 'filter-link';
        clearAllLink.textContent = 'Deselect All';

        topActions.appendChild(selectAllLink);
        topActions.appendChild(clearAllLink);

        // Get unique values
        const uniqueValues = [...new Set(currentTableData.map(row => row[colIndex]))].sort();
        const optionsContainer = document.createElement('div');
        optionsContainer.className = 'filter-options';

        const isFiltered = activeFilters[colIndex] !== undefined;
        const checkedValues = isFiltered ? activeFilters[colIndex] : new Set(uniqueValues);

        // Render Options
        uniqueValues.forEach(val => {
            const label = document.createElement('label');
            label.className = 'filter-option';
            label.dataset.value = val; // Store for search filtering

            const valStr = (val === null || val === undefined) ? '' : String(val);

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = valStr; // value is always string in DOM
            checkbox.checked = checkedValues.has(valStr);

            label.appendChild(checkbox);
            label.appendChild(document.createTextNode(valStr || '(Blanks)'));

            optionsContainer.appendChild(label);
        });

        // Search Logic
        searchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            const options = optionsContainer.querySelectorAll('.filter-option');
            options.forEach(opt => {
                const text = opt.innerText.toLowerCase();
                if (text.includes(term)) {
                    opt.style.display = 'flex';
                } else {
                    opt.style.display = 'none';
                }
            });
        });

        // Select All Logic (Only visible)
        selectAllLink.onclick = (e) => {
            e.preventDefault();
            const visibleCheckboxes = Array.from(optionsContainer.querySelectorAll('.filter-option'))
                .filter(opt => opt.style.display !== 'none')
                .map(opt => opt.querySelector('input'));

            visibleCheckboxes.forEach(cb => cb.checked = true);
        };

        // Clear All Logic (Only visible)
        clearAllLink.onclick = (e) => {
            e.preventDefault();
            const visibleCheckboxes = Array.from(optionsContainer.querySelectorAll('.filter-option'))
                .filter(opt => opt.style.display !== 'none')
                .map(opt => opt.querySelector('input'));

            visibleCheckboxes.forEach(cb => cb.checked = false);
        };

        const actions = document.createElement('div');
        actions.className = 'filter-actions';

        const applyBtn = document.createElement('button');
        applyBtn.className = 'btn-apply';
        applyBtn.textContent = 'Apply';
        applyBtn.onclick = () => {
            // Gather checked
            const checked = new Set();

            // Only consider currently visible options so typing + apply behaves as expected
            optionsContainer.querySelectorAll('.filter-option').forEach(opt => {
                if (opt.style.display === 'none') return;
                const cb = opt.querySelector('input[type="checkbox"]');
                if (cb && cb.checked) checked.add(cb.value);
            });

            // Normalize uniqueValues to strings for comparison
            const uniqueValuesStr = uniqueValues.map(v => (v === null || v === undefined) ? '' : String(v));

            // If all checked (of total unique), remove filter
            if (checked.size === uniqueValuesStr.length) {
                delete activeFilters[colIndex];
                iconElement.classList.remove('active');
            } else {
                activeFilters[colIndex] = checked;
                iconElement.classList.add('active');
            }

            applyFilters();
            dropdown.remove();
        };

        const clearBtn = document.createElement('button');
        clearBtn.className = 'btn-clear';
        // "Clear Filter" implies resetting this specific column to allow all
        clearBtn.textContent = 'Clear Filter';
        clearBtn.onclick = () => {
            delete activeFilters[colIndex];
            iconElement.classList.remove('active');
            applyFilters();
            dropdown.remove();
        };

        actions.appendChild(clearBtn);
        actions.appendChild(applyBtn);

        dropdown.appendChild(searchInput);
        dropdown.appendChild(topActions);
        dropdown.appendChild(optionsContainer);
        dropdown.appendChild(actions);
        th.querySelector('.th-content').appendChild(dropdown);

        // Focus search
        searchInput.focus();
    }

    function applyFilters() {
        const filteredData = currentTableData.filter(row => {
            // MUST match ALL active filters
            for (const [colIndex, activeSet] of Object.entries(activeFilters)) {
                // colIndex is string key, convert if needed but array access works with strings too
                const cellValue = row[colIndex];
                // Normalize data value to string to match checkbox values
                const cellStr = (cellValue === null || cellValue === undefined) ? '' : String(cellValue);

                if (!activeSet.has(cellStr)) return false;
            }

            // Global Search Filter
            if (currentSearchTerm) {
                const rowStr = row.join(' ').toLowerCase();
                if (!rowStr.includes(currentSearchTerm)) return false;
            }

            return true;
        });
        renderTableRows(filteredData, currentTableName);
    }

    function renderTableRows(data, tableName) {
        tableBody.innerHTML = '';

        // Check if drill down is possible, but we always show Action column for Delete
        const canDrillDown = tableName === 'Areaslevel3' || tableName === 'Areaslevel2' || tableName === 'Areaslevel1' || tableName === 'Room_schedule';

        if (data.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="100%">No matches found</td></tr>';
            return;
        }

        // Fetch table info to get the actual primary key
        fetchTableInfo(tableName).then(tableInfo => {
            const primaryKeyColName = tableInfo?.primaryKey || 'ID';

            data.forEach((row, rowIndex) => {
                const tr = document.createElement('tr');
                tr.dataset.rowIndex = rowIndex;
                tr.dataset.tableName = tableName;
                tr.dataset.primaryKeyCol = primaryKeyColName;

                // Handle composite primary keys (comma-separated)
                const pkColumns = primaryKeyColName.split(',').map(col => col.trim());
                let pkValues = {};

                if (pkColumns.length > 1) {
                    // Composite key - find all PK column values
                    pkColumns.forEach(pkCol => {
                        const pkIdx = currentTableColumns.indexOf(pkCol);
                        if (pkIdx >= 0) {
                            pkValues[pkCol] = row[pkIdx];
                        }
                    });
                } else {
                    // Single primary key
                    const pkColIndex = currentTableColumns.indexOf(primaryKeyColName);
                    const pkValue = pkColIndex >= 0 ? row[pkColIndex] : row[0];
                    pkValues[primaryKeyColName] = pkValue;
                }

                if (true) { // Always add action column
                    const td = document.createElement('td');
                    td.style.whiteSpace = 'nowrap';

                    if (canDrillDown) {
                        const btn = document.createElement('button');
                        btn.className = 'explore-btn';
                        btn.textContent = 'Explore';
                        btn.style.marginRight = '0.5rem';

                        // ID is usually the first column, but for Room_schedule filtering we need Room_Code (index 4)
                        let filterVal = row[0];
                        if (tableName === 'Room_schedule') {
                            filterVal = row[4]; // Room_Code
                        }

                        const desc = row[2] || row[1]; // AreaDescription or Project_Room_Description

                        btn.onclick = () => {
                            if (tableName === 'Areaslevel3') {
                                drillDown('Areaslevel2', 'ParentArea', filterVal, desc);
                            } else if (tableName === 'Areaslevel2') {
                                drillDown('Areaslevel1', 'ParentArea', filterVal, desc);
                            } else if (tableName === 'Areaslevel1') {
                                drillDown('Room_schedule', 'ParentArea', filterVal, desc);
                            } else if (tableName === 'Room_schedule') {
                                drillDown('item_schedule', 'Room_Code', filterVal, desc);
                            }
                        };
                        td.appendChild(btn);
                    }

                    if (tableName === 'Item_descriptions') {
                        const adbIndex = currentTableColumns.findIndex(c => c.toLowerCase() === 'adb_ref');
                        const itemRef = adbIndex >= 0 ? (row[adbIndex] || '') : (row[0] || '');
                        if (String(itemRef).includes('-')) {
                            const unionBtn = document.createElement('button');
                            unionBtn.className = 'explore-btn union-toggle-btn';
                            unionBtn.style.marginRight = '0.5rem';
                            unionBtn.textContent = '➕';
                            unionBtn.title = 'Expand union members';

                            unionBtn.onclick = async (e) => {
                                e.stopPropagation();
                                await toggleUnionRow(tr, itemRef, unionBtn);
                            };

                            td.appendChild(unionBtn);
                        }
                    }

                    // Delete Button
                    const deleteBtn = document.createElement('button');
                    deleteBtn.className = 'explore-btn'; // Reuse style or new class
                    deleteBtn.style.color = '#ff3b30';
                    deleteBtn.style.borderColor = '#ff3b30';
                    deleteBtn.textContent = '🗑️';
                    deleteBtn.title = 'Delete Row';
                    deleteBtn.onclick = () => deleteRow(tableName, pkValues, tr);

                    deleteBtn.onmouseover = () => { deleteBtn.style.backgroundColor = '#ff3b30'; deleteBtn.style.color = 'white'; };
                    deleteBtn.onmouseout = () => { deleteBtn.style.backgroundColor = 'transparent'; deleteBtn.style.color = '#ff3b30'; };

                    td.appendChild(deleteBtn);
                    tr.appendChild(td);
                }

                row.forEach((cell, cellIndex) => {
                    const columnName = currentTableColumns[cellIndex];

                    // Hide instance_variant column (it's a PK but shouldn't be displayed)
                    if (columnName === 'instance_variant') {
                        return; // Skip rendering this column
                    }

                    const td = document.createElement('td');
                    td.dataset.rawValue = cell;
                    td.dataset.cellIndex = cellIndex;
                    td.dataset.pkColName = primaryKeyColName;
                    td.dataset.pkValues = JSON.stringify(pkValues); // Store all PK values as JSON

                    if (tableName === 'Item_descriptions' && columnName === 'ADB_Ref' && String(cell).includes('-')) {
                        const unionBtn = document.createElement('button');
                        unionBtn.className = 'explore-btn union-toggle-btn';
                        unionBtn.style.marginRight = '0.4rem';
                        unionBtn.title = 'Expand union members';
                        unionBtn.textContent = tr.dataset.unionExpanded === 'true' ? '➖' : '➕';

                        unionBtn.onclick = async (e) => {
                            e.stopPropagation();
                            await toggleUnionRow(tr, String(cell), unionBtn);
                        };

                        const span = document.createElement('span');
                        span.textContent = String(cell);

                        td.appendChild(unionBtn);
                        td.appendChild(span);
                    } else {
                        td.textContent = formatCellValue(tableName, columnName, cell);
                    }

                    // Make editable if not a primary key column
                    const isReadOnly = pkColumns.includes(currentTableColumns[cellIndex]);
                    if (!isReadOnly) {
                        td.style.cursor = 'pointer';
                        td.title = 'Click to edit';
                        td.addEventListener('click', (e) => {
                            if (e.target === td && !td.classList.contains('editing')) {
                                makeEditable(td, row, rowIndex, tableName, cellIndex, primaryKeyColName, currentTableColumns);
                            }
                        });
                    }

                    tr.appendChild(td);
                });
                tableBody.appendChild(tr);
            });

            // Note: appendGhostRow function was referenced but not defined - removed
        }).catch(err => {
            console.warn('Could not fetch table info, rendering with default PK detection:', err);
            renderTableRowsWithDefaultPK(data, tableName);
        });
    }

    async function toggleUnionRow(tr, unionCode, button) {
        if (!tr || !unionCode) return;

        const dbName = sessionStorage.getItem('selectedDb');
        if (!dbName) return;

        const expanded = tr.dataset.unionExpanded === 'true';
        if (expanded) {
            collapseUnionRows(tr);
            button.textContent = '➕';
            tr.dataset.unionExpanded = 'false';
            return;
        }

        button.disabled = true;
        button.textContent = '⏳';

        try {
            const members = await fetchUnionMembers(dbName, unionCode);

            collapseUnionRows(tr); // ensure not duplicated

            if (!members || members.length === 0) {
                const msgRow = document.createElement('tr');
                msgRow.className = 'union-child-row';
                msgRow.dataset.parentRowIndex = tr.dataset.rowIndex;

                const msgCell = document.createElement('td');
                msgCell.colSpan = currentTableColumns.length + 1;
                msgCell.textContent = 'No union members found.';
                msgCell.style.fontStyle = 'italic';
                msgRow.appendChild(msgCell);

                tr.insertAdjacentElement('afterend', msgRow);
                button.textContent = '➖';
                tr.dataset.unionExpanded = 'true';
                return;
            }

            let insertAfter = tr;
            const maxFields = currentTableColumns.length;

            members.forEach(member => {
                const child = document.createElement('tr');
                child.className = 'union-child-row';
                child.dataset.parentRowIndex = tr.dataset.rowIndex;

                // empty action cell for alignment
                const actionCell = document.createElement('td');
                actionCell.textContent = '';
                child.appendChild(actionCell);

                const cells = [
                    member.itemCode || '',
                    member.description || member.type || '',
                    member.qtyNew || '',
                    member.qtyTrans || ''
                ];

                for (let i = 0; i < maxFields; i++) {
                    const cell = document.createElement('td');
                    cell.textContent = cells[i] != null ? cells[i] : '';
                    child.appendChild(cell);
                }

                insertAfter.insertAdjacentElement('afterend', child);
                insertAfter = child;
            });

            button.textContent = '➖';
            tr.dataset.unionExpanded = 'true';
        } catch (err) {
            console.error('Failed to expand union', unionCode, err);
            alert(`Failed to load union members: ${err.message || err}`);
            button.textContent = '➕';
            tr.dataset.unionExpanded = 'false';
        } finally {
            button.disabled = false;
        }
    }

    function collapseUnionRows(tr) {
        if (!tr) return;
        const rowIndex = tr.dataset.rowIndex;
        if (!rowIndex) return;

        const childRows = Array.from(tableBody.querySelectorAll(`tr[data-parent-row-index="${rowIndex}"]`));
        childRows.forEach(r => r.remove());
    }

    async function fetchUnionMembers(dbName, unionCode) {
        const response = await fetch(`/api/table/${encodeURIComponent(dbName)}/Unions?limit=1000&filter_col=Union_Code&filter_val=${encodeURIComponent(unionCode)}`);
        if (!response.ok) {
            throw new Error(`Union fetch failed: ${response.status}`);
        }

        const result = await response.json();
        const rows = result.data || [];
        const unionCols = result.columns || [];

        const itemCodeIdx = unionCols.indexOf('Item_Code');
        const typeIdx = unionCols.indexOf('Type');
        const qtyNewIdx = unionCols.indexOf('Qty_New');
        const qtyTransIdx = unionCols.indexOf('Qty_Trans');

        const codes = [...new Set(rows.map(r => (itemCodeIdx >= 0 ? r[itemCodeIdx] : '')).filter(r => r))];
        if (codes.length) {
            await loadDescriptionsForItems(dbName, codes);
        }

        return rows.map(r => ({
            itemCode: itemCodeIdx >= 0 ? r[itemCodeIdx] : '',
            type: typeIdx >= 0 ? r[typeIdx] : '',
            qtyNew: qtyNewIdx >= 0 ? r[qtyNewIdx] : '',
            qtyTrans: qtyTransIdx >= 0 ? r[qtyTransIdx] : '',
            description: (itemCodeIdx >= 0 ? itemDescriptionCache[r[itemCodeIdx] || ''] : '') || ''
        }));
    }

    function renderTableRowsWithDefaultPK(data, tableName) {
        tableBody.innerHTML = '';
        const canDrillDown = tableName === 'Areaslevel3' || tableName === 'Areaslevel2' || tableName === 'Areaslevel1' || tableName === 'Room_schedule';

        data.forEach((row, rowIndex) => {
            const tr = document.createElement('tr');
            tr.dataset.rowIndex = rowIndex;
            tr.dataset.tableName = tableName;

            // Always add action column for consistency with header
            const actionTd = document.createElement('td');
            actionTd.style.whiteSpace = 'nowrap';

            if (canDrillDown) {
                const btn = document.createElement('button');
                btn.className = 'explore-btn';
                btn.textContent = 'Explore';

                let filterVal = row[0];
                if (tableName === 'Room_schedule') {
                    filterVal = row[4];
                }

                const desc = row[2] || row[1];

                btn.onclick = () => {
                    if (tableName === 'Areaslevel3') {
                        drillDown('Areaslevel2', 'ParentArea', filterVal, desc);
                    } else if (tableName === 'Areaslevel2') {
                        drillDown('Areaslevel1', 'ParentArea', filterVal, desc);
                    } else if (tableName === 'Areaslevel1') {
                        drillDown('Room_schedule', 'ParentArea', filterVal, desc);
                    } else if (tableName === 'Room_schedule') {
                        drillDown('item_schedule', 'Room_Code', filterVal, desc);
                    }
                };
                actionTd.appendChild(btn);
            }

            if (tableName === 'Item_descriptions') {
                const adbIndex = currentTableColumns.findIndex(c => c.toLowerCase() === 'adb_ref');
                const itemRef = adbIndex >= 0 ? (row[adbIndex] || '') : (row[0] || '');
                if (String(itemRef).includes('-')) {
                    const unionBtn = document.createElement('button');
                    unionBtn.className = 'explore-btn union-toggle-btn';
                    unionBtn.style.marginRight = '0.5rem';
                    unionBtn.textContent = '➕';
                    unionBtn.title = 'Expand union members';

                    unionBtn.onclick = async (e) => {
                        e.stopPropagation();
                        await toggleUnionRow(tr, itemRef, unionBtn);
                    };

                    actionTd.appendChild(unionBtn);
                }
            }

            // Add delete button for all tables
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'explore-btn';
            deleteBtn.style.color = '#ff3b30';
            deleteBtn.style.borderColor = '#ff3b30';
            deleteBtn.textContent = '🗑️';
            deleteBtn.title = 'Delete Row';
            deleteBtn.onclick = () => {
                // Simple fallback: use first column as ID
                const pkValues = { 'ID': row[0] };
                deleteRow(tableName, pkValues, tr);
            };
            deleteBtn.onmouseover = () => { deleteBtn.style.backgroundColor = '#ff3b30'; deleteBtn.style.color = 'white'; };
            deleteBtn.onmouseout = () => { deleteBtn.style.backgroundColor = 'transparent'; deleteBtn.style.color = '#ff3b30'; };
            actionTd.appendChild(deleteBtn);

            tr.appendChild(actionTd);

            row.forEach((cell, cellIndex) => {
                const columnName = currentTableColumns[cellIndex];
                const td = document.createElement('td');
                td.dataset.rawValue = cell;

                if (tableName === 'Item_descriptions' && columnName === 'ADB_Ref' && String(cell).includes('-')) {
                    const unionBtn = document.createElement('button');
                    unionBtn.className = 'explore-btn union-toggle-btn';
                    unionBtn.style.marginRight = '0.4rem';
                    unionBtn.textContent = tr.dataset.unionExpanded === 'true' ? '➖' : '➕';
                    unionBtn.title = 'Expand union members';

                    unionBtn.onclick = async (e) => {
                        e.stopPropagation();
                        await toggleUnionRow(tr, String(cell), unionBtn);
                    };

                    const span = document.createElement('span');
                    span.textContent = String(cell);

                    td.appendChild(unionBtn);
                    td.appendChild(span);
                } else {
                    td.textContent = formatCellValue(tableName, columnName, cell);
                }

                tr.appendChild(td);
            });
            tableBody.appendChild(tr);
        });
    }

    async function fetchTableInfo(tableName) {
        // Quick overrides for known primary keys to avoid extra round trips
        const primaryKeyOverrides = {
            'Item_descriptions': 'ADB_Ref'
        };
        if (primaryKeyOverrides[tableName]) {
            return { primaryKey: primaryKeyOverrides[tableName] };
        }

        try {
            const response = await fetch(`/api/table-info/${encodeURIComponent(dbName)}/${encodeURIComponent(tableName)}`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const info = await response.json();
            console.log(`[TABLE INFO] ${tableName} primary key:`, info.primaryKey);
            return info;
        } catch (error) {
            console.error('Error fetching table info:', error);
            return null;
        }
    }

    function formatCellValue(tableName, columnName, value) {
        if (value === null || value === undefined) return '';

        // Format currency for Item_descriptions.Unit_Cost
        if (tableName === 'Item_descriptions' && columnName === 'Unit_Cost') {
            const num = parseFloat(value);
            if (!isNaN(num)) {
                return '£' + num.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            }
        }

        // Format dates for Item_descriptions.Cost_Date as dd-mm-yy without time
        if (tableName === 'Item_descriptions' && columnName === 'Cost_Date') {
            // Try to parse as Date; if invalid, strip time portion and return as-is
            const parsed = new Date(value);
            if (!isNaN(parsed.getTime())) {
                const dd = String(parsed.getDate()).padStart(2, '0');
                const mm = String(parsed.getMonth() + 1).padStart(2, '0');
                const yy = String(parsed.getFullYear()).slice(-2);
                return `${dd}-${mm}-${yy}`;
            }
            // Fallback: remove time if present
            if (typeof value === 'string') {
                const datePart = value.split('T')[0].split(' ')[0];
                return datePart.replaceAll('/', '-');
            }
        }

        return value;
    }

    function makeEditable(td, rowData, rowIndex, tableName, cellIndex, primaryKeyColName, columnNames) {
        const colName = (columnNames && columnNames[cellIndex]) ||
            (currentTableColumns && currentTableColumns[cellIndex]) ||
            `Col${cellIndex}`;

        const originalValue = td.dataset.rawValue ?? td.textContent;
        const pkValuesJson = td.dataset.pkValues; // Get stored PK values as JSON
        const pkValues = JSON.parse(pkValuesJson);

        console.log(`[EDIT] Table: ${tableName}, PK Column: ${primaryKeyColName}, PK Values:`, pkValues);

        // Create input
        const input = document.createElement('input');
        input.type = 'text';
        input.value = originalValue;
        input.className = 'edit-input';

        // Get column max length if available from table-info
        fetchTableInfo(tableName).then(tableInfo => {
            const colInfo = tableInfo?.columns?.[cellIndex];
            if (colInfo?.maxLength) {
                input.maxLength = colInfo.maxLength;
                input.title = `Max ${colInfo.maxLength} characters`;
            }
        }).catch(() => { });

        td.textContent = '';
        td.appendChild(input);
        td.classList.add('editing');
        input.focus();
        input.select();

        const saveEdit = async () => {
            const newValue = input.value;

            if (newValue === originalValue) {
                cancelEdit();
                return;
            }

            // Validate length if we have column info
            try {
                const tableInfo = await fetchTableInfo(tableName);
                const colInfo = tableInfo?.columns?.[cellIndex];
                if (colInfo?.maxLength && newValue.length > colInfo.maxLength) {
                    alert(`Value is too long! Maximum length is ${colInfo.maxLength} characters, but you entered ${newValue.length}.`);
                    cancelEdit();
                    return;
                }
            } catch (e) {
                console.warn('Could not fetch column info for validation');
            }

            // Build WHERE clause for composite or single primary key
            const pkColumns = primaryKeyColName.split(',').map(col => col.trim());
            let whereClause = '';

            if (pkColumns.length > 1) {
                // Composite key - build WHERE with all PK columns
                const conditions = pkColumns.map(pkCol => {
                    const value = pkValues[pkCol];

                    // Handle NULL/undefined values
                    if (value === null || value === undefined || value === 'undefined' || value === '') {
                        return `[${pkCol}] IS NULL`;
                    }

                    const isNumeric = !isNaN(value) && value !== '';
                    return `[${pkCol}] = ${isNumeric ? value : "'" + String(value).replace(/'/g, "''") + "'"}`;
                });
                whereClause = conditions.join(' AND ');
            } else {
                // Single primary key
                const pkValue = pkValues[primaryKeyColName];

                // Handle NULL/undefined values
                if (pkValue === null || pkValue === undefined || pkValue === 'undefined' || pkValue === '') {
                    whereClause = `[${primaryKeyColName}] IS NULL`;
                } else {
                    const isPkNumeric = !isNaN(pkValue) && pkValue !== '';
                    whereClause = `[${primaryKeyColName}] = ${isPkNumeric ? pkValue : "'" + String(pkValue).replace(/'/g, "''") + "'"}`;
                }
            }

            const updateSql = `UPDATE [${dbName}].dbo.[${tableName}] SET [${colName}] = '${newValue.replace(/'/g, "''")}' WHERE ${whereClause}`;

            console.log('Executing UPDATE:', updateSql);
            console.log('Audit details - colName:', colName, 'originalValue:', originalValue, 'newValue:', newValue, 'primaryKeyColName:', primaryKeyColName, 'pkValues:', pkValues);

            const payload = {
                db: dbName,
                sql: updateSql,
                column_name: colName,
                old_value: originalValue,
                new_value: newValue,
                pk_column: primaryKeyColName,
                pk_value: JSON.stringify(pkValues) // Send all PK values as JSON string
            };
            console.log('Sending payload:', payload);

            try {
                const response = await fetch('/api/execute', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                const responseData = await response.json();
                console.log('Server response:', responseData);

                if (!response.ok) {
                    const errorMsg = responseData.message || responseData.error || JSON.stringify(responseData);
                    alert(`Update failed:\n\n${errorMsg}\n\nSQL: ${updateSql}`);
                    cancelEdit();
                } else {
                    // Update succeeded
                    rowData[cellIndex] = newValue;
                    td.textContent = formatCellValue(tableName, colName, newValue);
                    td.dataset.rawValue = newValue;
                    td.classList.remove('editing');
                    console.log('Row updated successfully');
                }
            } catch (error) {
                console.error('Fetch error:', error);
                alert(`Error: ${error.message}`);
                cancelEdit();
            }
        };

        const cancelEdit = () => {
            td.textContent = formatCellValue(tableName, colName, originalValue);
            td.classList.remove('editing');
        };

        input.addEventListener('blur', saveEdit);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') saveEdit();
            if (e.key === 'Escape') cancelEdit();
        });
    }

    async function deleteRow(tableName, pkValues, rowElement) {
        if (!confirm('Are you sure you want to delete this row? This cannot be undone.')) return;

        // Build WHERE clause
        const conditions = Object.entries(pkValues).map(([col, val]) => {
            if (val === null || val === undefined || val === '') return `[${col}] IS NULL`;
            const isNumeric = !isNaN(val) && val !== '';
            return `[${col}] = ${isNumeric ? val : "'" + String(val).replace(/'/g, "''") + "'"}`;
        });

        const whereClause = conditions.join(' AND ');
        const deleteSql = `DELETE FROM [${dbName}].dbo.[${tableName}] WHERE ${whereClause}`;

        console.log('Deleting:', deleteSql);

        try {
            const resp = await fetch('/api/execute', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    db: dbName,
                    sql: deleteSql,
                    column_name: '(all)',
                    old_value: Object.entries(pkValues).map(([k,v]) => `${k}=${v}`).join(', '),
                    new_value: '(deleted)',
                    pk_column: Object.keys(pkValues).join(', '),
                    pk_value: Object.values(pkValues).join(', ')
                })
            });

            const result = await resp.json();

            if (!resp.ok) {
                alert(`Delete failed: ${result.error || result.message}`);
                return;
            }

            // Remove row from UI visually
            rowElement.style.transition = 'opacity 0.3s';
            rowElement.style.opacity = '0';
            setTimeout(() => rowElement.remove(), 300);

            // Also update total items if possible
            updateTotalItems();

        } catch (error) {
            console.error('Delete error:', error);
            alert('Failed to delete row.');
        }
    }

    function drillDown(nextTable, filterCol, filterVal, label) {
        breadcrumbs.push({ label, table: nextTable, filter: { col: filterCol, val: filterVal } });
        renderBreadcrumbs();
        fetchTableData(nextTable, { col: filterCol, val: filterVal });
    }

    function renderBreadcrumbs() {
        breadcrumbsContainer.innerHTML = '';
        breadcrumbs.forEach((bc, index) => {
            const span = document.createElement('span');
            span.className = 'breadcrumb-item' + (index === breadcrumbs.length - 1 ? ' active' : '');
            span.textContent = bc.label;
            span.onclick = () => {
                if (index === breadcrumbs.length - 1) return;
                breadcrumbs = breadcrumbs.slice(0, index + 1);
                renderBreadcrumbs();

                if (bc.table === null && bc.label === 'Check Tables') {
                    // Special case: Go back to Check Tables view
                    views.forEach(v => v.classList.add('hidden'));
                    document.getElementById('view-check-tables').classList.remove('hidden');
                    viewTitle.textContent = 'Check Tables';
                } else {
                    fetchTableData(bc.table, bc.filter);
                }
            };
            breadcrumbsContainer.appendChild(span);
        });
    }

    async function initTodoView() {
        // Initialize ToDo table if it doesn't exist
        try {
            const resp = await fetch(`/api/init-todo/${encodeURIComponent(dbName)}`, { method: 'POST' });
            if (!resp.ok) throw new Error(`Failed to initialize ToDo table: ${resp.status}`);

            // Fetch and display todos
            await loadTodos();
        } catch (error) {
            console.error('Todo initialization error:', error);
            todoList.innerHTML = '<li style="color: red;">Error initializing todo tracker. Please refresh.</li>';
        }
    }

    async function loadTodos() {
        try {
            const resp = await fetch(`/api/table/${encodeURIComponent(dbName)}/ToDo`);
            if (!resp.ok) throw new Error(`Failed to fetch todos: ${resp.status}`);

            const result = await resp.json();
            const todos = result.data || [];

            todoList.innerHTML = '';
            todos.forEach(row => {
                const id = row[0];
                const action = row[1];
                const completed = row[2] === 1 || row[2] === '1' || row[2] === true;

                const li = document.createElement('li');
                li.className = `todo-item ${completed ? 'completed' : ''}`;

                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.checked = completed;
                checkbox.addEventListener('change', () => updateTodoComplete(id, checkbox.checked));

                const span = document.createElement('span');
                span.className = 'todo-text';
                span.textContent = action;

                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'todo-delete-btn';
                deleteBtn.textContent = '✕';
                deleteBtn.addEventListener('click', () => deleteTodo(id));

                li.appendChild(checkbox);
                li.appendChild(span);
                li.appendChild(deleteBtn);
                todoList.appendChild(li);
            });
        } catch (error) {
            console.error('Failed to load todos:', error);
            todoList.innerHTML = '<li style="color: red;">Failed to load todos.</li>';
        }
    }

    async function addTodo() {
        const action = todoInput.value.trim();
        if (!action) return;

        try {
            // Insert new todo
            const insertSql = `INSERT INTO [${dbName}].dbo.[ToDo] ([Action], [Completed]) VALUES ('${action.replace(/'/g, "''")}', 0)`;
            const resp = await fetch(`/api/execute`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ db: dbName, sql: insertSql })
            });

            if (!resp.ok) throw new Error('Failed to add todo');

            todoInput.value = '';
            await loadTodos();
        } catch (error) {
            console.error('Failed to add todo:', error);
            alert('Failed to add todo. Please try again.');
        }
    }

    async function updateTodoComplete(id, completed) {
        try {
            const updateSql = `UPDATE [${dbName}].dbo.[ToDo] SET [Completed] = ${completed ? 1 : 0} WHERE [Id] = ${id}`;
            const resp = await fetch(`/api/execute`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ db: dbName, sql: updateSql })
            });

            if (!resp.ok) throw new Error('Failed to update todo');

            await loadTodos();
        } catch (error) {
            console.error('Failed to update todo:', error);
        }
    }

    async function deleteTodo(id) {
        try {
            const deleteSql = `DELETE FROM [${dbName}].dbo.[ToDo] WHERE [Id] = ${id}`;
            const resp = await fetch(`/api/execute`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ db: dbName, sql: deleteSql })
            });

            if (!resp.ok) throw new Error('Failed to delete todo');

            await loadTodos();
        } catch (error) {
            console.error('Failed to delete todo:', error);
        }
    }

    // Todo button handlers
    if (todoAddBtn) {
        todoAddBtn.addEventListener('click', addTodo);
    }
    if (todoInput) {
        todoInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') addTodo();
        });
    }

    // Navigation logic
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            if (item.disabled) return;

            const targetView = item.dataset.view || 'table';

            navItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');

            views.forEach(v => v.classList.add('hidden'));
            document.getElementById(`view-${targetView}`).classList.remove('hidden');

            viewTitle.textContent = item.textContent;

            if (targetView === 'overview') {
                setTimeout(initCharts, 10);
                measureServerPing();
                updateTotalItems();
                updateActiveRooms();
                // Start ping interval (every 15 seconds)
                if (pingInterval) clearInterval(pingInterval);
                pingInterval = setInterval(measureServerPing, 15000);
            } else if (targetView === 'todo') {
                // Stop ping interval when leaving overview
                if (pingInterval) {
                    clearInterval(pingInterval);
                    pingInterval = null;
                }
                initTodoView();
            } else if (targetView === 'audit-trail') {
                // Stop ping interval
                if (pingInterval) {
                    clearInterval(pingInterval);
                    pingInterval = null;
                }
                loadAuditLog();
            } else if (targetView === 'run-reports') {
                // Stop ping interval
                if (pingInterval) {
                    clearInterval(pingInterval);
                    pingInterval = null;
                }
                initReportsView();
            } else if (targetView === 'sql-runner') {
                if (pingInterval) {
                    clearInterval(pingInterval);
                    pingInterval = null;
                }
                loadLocalTables();
            } else {
                // Stop ping interval for other views too
                if (pingInterval) {
                    clearInterval(pingInterval);
                    pingInterval = null;
                }
            }
        });
    });

    // Logout
    document.getElementById('logout-btn').addEventListener('click', () => {
        sessionStorage.removeItem('selectedDb');
        window.location.href = 'index.html';
    });

    // Shutdown
    async function checkServerStopped() {
        // Quick ping with tiny timeout; failure means server likely down
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 500);
        try {
            const resp = await fetch('/api/databases', { signal: controller.signal });
            clearTimeout(timeout);
            return !resp.ok; // non-OK treated as stopped
        } catch (_) {
            clearTimeout(timeout);
            return true; // network/abort => server down or stopping
        }
    }

    document.getElementById('shutdown-btn').addEventListener('click', async () => {
        // Show overlay immediately for better feedback even if request is slow
        if (shutdownOverlay) shutdownOverlay.classList.remove('hidden');
        if (shutdownMessage) shutdownMessage.textContent = 'Shutting down the server. This may take a few seconds.';

        // Use a short timeout and treat connection loss as success, because the server exits mid-request
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);

        try {
            const resp = await fetch('/api/shutdown', { method: 'POST', signal: controller.signal });
            clearTimeout(timeout);

            if (resp.ok) {
                const stopped = await checkServerStopped();
                if (shutdownMessage) shutdownMessage.textContent = stopped
                    ? 'Shutdown successful. You can close this tab.'
                    : 'Shutdown requested. The server is finishing up; you can close this tab.';
            } else {
                if (shutdownMessage) shutdownMessage.textContent = 'We could not confirm shutdown. Please try again.';
            }
        } catch (e) {
            clearTimeout(timeout);
            console.warn('Shutdown likely completed while closing connection', e);
            // Treat connection drop as success; only show issue if we explicitly know it's an error
            if (e.name === 'AbortError') {
                const stopped = await checkServerStopped();
                if (shutdownMessage) shutdownMessage.textContent = stopped
                    ? 'Shutdown successful. You can close this tab.'
                    : 'Shutdown requested. The server is finishing up; you can close this tab.';
            } else {
                const stopped = await checkServerStopped();
                if (shutdownMessage) shutdownMessage.textContent = stopped
                    ? 'Shutdown successful. You can close this tab.'
                    : 'We could not confirm shutdown. Please try again.';
            }
        }
    });

    const localTableViewModal = document.getElementById('local-table-view-modal');
    const localTableViewClose = document.getElementById('local-table-view-close');

    if (shutdownClose) {
        shutdownClose.addEventListener('click', () => {
            window.location.href = 'about:blank';
        });
    }

    if (localTableViewClose && localTableViewModal) {
        localTableViewClose.addEventListener('click', () => {
            localTableViewModal.classList.add('hidden');
        });
    }

    if (localTableViewModal) {
        localTableViewModal.addEventListener('click', (e) => {
            if (e.target === localTableViewModal) {
                localTableViewModal.classList.add('hidden');
            }
        });
    }

    // Sidebar: Hierarchy Explorer (Top Level)
    dbBtn.addEventListener('click', () => {
        breadcrumbs = [{ label: 'Areas Level 3', table: 'Areaslevel3', filter: null }];
        renderBreadcrumbs();
        fetchTableData('Areaslevel3');
    });

    // Sidebar: Item Descriptions quick view
    if (itemDescBtn) {
        itemDescBtn.addEventListener('click', () => {
            // Highlight this nav item and show the table view
            navItems.forEach(i => i.classList.remove('active'));
            itemDescBtn.classList.add('active');

            views.forEach(v => v.classList.add('hidden'));
            document.getElementById('view-table').classList.remove('hidden');
            viewTitle.textContent = 'Item Descriptions';

            // Simple breadcrumbs and data load
            breadcrumbs = [{ label: 'Data', table: null, filter: null }, { label: 'Item_descriptions', table: 'Item_descriptions', filter: null }];
            renderBreadcrumbs();
            fetchTableData('Item_descriptions');
        });
    }

    // Check Tables Logic
    document.querySelectorAll('.table-card').forEach(card => {
        card.addEventListener('click', () => {
            const table = card.dataset.table;
            const label = card.querySelector('h3').textContent;

            // Switch to table view
            navItems.forEach(i => i.classList.remove('active'));
            // Ideally highlight "Check Tables" but it's fine for now

            views.forEach(v => v.classList.add('hidden'));
            document.getElementById('view-table').classList.remove('hidden');
            viewTitle.textContent = label;

            // Set simple breadcrumb
            breadcrumbs = [{ label: 'Check Tables', table: null, filter: null }, { label: label, table: table, filter: null }];
            renderBreadcrumbs();
            fetchTableData(table);
        });
    });

    // Initial load
    initCharts();
    measureServerPing();
    updateTotalItems();
    updateActiveRooms();
    // Start ping interval on initial load (every 15 seconds)
    pingInterval = setInterval(measureServerPing, 15000);

    // Initialize resizable columns for audit table
    initResizableColumns();

    // Dark Mode / Terminal Mode Logic
    const themeToggle = document.getElementById('theme-toggle');
    const body = document.body;

    // Check saved preference: 'light' | 'dark' | 'terminal'
    const savedTheme = localStorage.getItem('theme') || 'light';
    applyTheme(savedTheme);

    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            let current = 'light';
            if (body.classList.contains('dark-mode')) current = 'dark';
            if (body.classList.contains('terminal-mode')) current = 'terminal';

            let next = 'light';
            if (current === 'light') next = 'dark';
            else if (current === 'dark') next = 'terminal';
            else if (current === 'terminal') next = 'light';

            applyTheme(next);
            localStorage.setItem('theme', next);
        });
    }

    function applyTheme(theme) {
        // Reset classes
        body.classList.remove('dark-mode', 'terminal-mode');

        if (theme === 'dark') {
            body.classList.add('dark-mode');
        } else if (theme === 'terminal') {
            body.classList.add('terminal-mode');
        }

        updateThemeIcon(theme);
        updateChartsTheme();
    }

    function updateThemeIcon(theme) {
        if (!themeToggle) return;
        if (theme === 'light') {
            themeToggle.textContent = '🌙 Dark Mode';
        } else if (theme === 'dark') {
            themeToggle.textContent = '📟 Terminal Mode';
        } else if (theme === 'terminal') {
            themeToggle.textContent = '☀️ Light Mode';
        }
    }

    function updateChartsTheme() {
        const isDark = document.body.classList.contains('dark-mode');
        const isTerminal = document.body.classList.contains('terminal-mode');

        // Determine colors
        let textColor = '#666';
        let gridColor = '#e5e5e5';

        if (isDark) {
            textColor = '#d0d0d0';
            gridColor = '#404040';
        } else if (isTerminal) {
            textColor = '#33ff33';
            gridColor = '#33ff33';
        }

        const charts = [statusChart, categoryChart, priorityChart, categoryMixChart];

        charts.forEach(chart => {
            if (chart) {
                // Update Legend
                if (chart.options.plugins && chart.options.plugins.legend) {
                    chart.options.plugins.legend.labels.color = textColor;
                }

                // Update Scales (if they exist)
                if (chart.options.scales) {
                    ['x', 'y'].forEach(axis => {
                        if (chart.options.scales[axis]) {
                            // Ticks
                            if (chart.options.scales[axis].ticks) {
                                chart.options.scales[axis].ticks.color = textColor;
                            }
                            // Grid
                            if (chart.options.scales[axis].grid) {
                                chart.options.scales[axis].grid.color = gridColor;
                                // Make grid subtle in terminal mode
                                if (isTerminal) {
                                    chart.options.scales[axis].grid.color = 'rgba(51, 255, 51, 0.2)';
                                }
                            }
                        }
                    });
                }
                chart.update();
            }
        });
    }

    // Add Row Modal Functions
    async function openAddRowModal(tableName) {
        if (!tableName) {
            alert('No table selected');
            return;
        }

        try {
            // Fetch table info to get column definitions
            const resp = await fetch(`/api/table-info/${encodeURIComponent(dbName)}/${encodeURIComponent(tableName)}`);
            
            if (!resp.ok) {
                alert('Failed to load table structure');
                return;
            }

            const tableInfo = await resp.json();
            const { columns, primaryKey } = tableInfo;
            currentPrimaryKey = primaryKey;

            // Detect if we're filtering by Room_Code (from hierarchy navigation)
            let prefilledRoomCode = null;
            if (tableName === 'item_schedule' && breadcrumbs && breadcrumbs.length > 0) {
                const lastBreadcrumb = breadcrumbs[breadcrumbs.length - 1];
                if (lastBreadcrumb.filter && lastBreadcrumb.filter.col === 'Room_Code') {
                    prefilledRoomCode = lastBreadcrumb.filter.val;
                }
            }

            // Clear form
            const form = document.getElementById('add-row-form');
            if (form) {
                form.innerHTML = '';

                // Parse composite primary key
                const pkColumns = new Set(primaryKey.split(',').map(pk => pk.trim()));

                // Add form fields for each column (skip primary keys and certain columns)
                const allowedCols = tableName === 'Item_descriptions'
                    ? new Set(['ADB_Ref', 'Item_Description', 'Unit_Cost', 'Cost_Date'])
                    : null;

                // For item_schedule, we want to include Item_Description as read-only
                const fieldsAdded = new Set();

                columns.forEach(col => {
                    const colName = col.name;
                    const colType = col.type;
                    const isNullable = col.nullable;
                    const isPrimaryKey = pkColumns.has(colName);

                    if (allowedCols && !allowedCols.has(colName)) {
                        return; // limit to desired columns for this table
                    }

                    // Skip auto-increment fields
                    if (colName === 'Item_schedule_id' || colName === 'instance_variant') {
                        return;
                    }

                    // For most tables skip PK, but allow PK entry for Item_descriptions and item_schedule
                    if (isPrimaryKey && tableName !== 'Item_descriptions' && tableName !== 'item_schedule') {
                        return;
                    }

                    // Skip Item_Description for item_schedule - it's a JOIN column, not stored in the table
                    const normalizedColName = colName.toLowerCase().replace(/_/g, '').replace(/ /g, '');
                    if (normalizedColName === 'itemdescription' && tableName === 'item_schedule') {
                        return;
                    }

                    const fieldGroup = document.createElement('div');
                    fieldGroup.className = 'form-group';

                    const label = document.createElement('label');
                    label.textContent = colName;
                    if (!isNullable && normalizedColName !== 'itemdescription') {
                        label.innerHTML += ' <span style="color: red;">*</span>';
                    }

                    // Special handling for Item_Ref - add autocomplete with Item_Description lookup
                    if (colName === 'Item_Ref') {
                        const container = document.createElement('div');
                        container.style.position = 'relative';

                        const input = document.createElement('input');
                        input.type = 'text';
                        input.name = colName;
                        input.id = 'item-ref-input';
                        input.placeholder = `${colName}${!isNullable ? ' (required)' : ''} - Start typing...`;
                        input.required = !isNullable;
                        input.dataset.type = colType;
                        input.autocomplete = 'off';

                        const dropdown = document.createElement('div');
                        dropdown.className = 'autocomplete-dropdown';
                        dropdown.style.position = 'absolute';
                        dropdown.style.top = '100%';
                        dropdown.style.left = '0';
                        dropdown.style.right = '0';
                        dropdown.style.zIndex = '1000';
                        dropdown.style.backgroundColor = 'var(--bg-color)';
                        dropdown.style.border = '1px solid var(--border-color)';
                        dropdown.style.borderTop = 'none';
                        dropdown.style.borderRadius = '0 0 6px 6px';
                        dropdown.style.maxHeight = '200px';
                        dropdown.style.overflowY = 'auto';
                        dropdown.style.display = 'none';

                        // Cache for item data to avoid refetches
                        let itemDataCache = null;

                        // Add event listener for autocomplete
                        input.addEventListener('input', async (e) => {
                            const query = e.target.value.trim();
                            if (query.length === 0) {
                                dropdown.style.display = 'none';
                                const descInput = form.querySelector('input[name="Item_Description"]');
                                if (descInput) {
                                    descInput.value = '';
                                }
                                return;
                            }

                            try {
                                // Fetch matching items dynamically from backend
                                const escapedQuery = query.replace(/'/g, "''");
                                const sql = `SELECT [ADB_Ref], [Item_Description] FROM [Item_descriptions] WHERE [ADB_Ref] LIKE '${escapedQuery}%'`;
                                const itemResp = await fetch('/api/execute', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ db: dbName, sql: sql })
                                });

                                // Only process if the input value hasn't changed since the request was sent
                                if (input.value.trim() !== query) {
                                    return;
                                }

                                if (!itemResp.ok) {
                                    dropdown.style.display = 'none';
                                    return;
                                }

                                const itemData = await itemResp.json();
                                const items = itemData.data || [];
                                const columns = itemData.columns || [];

                                // Find ADB_Ref and Item_Description column indices
                                const refIndex = columns.findIndex(c => c === 'ADB_Ref');
                                const descIndex = columns.findIndex(c => c === 'Item_Description');
                                if (refIndex === -1) {
                                    dropdown.style.display = 'none';
                                    return;
                                }

                                // Slice to first 10 matching results
                                const matches = items.slice(0, 10);

                                if (matches.length === 0) {
                                    dropdown.style.display = 'none';
                                    const descInput = form.querySelector('input[name="Item_Description"]');
                                    if (descInput) {
                                        descInput.value = '';
                                    }
                                    return;
                                }

                                // Populate dropdown with both ADB_Ref and Item_Description
                                dropdown.innerHTML = '';
                                matches.forEach(row => {
                                    const refVal = row[refIndex];
                                    const descVal = descIndex >= 0 ? row[descIndex] : '';
                                    const option = document.createElement('div');
                                    option.style.padding = '0.5rem';
                                    option.style.cursor = 'pointer';
                                    option.style.borderBottom = '1px solid var(--border-color)';
                                    option.style.fontSize = '0.9rem';
                                    
                                    // Show both Ref and Description
                                    const displayText = descVal ? `${refVal} - ${descVal}` : refVal;
                                    option.textContent = displayText;
                                    option.dataset.refValue = refVal;
                                    option.dataset.descValue = descVal || '';

                                    option.addEventListener('mousedown', (e) => {
                                        e.preventDefault();
                                        input.value = refVal;
                                        // Auto-fill Item_Description
                                        const descInput = form.querySelector('input[name="Item_Description"]');
                                        if (descInput) {
                                            descInput.value = option.dataset.descValue;
                                        }
                                        dropdown.style.display = 'none';
                                    });
                                    option.addEventListener('mouseover', () => {
                                        option.style.backgroundColor = 'var(--secondary-bg)';
                                    });
                                    option.addEventListener('mouseout', () => {
                                        option.style.backgroundColor = 'transparent';
                                    });
                                    dropdown.appendChild(option);
                                });

                                dropdown.style.display = 'block';

                                // Auto-fill if there is an exact match (case-insensitive)
                                const exactMatch = matches.find(row => {
                                    const refVal = row[refIndex] ? String(row[refIndex]).toUpperCase() : '';
                                    return refVal === query.toUpperCase();
                                });
                                const descInput = form.querySelector('input[name="Item_Description"]');
                                if (descInput) {
                                    descInput.value = exactMatch ? (exactMatch[descIndex] || '') : '';
                                }
                            } catch (error) {
                                console.error('Autocomplete error:', error);
                                dropdown.style.display = 'none';
                            }
                        });

                        // Close dropdown on blur
                        input.addEventListener('blur', () => {
                            setTimeout(() => {
                                dropdown.style.display = 'none';
                            }, 200);
                        });

                        container.appendChild(label);
                        container.appendChild(input);
                        container.appendChild(dropdown);
                        fieldGroup.appendChild(container);
                        fieldsAdded.add('Item_Ref');

                        // Append the Item_Ref fieldGroup to form
                        form.appendChild(fieldGroup);

                        // If tableName is item_schedule, also create and append read-only Item_Description field
                        if (tableName === 'item_schedule') {
                            const descFieldGroup = document.createElement('div');
                            descFieldGroup.className = 'form-group';

                            const descLabel = document.createElement('label');
                            descLabel.textContent = 'Item_Description';

                            const descInput = document.createElement('input');
                            descInput.type = 'text';
                            descInput.name = 'Item_Description';
                            descInput.id = 'item-description-input';
                            descInput.placeholder = 'Auto-filled description';
                            descInput.readOnly = true;
                            descInput.style.backgroundColor = 'var(--secondary-bg)';
                            descInput.style.cursor = 'not-allowed';

                            descFieldGroup.appendChild(descLabel);
                            descFieldGroup.appendChild(descInput);
                            form.appendChild(descFieldGroup);
                            fieldsAdded.add('Item_Description');
                        }

                        return;
                    } else if (colName === 'Room_Code') {
                        const input = document.createElement('input');
                        input.type = 'text';
                        input.name = colName;
                        input.placeholder = `${colName}${!isNullable ? ' (required)' : ''}`;
                        input.required = !isNullable;
                        input.dataset.type = colType;

                        // Pre-fill if we're navigating from hierarchy
                        if (prefilledRoomCode) {
                            input.value = prefilledRoomCode;
                            input.readOnly = true;
                            input.style.backgroundColor = 'var(--secondary-bg)';
                            input.style.cursor = 'not-allowed';
                            input.title = 'Pre-filled from hierarchy navigation';
                        }

                        fieldGroup.appendChild(label);
                        fieldGroup.appendChild(input);
                        fieldsAdded.add('Room_Code');
                    } else {
                        const input = document.createElement('input');

                        // Choose sensible input types
                        if (colName === 'Cost_Date') {
                            input.type = 'date';
                        } else if (colName === 'Unit_Cost') {
                            input.type = 'number';
                            input.step = '0.01';
                        } else if (colName === 'Qty_New' || colName === 'Qty_Trans') {
                            input.type = 'number';
                        } else {
                            input.type = 'text';
                        }

                        input.name = colName;
                        input.placeholder = `${colName}${!isNullable ? ' (required)' : ''}`;
                        input.required = !isNullable;
                        input.dataset.type = colType;

                        if (colName.toLowerCase() === 'ignore_flag') {
                            input.value = 'N';
                        }

                        fieldGroup.appendChild(label);
                        fieldGroup.appendChild(input);
                        fieldsAdded.add(colName);
                    }

                    form.appendChild(fieldGroup);
                });



                // Show modal
                const modal = document.getElementById('add-modal-overlay');
                if (modal) {
                    modal.classList.remove('hidden');
                }
            }
        } catch (error) {
            console.error('Failed to open add row modal:', error);
            alert('Failed to load table structure: ' + error.message);
        }
    }

    function closeAddRowModal() {
        const modal = document.getElementById('add-modal-overlay');
        if (modal) {
            modal.classList.add('hidden');
        }

        // Clear form
        const form = document.getElementById('add-row-form');
        if (form) {
            form.innerHTML = '';
        }
    }

    async function submitAddRow() {
        const form = document.getElementById('add-row-form');
        if (!form) return;

        const tableName = currentTableName;
        if (!tableName) {
            alert('No table selected');
            return;
        }

        // Collect form data
        const formData = new FormData(form);
        const values = {};
        const columnsToInsert = [];

        for (let [key, value] of formData.entries()) {
            if (key === '') continue;
            
            // Skip Item_Description for item_schedule - it's computed/joined, not stored
            const normalizedKey = key.toLowerCase().replace(/_/g, '').replace(/ /g, '');
            if (normalizedKey === 'itemdescription' && tableName === 'item_schedule') {
                continue;
            }
            
            // Skip empty values (they'll be NULL)
            if (value.trim() === '') {
                values[key] = null;
            } else {
                values[key] = value.trim();
            }
            columnsToInsert.push(key);
        }

        // Validate required fields (non-nullable)
        const inputs = form.querySelectorAll('input[required]');
        for (let input of inputs) {
            if (!input.value || input.value.trim() === '') {
                alert(`${input.name} is required`);
                return;
            }
        }

        // Build INSERT statement
        const columnList = columnsToInsert.map(col => `[${col}]`).join(', ');
        const valueList = columnsToInsert.map(col => {
            const val = values[col];
            if (val === null) {
                return 'NULL';
            } else if (col === 'Qty_New' || col === 'Qty_Trans' || col === 'Unit_Cost') {
                // Numeric columns
                return isNaN(val) ? `'${String(val).replace(/'/g, "''")}'` : val;
            } else {
                // String columns - escape single quotes
                return `'${String(val).replace(/'/g, "''")}'`;
            }
        }).join(', ');

        const insertSql = `INSERT INTO [${dbName}].dbo.[${tableName}] (${columnList}) VALUES (${valueList})`;

        console.log('Insert SQL:', insertSql);

        // Parse primary key columns and values for auditing
        const pkCols = currentPrimaryKey ? currentPrimaryKey.split(',').map(pk => pk.trim()) : [];
        const pkVals = pkCols.map(col => {
            return (values[col] !== undefined && values[col] !== null) ? values[col] : 'NULL';
        });

        const pkColumnParam = pkCols.join(', ');
        const pkValueParam = pkVals.join(', ');
        
        // Build new value audit summary (clean comma-separated pairs of non-null columns)
        const newValueParam = Object.entries(values)
            .filter(([_, v]) => v !== null)
            .map(([k, v]) => `${k}=${v}`)
            .join(', ');

        try {
            const resp = await fetch('/api/execute', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    db: dbName,
                    sql: insertSql,
                    column_name: '(all)',
                    old_value: '(new row)',
                    new_value: newValueParam,
                    pk_column: pkColumnParam || null,
                    pk_value: pkValueParam || null
                })
            });

            const result = await resp.json();

            if (!resp.ok) {
                alert(`Insert failed: ${result.error || result.message || 'Unknown error'}`);
                return;
            }

            // Close modal
            closeAddRowModal();

            // Refresh table - preserve current filter (e.g., Room_Code filter)
            let currentFilter = null;
            if (breadcrumbs && breadcrumbs.length > 0) {
                const lastBreadcrumb = breadcrumbs[breadcrumbs.length - 1];
                if (lastBreadcrumb.filter) {
                    currentFilter = lastBreadcrumb.filter;
                }
            }
            
            alert('Row added successfully!');
            fetchTableData(tableName, currentFilter);
            
            // Also update total items if this is item_schedule
            if (tableName === 'item_schedule') {
                updateTotalItems();
            }

        } catch (error) {
            console.error('Insert error:', error);
            alert('Failed to insert row: ' + error.message);
        }
    }
});

// Make table columns resizable
function initResizableColumns() {
    const table = document.getElementById('audit-table');
    if (!table) return;

    let isResizing = false;
    let currentHeader = null;
    let startX = 0;
    let startWidth = 0;

    // Get all headers and set up resize handles
    const headers = table.querySelectorAll('th');

    headers.forEach(header => {
        // Find or create resize handle
        let resizeHandle = header.querySelector('.resize-handle');
        if (!resizeHandle) {
            resizeHandle = document.createElement('span');
            resizeHandle.className = 'resize-handle';
            header.appendChild(resizeHandle);
        }

        resizeHandle.addEventListener('mousedown', function (e) {
            isResizing = true;
            currentHeader = header;
            startX = e.pageX;
            startWidth = header.offsetWidth;

            resizeHandle.classList.add('resizing');
            document.body.style.cursor = 'col-resize';
            table.style.userSelect = 'none';
            e.preventDefault();
        });
    });

    const handleMouseMove = function (e) {
        if (!isResizing || !currentHeader) return;

        const diff = e.pageX - startX;
        const newWidth = Math.max(50, startWidth + diff);
        currentHeader.style.width = newWidth + 'px';
    };

    const handleMouseUp = function () {
        if (isResizing) {
            isResizing = false;
            document.body.style.cursor = '';
            table.style.userSelect = '';

            if (currentHeader) {
                const resizeHandle = currentHeader.querySelector('.resize-handle');
                if (resizeHandle) {
                    resizeHandle.classList.remove('resizing');
                }
            }
            currentHeader = null;
        }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
}
// Reports Functionality
function initReportsView() {
    const reportCards = document.querySelectorAll('.report-card');
    const reportContent = document.getElementById('report-content');
    const reportsContainer = document.querySelector('.reports-container');

    reportCards.forEach(card => {
        card.addEventListener('click', () => {
            const reportType = card.dataset.report;
            reportsContainer.classList.add('hidden');
            reportContent.classList.remove('hidden');
            
            if (reportType === 'bill-of-quantity') {
                showBillOfQuantity();
            } else if (reportType === 'cost-analysis') {
                showCostAnalysis();
            } else if (reportType === 'compliance-check') {
                showComplianceCheck();
            } else if (reportType === 'inventory-summary') {
                showInventorySummary();
            }
        });
    });
}

function showBillOfQuantity() {
    const reportContent = document.getElementById('report-content');
    
    reportContent.innerHTML = `
        <div class="boq-header">
            <h3>
                Bill of Quantity
                <button id="boq-back-btn" class="explore-btn">← Back to Reports</button>
            </h3>
            <div class="boq-controls">
                <div class="boq-control">
                    <label>Group By:</label>
                    <select id="boq-group-by">
                        <option value="area">Area</option>
                        <option value="room">Room</option>
                        <option value="item">Equipment Type</option>
                    </select>
                </div>
                <div class="boq-control">
                    <label>Area Level 3:</label>
                    <select id="boq-level3-filter">
                        <option value="">All</option>
                    </select>
                </div>
                <div class="boq-control">
                    <label>Area Level 2:</label>
                    <select id="boq-level2-filter">
                        <option value="">All</option>
                    </select>
                </div>
                <div class="boq-control">
                    <label>Area Level 1:</label>
                    <select id="boq-level1-filter">
                        <option value="">All</option>
                    </select>
                </div>
                <div class="boq-control">
                    <label>Room:</label>
                    <select id="boq-room-filter">
                        <option value="">All</option>
                    </select>
                </div>
                <div class="boq-control">
                    <label>Include Ignored:</label>
                    <input type="checkbox" id="boq-include-ignored" />
                </div>
            </div>
            <div class="boq-actions">
                <button id="boq-generate-btn" class="primary-btn">Generate Report</button>
                <button id="boq-export-xlsx" class="primary-btn">Export to Excel</button>
                <button id="boq-export-pdf" class="primary-btn">Export as PDF</button>
            </div>
        </div>
        <div class="boq-table-container">
            <table class="boq-table">
                <thead>
                    <tr>
                        <th>Item</th>
                        <th>Description</th>
                        <th>Group</th>
                        <th>Cat</th>
                        <th>Qty New</th>
                        <th>Qty Transfer</th>
                        <th>Total Qty</th>
                        <th>Unit Cost</th>
                        <th>Total Cost</th>
                    </tr>
                </thead>
                <tbody id="boq-table-body">
                    <tr><td colspan="9">Click "Generate Report" to create the Bill of Quantity...</td></tr>
                </tbody>
            </table>
        </div>
    `;

    // Back button
    document.getElementById('boq-back-btn').addEventListener('click', backToReports);

    // Load hierarchical filters
    loadBOQFilters();

    // Generate button
    document.getElementById('boq-generate-btn').addEventListener('click', generateBOQ);

    // Export buttons
    document.getElementById('boq-export-xlsx').addEventListener('click', () => exportBOQAsExcel());
    document.getElementById('boq-export-pdf').addEventListener('click', () => exportBOQAsPDF());
}

function backToReports() {
    const reportContent = document.getElementById('report-content');
    const reportsContainer = document.querySelector('.reports-container');
    
    reportContent.classList.add('hidden');
    reportsContainer.classList.remove('hidden');
}

function showCostAnalysis() {
    const reportContent = document.getElementById('report-content');
    reportContent.innerHTML = `
        <div class="boq-header">
            <h3>
                Cost Analysis
                <button id="cost-back-btn" class="explore-btn">← Back to Reports</button>
            </h3>
            <p>Cost Analysis report coming soon...</p>
        </div>
    `;
    document.getElementById('cost-back-btn').addEventListener('click', backToReports);
}

function showComplianceCheck() {
    const reportContent = document.getElementById('report-content');
    reportContent.innerHTML = `
        <div class="boq-header">
            <h3>
                Compliance Check
                <button id="compliance-back-btn" class="explore-btn">← Back to Reports</button>
            </h3>
            <p>Compliance Check report coming soon...</p>
        </div>
    `;
    document.getElementById('compliance-back-btn').addEventListener('click', backToReports);
}

function showInventorySummary() {
    const reportContent = document.getElementById('report-content');
    reportContent.innerHTML = `
        <div class="boq-header">
            <h3>
                Inventory Summary
                <button id="inventory-back-btn" class="explore-btn">← Back to Reports</button>
            </h3>
            <p>Inventory Summary report coming soon...</p>
        </div>
    `;
    document.getElementById('inventory-back-btn').addEventListener('click', backToReports);
}

function loadBOQFilters() {
    const dbName = sessionStorage.getItem('selectedDb');
    if (!dbName) return;

    // Load Areaslevel3
    fetch(`/api/table/${encodeURIComponent(dbName)}/Areaslevel3?limit=1000`)
        .then(r => r.json())
        .then(data => {
            const level3Select = document.getElementById('boq-level3-filter');
            const areas = data.data || [];
            const columns = data.columns || [];
            
            const idIdx = columns.indexOf('ArealevelID');
            const descIdx = columns.indexOf('AreaDescription');

            areas.forEach(row => {
                if (idIdx >= 0) {
                    const option = document.createElement('option');
                    option.value = row[idIdx];
                    option.textContent = descIdx >= 0 ? `${row[idIdx]} - ${row[descIdx]}` : row[idIdx];
                    level3Select.appendChild(option);
                }
            });

            // Set up cascade
            level3Select.addEventListener('change', () => loadLevel2Areas());
        })
        .catch(err => console.error('Error loading Areaslevel3:', err));
}

function loadLevel2Areas() {
    const dbName = sessionStorage.getItem('selectedDb');
    if (!dbName) return;

    const level3Value = document.getElementById('boq-level3-filter')?.value;
    const level2Select = document.getElementById('boq-level2-filter');
    const level1Select = document.getElementById('boq-level1-filter');
    const roomSelect = document.getElementById('boq-room-filter');
    
    // Clear downstream filters
    level2Select.innerHTML = '<option value="">All</option>';
    level1Select.innerHTML = '<option value="">All</option>';
    roomSelect.innerHTML = '<option value="">All</option>';

    if (!level3Value) return;

    let url = `/api/table/${encodeURIComponent(dbName)}/Areaslevel2?limit=1000&filter_col=ParentArea&filter_val=${encodeURIComponent(level3Value)}`;
    
    fetch(url)
        .then(r => r.json())
        .then(data => {
            const areas = data.data || [];
            const columns = data.columns || [];
            
            const idIdx = columns.indexOf('ArealevelID');
            const descIdx = columns.indexOf('AreaDescription');

            areas.forEach(row => {
                if (idIdx >= 0) {
                    const option = document.createElement('option');
                    option.value = row[idIdx];
                    option.textContent = descIdx >= 0 ? `${row[idIdx]} - ${row[descIdx]}` : row[idIdx];
                    level2Select.appendChild(option);
                }
            });

            level2Select.addEventListener('change', () => loadLevel1Areas(), { once: false });
        })
        .catch(err => console.error('Error loading Areaslevel2:', err));
}

function loadLevel1Areas() {
    const dbName = sessionStorage.getItem('selectedDb');
    if (!dbName) return;

    const level2Value = document.getElementById('boq-level2-filter')?.value;
    const level1Select = document.getElementById('boq-level1-filter');
    const roomSelect = document.getElementById('boq-room-filter');
    
    // Clear downstream filters
    level1Select.innerHTML = '<option value="">All</option>';
    roomSelect.innerHTML = '<option value="">All</option>';

    if (!level2Value) return;

    let url = `/api/table/${encodeURIComponent(dbName)}/Areaslevel1?limit=1000&filter_col=ParentArea&filter_val=${encodeURIComponent(level2Value)}`;
    
    fetch(url)
        .then(r => r.json())
        .then(data => {
            const areas = data.data || [];
            const columns = data.columns || [];
            
            const idIdx = columns.indexOf('ArealevelID');
            const descIdx = columns.indexOf('AreaDescription');

            areas.forEach(row => {
                if (idIdx >= 0) {
                    const option = document.createElement('option');
                    option.value = row[idIdx];
                    option.textContent = descIdx >= 0 ? `${row[idIdx]} - ${row[descIdx]}` : row[idIdx];
                    level1Select.appendChild(option);
                }
            });

            level1Select.addEventListener('change', () => loadRooms(), { once: false });
        })
        .catch(err => console.error('Error loading Areaslevel1:', err));
}

function loadRooms() {
    const dbName = sessionStorage.getItem('selectedDb');
    if (!dbName) return;

    const level1Value = document.getElementById('boq-level1-filter')?.value;
    const roomSelect = document.getElementById('boq-room-filter');
    
    // Clear room filter
    roomSelect.innerHTML = '<option value="">All</option>';

    if (!level1Value) return;

    let url = `/api/table/${encodeURIComponent(dbName)}/Room_schedule?limit=5000&filter_col=ParentArea&filter_val=${encodeURIComponent(level1Value)}`;
    
    fetch(url)
        .then(r => r.json())
        .then(data => {
            const rooms = data.data || [];
            const columns = data.columns || [];
            
            const roomIdIdx = columns.indexOf('Room_Id');
            const roomCodeIdx = columns.indexOf('Room_Code');
            const roomDescIdx = columns.indexOf('Project_Room_Description');

            rooms.forEach(row => {
                if (roomCodeIdx >= 0) {
                    const option = document.createElement('option');
                    option.value = row[roomCodeIdx];
                    const roomDesc = roomDescIdx >= 0 ? row[roomDescIdx] : '';
                    option.textContent = roomDesc ? `${row[roomCodeIdx]} - ${roomDesc}` : row[roomCodeIdx];
                    roomSelect.appendChild(option);
                }
            });
        })
        .catch(err => console.error('Error loading rooms:', err));
}

async function expandUnionItems(dbName, items, columns) {
    // Find indices
    const itemRefIdx = columns.indexOf('Item_Ref');
    const descIdx = columns.indexOf('Item_Description');
    const qtyNewIdx = columns.indexOf('Qty_New');
    const qtyTransIdx = columns.indexOf('Qty_Trans');

    const expandedItems = [];
    
    // First pass: collect all unique union items
    const unionLookups = [];
    const unionItemMap = {};
    
    for (const item of items) {
        const itemRef = itemRefIdx >= 0 ? item[itemRefIdx] : '';
        
        // Check if this is a union item (contains a hyphen)
        if (itemRef && itemRef.includes('-') && !unionItemMap[itemRef]) {
            unionItemMap[itemRef] = item;
            
            // Only fetch if not cached or cache is stale
            if (!unionDataCache[itemRef] || isUnionCacheStale(itemRef)) {
                unionLookups.push(
                    fetch(`/api/table/${encodeURIComponent(dbName)}/Unions?limit=1000&filter_col=Union_Code&filter_val=${encodeURIComponent(itemRef)}`)
                        .then(r => r.json())
                        .then(data => {
                            // Cache the result with timestamp
                            unionDataCache[itemRef] = {
                                data: data.data,
                                columns: data.columns,
                                timestamp: Date.now()
                            };
                            return data;
                        })
                        .catch(err => {
                            console.warn('Error fetching union:', itemRef, err);
                            return { data: [], columns: [] };
                        })
                );
            }
        }
    }
    
    // Fetch all uncached/stale unions in parallel
    const unionDataList = await Promise.all(unionLookups);
    const unionResults = {};
    const itemCodesNeeded = [];
    
    // Process union results and collect child item codes
    for (const unionCode of Object.keys(unionItemMap)) {
        // Use cached data
        const cachedUnion = unionDataCache[unionCode];
        
        if (cachedUnion && cachedUnion.data && cachedUnion.data.length > 0) {
            unionResults[unionCode] = {
                data: cachedUnion.data,
                columns: cachedUnion.columns
            };
            const childItemCodeIdx = (cachedUnion.columns || []).indexOf('Item_Code');
            cachedUnion.data.forEach(row => {
                if (childItemCodeIdx >= 0) {
                    itemCodesNeeded.push(row[childItemCodeIdx]);
                }
            });
        }
    }
    
    // Load descriptions for all needed items (batched efficiently)
    await loadDescriptionsForItems(dbName, itemCodesNeeded);
    
    // Second pass: expand union items using cached descriptions
    for (const item of items) {
        const itemRef = itemRefIdx >= 0 ? item[itemRefIdx] : '';
        
        if (itemRef && itemRef.includes('-') && unionResults[itemRef]) {
            const unionData = unionResults[itemRef];
            const unionColumns = unionData.columns || [];
            const childItemCodeIdx = unionColumns.indexOf('Item_Code');
            let unionQtyIdx = unionColumns.indexOf('Qty_New');
            if (unionQtyIdx < 0) unionQtyIdx = unionColumns.indexOf('Quantity');
            
            for (const childRow of unionData.data) {
                const childItemCode = childItemCodeIdx >= 0 ? childRow[childItemCodeIdx] : '';
                const unionQty = unionQtyIdx >= 0 ? parseFloat(childRow[unionQtyIdx]) || 1 : 1;
                // Use cached description or fall back to item code
                const childDescription = itemDescriptionCache[childItemCode] || childItemCode;
                
                // Create new item row with multiplied quantities
                const newItem = [...item];
                newItem[itemRefIdx] = childItemCode;
                newItem[descIdx] = childDescription;
                newItem[qtyNewIdx] = (parseFloat(item[qtyNewIdx]) || 0) * unionQty;
                newItem[qtyTransIdx] = (parseFloat(item[qtyTransIdx]) || 0) * unionQty;
                
                expandedItems.push(newItem);
            }
        } else {
            // Not a union item, keep as is
            expandedItems.push(item);
        }
    }
    
    return expandedItems;
}

async function generateBOQ() {
    const dbName = sessionStorage.getItem('selectedDb');
    if (!dbName) return;

    const tableBody = document.getElementById('boq-table-body');
    const generateBtn = document.getElementById('boq-generate-btn');
    
    // Show loading indicator
    tableBody.innerHTML = '<tr><td colspan="9" style="text-align: center; padding: 2rem;"><div class="loading-spinner"></div><div style="margin-top: 1rem;">Generating report, please wait...</div></td></tr>';
    generateBtn.disabled = true;
    generateBtn.textContent = 'Generating...';

    const groupBy = document.getElementById('boq-group-by')?.value || 'area';
    const level3Filter = document.getElementById('boq-level3-filter')?.value || '';
    const level2Filter = document.getElementById('boq-level2-filter')?.value || '';
    const level1Filter = document.getElementById('boq-level1-filter')?.value || '';
    const roomFilter = document.getElementById('boq-room-filter')?.value || '';
    const includeIgnored = document.getElementById('boq-include-ignored')?.checked || false;

    // Determine which filter to use (most specific wins)
    let filterCol = '';
    let filterVal = '';
    
    if (roomFilter) {
        filterCol = 'Room_Code';
        filterVal = roomFilter;
    } else if (level1Filter) {
        // Need to get rooms for this level1, then filter by Room_Code
        // For now, we'll fetch all and filter client-side
    } else if (level2Filter) {
        // Similar cascading logic needed
    } else if (level3Filter) {
        // Similar cascading logic needed
    }

    // Fetch item_schedule data
    let url = `/api/table/${encodeURIComponent(dbName)}/item_schedule?limit=50000`;
    if (filterCol && filterVal) {
        url += `&filter_col=${filterCol}&filter_val=${encodeURIComponent(filterVal)}`;
    }

    // Also fetch room data to get hierarchy information for filtering
    const roomsPromise = fetch(`/api/table/${encodeURIComponent(dbName)}/Room_schedule?limit=5000`)
        .then(r => r.json());

    // Fetch item descriptions to get Unit_Cost
    const itemDescPromise = fetch(`/api/table/${encodeURIComponent(dbName)}/Item_descriptions?limit=100000`)
        .then(r => r.json());

    // Fetch ERM data to get Group and Cat
    const ermPromise = fetch(`/api/table/${encodeURIComponent(dbName)}/ERM?limit=100000`)
        .then(r => r.json());

    try {
        const [itemData, roomData, itemDescData, ermData] = await Promise.all([
            fetch(url).then(r => r.json()), 
            roomsPromise,
            itemDescPromise,
            ermPromise
        ]);
        
            const rooms = roomData.data || [];
            const roomColumns = roomData.columns || [];

            // Build room hierarchy map
            const roomMap = {};
            const roomCodeIdx = roomColumns.indexOf('Room_Code');
            const parentAreaIdx = roomColumns.indexOf('ParentArea');
            const roomDescIdx = roomColumns.indexOf('Project_Room_Description');

            rooms.forEach(room => {
                if (roomCodeIdx >= 0) {
                    roomMap[room[roomCodeIdx]] = {
                        parentArea: parentAreaIdx >= 0 ? room[parentAreaIdx] : '',
                        description: roomDescIdx >= 0 ? room[roomDescIdx] : ''
                    };
                }
            });

            // Expand union items BEFORE processing
            let items = itemData.data || [];
            const columns = itemData.columns || [];
            
            items = await expandUnionItems(dbName, items, columns);

            // Build cost map
            const costMap = {};
            const itemDescs = itemDescData.data || [];
            const itemDescCols = itemDescData.columns || [];
            const adbRefIdx = itemDescCols.indexOf('ADB_Ref');
            const unitCostIdx = itemDescCols.indexOf('Unit_Cost');

            itemDescs.forEach(row => {
                if (adbRefIdx >= 0 && unitCostIdx >= 0) {
                    costMap[row[adbRefIdx]] = parseFloat(row[unitCostIdx]) || 0;
                }
            });

            // Build ERM map
            const ermMap = {};
            const ermItems = ermData.data || [];
            const ermCols = ermData.columns || [];
            const adbCodeIdx = ermCols.findIndex(c => c.toLowerCase() === 'adb_code');
            const groupIdx = ermCols.findIndex(c => c.toLowerCase() === 'group');
            const catIdx = ermCols.findIndex(c => c.toLowerCase() === 'cat');

            ermItems.forEach(row => {
                if (adbCodeIdx >= 0) {
                    ermMap[row[adbCodeIdx]] = {
                        group: groupIdx >= 0 ? row[groupIdx] : '',
                        cat: catIdx >= 0 ? row[catIdx] : ''
                    };
                }
            });

            // Find column indices
            const itemRefIdx = columns.indexOf('Item_Ref');
            const descIdx = columns.indexOf('Item_Description');
            const roomCodeItemIdx = columns.indexOf('Room_Code');
            const qtyNewIdx = columns.indexOf('Qty_New');
            const qtyTransIdx = columns.indexOf('Qty_Trans');
            const notesIdx = columns.indexOf('Notes');
            const ignoreIdx = columns.indexOf('Ignore_flag');

            // Process and filter data
            let processed = items
                .filter(row => {
                    // Skip if ignore flag is Y (unless includeIgnored is true)
                    if (!includeIgnored && ignoreIdx >= 0 && row[ignoreIdx] === 'Y') {
                        return false;
                    }
                    // Skip if both quantities are zero
                    const qtyNew = qtyNewIdx >= 0 ? parseFloat(row[qtyNewIdx]) || 0 : 0;
                    const qtyTrans = qtyTransIdx >= 0 ? parseFloat(row[qtyTransIdx]) || 0 : 0;
                    if (qtyNew === 0 && qtyTrans === 0) {
                        return false;
                    }
                    return true;
                })
                .map(row => {
                    const roomCode = roomCodeItemIdx >= 0 ? row[roomCodeItemIdx] : '';
                    const roomInfo = roomMap[roomCode] || {};
                    return {
                        itemRef: itemRefIdx >= 0 ? row[itemRefIdx] : '',
                        description: descIdx >= 0 ? row[descIdx] : '',
                        roomCode: roomCode,
                        roomDescription: roomInfo.description || '',
                        parentArea: roomInfo.parentArea || '',
                        qtyNew: qtyNewIdx >= 0 ? parseFloat(row[qtyNewIdx]) || 0 : 0,
                        qtyTrans: qtyTransIdx >= 0 ? parseFloat(row[qtyTransIdx]) || 0 : 0,
                        notes: notesIdx >= 0 ? row[notesIdx] : ''
                    };
                });

            // Client-side filtering by hierarchy if needed (when room not directly filtered)
            if (!roomFilter && (level1Filter || level2Filter || level3Filter)) {
                // We need to fetch the hierarchy to properly filter
                // For level1Filter: filter rooms where ParentArea = level1Filter
                if (level1Filter) {
                    processed = processed.filter(item => item.parentArea === level1Filter);
                }
                // For level2/level3, we'd need to traverse up the hierarchy
                // This requires fetching Areaslevel1 data to check its parent
                // For simplicity now, if level1 is not set, we'll show all
            }

            // Group by selected criteria and consolidate items
            const grouped = {};
            processed.forEach(item => {
                let key;
                if (groupBy === 'room') {
                    key = item.roomCode || 'Unknown Room';
                } else if (groupBy === 'item') {
                    key = item.itemRef || 'Unknown Item';
                } else { // area
                    key = item.parentArea || 'Unknown Area';
                }
                
                if (!grouped[key]) {
                    grouped[key] = {};
                }
                
                // Consolidate by item reference
                const itemKey = `${item.itemRef}||${item.description}`;
                if (!grouped[key][itemKey]) {
                    grouped[key][itemKey] = {
                        itemRef: item.itemRef,
                        description: item.description,
                        qtyNew: 0,
                        qtyTrans: 0
                    };
                }
                grouped[key][itemKey].qtyNew += item.qtyNew;
                grouped[key][itemKey].qtyTrans += item.qtyTrans;
            });

            // Render table
            const tableBody = document.getElementById('boq-table-body');
            tableBody.innerHTML = '';

            if (Object.keys(grouped).length === 0) {
                tableBody.innerHTML = '<tr><td colspan="9">No items found matching the selected filters.</td></tr>';
                return;
            }

            let grandTotalQtyNew = 0;
            let grandTotalQtyTrans = 0;
            let grandTotalCost = 0;

            for (const [groupKey, groupItemsMap] of Object.entries(grouped).sort()) {
                // Group header row
                const headerRow = document.createElement('tr');
                headerRow.style.backgroundColor = 'var(--secondary-bg)';
                headerRow.style.fontWeight = 'bold';
                headerRow.innerHTML = `<td colspan="9">${groupKey}</td>`;
                tableBody.appendChild(headerRow);

                let groupQtyNew = 0;
                let groupQtyTrans = 0;
                let groupCost = 0;

                // Convert map to array and sort by item ref
                const consolidatedItems = Object.values(groupItemsMap).sort((a, b) => 
                    a.itemRef.localeCompare(b.itemRef)
                );

                // Item rows (consolidated)
                consolidatedItems.forEach(item => {
                    const unitCost = costMap[item.itemRef] || 0;
                    const totalCost = item.qtyNew * unitCost;
                    const ermInfo = ermMap[item.itemRef] || { group: '', cat: '' };

                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td>${item.itemRef}</td>
                        <td>${item.description}</td>
                        <td>${ermInfo.group || '-'}</td>
                        <td>${ermInfo.cat || '-'}</td>
                        <td style="text-align: right;">${item.qtyNew.toFixed(2)}</td>
                        <td style="text-align: right;">${item.qtyTrans.toFixed(2)}</td>
                        <td style="text-align: right;">${(item.qtyNew + item.qtyTrans).toFixed(2)}</td>
                        <td style="text-align: right;">£${unitCost.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td style="text-align: right;">£${totalCost.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    `;
                    tableBody.appendChild(row);

                    groupQtyNew += item.qtyNew;
                    groupQtyTrans += item.qtyTrans;
                    groupCost += totalCost;
                });

                // Group subtotal
                const subtotalRow = document.createElement('tr');
                subtotalRow.style.fontWeight = '600';
                subtotalRow.style.backgroundColor = 'var(--bg-hover)';
                subtotalRow.innerHTML = `
                    <td colspan="4">Subtotal</td>
                    <td style="text-align: right;">${groupQtyNew.toFixed(2)}</td>
                    <td style="text-align: right;">${groupQtyTrans.toFixed(2)}</td>
                    <td style="text-align: right;">${(groupQtyNew + groupQtyTrans).toFixed(2)}</td>
                    <td></td>
                    <td style="text-align: right;">£${groupCost.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                `;
                tableBody.appendChild(subtotalRow);

                grandTotalQtyNew += groupQtyNew;
                grandTotalQtyTrans += groupQtyTrans;
                grandTotalCost += groupCost;
            }

            // Grand total row
            const grandTotalRow = document.createElement('tr');
            grandTotalRow.classList.add('total-row');
            grandTotalRow.innerHTML = `
                <td colspan="4">GRAND TOTAL</td>
                <td style="text-align: right;">${grandTotalQtyNew.toFixed(2)}</td>
                <td style="text-align: right;">${grandTotalQtyTrans.toFixed(2)}</td>
                <td style="text-align: right;">${(grandTotalQtyNew + grandTotalQtyTrans).toFixed(2)}</td>
                <td></td>
                <td style="text-align: right;">£${grandTotalCost.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            `;
            tableBody.appendChild(grandTotalRow);
    } catch (err) {
        console.error('Error generating BOQ:', err);
        tableBody.innerHTML = '<tr><td colspan="9">Failed to generate Bill of Quantity: ' + err.message + '</td></tr>';
    } finally {
        // Re-enable button
        const generateBtn = document.getElementById('boq-generate-btn');
        if (generateBtn) {
            generateBtn.disabled = false;
            generateBtn.textContent = 'Generate Report';
        }
    }
}

function exportBOQAsCSV() {
    const table = document.querySelector('.boq-table');
    let csv = [];
    
    table.querySelectorAll('tr').forEach(row => {
        const cols = [];
        row.querySelectorAll('td, th').forEach(col => {
            cols.push('"' + col.textContent.replace(/"/g, '""') + '"');
        });
        csv.push(cols.join(','));
    });

    const csvContent = csv.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'Bill_of_Quantity.csv';
    link.click();
    window.URL.revokeObjectURL(url);
}

let xlsxLoadPromise = null;

function loadXlsxLibrary() {
    // Lazy-load SheetJS once; reuse the same promise for subsequent calls
    if (window.XLSX) return Promise.resolve();
    if (!xlsxLoadPromise) {
        xlsxLoadPromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
            script.onload = () => resolve();
            script.onerror = () => reject(new Error('Failed to load Excel exporter'));
            document.head.appendChild(script);
        });
    }
    return xlsxLoadPromise;
}

function exportBOQAsExcel() {
    const table = document.querySelector('.boq-table');
    if (!table) {
        alert('No Bill of Quantity table to export yet.');
        return;
    }

    loadXlsxLibrary()
        .then(() => {
            const workbook = XLSX.utils.book_new();
            const worksheet = XLSX.utils.table_to_sheet(table);
            XLSX.utils.book_append_sheet(workbook, worksheet, 'BOQ');
            XLSX.writeFile(workbook, 'Bill_of_Quantity.xlsx');
        })
        .catch(err => {
            console.error('Excel export failed:', err);
            alert('Excel export failed. Please try CSV instead.');
        });
}

function exportBOQAsPDF() {
    const table = document.querySelector('.boq-table');
    if (!table) {
        alert('No Bill of Quantity table to export yet.');
        return;
    }

    loadPdfLibraries()
        .then(() => {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });

            doc.setFontSize(14);
            doc.text('Bill of Quantity', 40, 40);

            const headers = Array.from(table.querySelectorAll('thead th')).map(th => th.textContent.trim());

            const body = Array.from(table.querySelectorAll('tbody tr')).map(row => {
                const cells = Array.from(row.querySelectorAll('td'));
                if (cells.length === 1 && cells[0].colSpan >= 9) {
                    // Group or grand total row with a single spanning cell
                    return [cells[0].textContent.trim(), '', '', '', '', '', '', '', ''];
                }
                // Ensure exactly 9 columns
                return cells.slice(0, 9).map(td => td.textContent.trim());
            });

            doc.autoTable({
                head: [headers],
                body,
                startY: 60,
                styles: { fontSize: 9, cellPadding: 4 },
                headStyles: { fillColor: [52, 73, 94], textColor: 255 },
                alternateRowStyles: { fillColor: [245, 245, 245] },
            });

            doc.save('Bill_of_Quantity.pdf');
        })
        .catch(err => {
            console.error('PDF export failed:', err);
            alert('PDF export failed. Please try again or use Print as a fallback.');
        });
}

let pdfLoadPromise = null;

function loadPdfLibraries() {
    // Load jsPDF + autotable once; reuse the promise
    if (window.jspdf && window.jspdf.jsPDF && window.jspdf.autoTable) return Promise.resolve();
    if (pdfLoadPromise) return pdfLoadPromise;

    pdfLoadPromise = new Promise((resolve, reject) => {
        const jspdfScript = document.createElement('script');
        jspdfScript.src = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js';
        jspdfScript.onload = () => {
            const autoTableScript = document.createElement('script');
            autoTableScript.src = 'https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.1/dist/jspdf.plugin.autotable.min.js';
            autoTableScript.onload = () => resolve();
            autoTableScript.onerror = () => reject(new Error('Failed to load jsPDF AutoTable'));
            document.head.appendChild(autoTableScript);
        };
        jspdfScript.onerror = () => reject(new Error('Failed to load jsPDF'));
        document.head.appendChild(jspdfScript);
    });

    return pdfLoadPromise;
}
