/**
 * @file script.js
 * @description Core JavaScript logic for the CSV Data Analyzer.
 * This script handles:
 * 1. CSV file parsing (using PapaParse).
 * 2. Data processing and comparison between two user-selected periods.
 * 3. "Smart" aggregation to select the best data row (max revenue) when duplicates are found.
 * 4. Dynamic rendering of the comparison results into an HTML table.
 * 5. Filtering results by "Flag" status and "CS Manager".
 * 6. Exporting the filtered table view to a new CSV file.
 * 7. Generating a plain-text summary report for managers.
 */

// ===== 1. INITIALIZATION & DOM SETUP =====

lucide.createIcons(); // Initialize Lucide icons

// --- Global State Variables ---
let parsedData = []; // Stores the full, raw data from the CSV file.
let numericHeaders = []; // Stores the names (keys) of all numeric columns (metrics).
let lastRenderedRows = []; // Caches the complete result of the last "Compare" action, before filters.
let currentlyDisplayedRows = []; // Stores the filtered data that is currently visible in the table.
let periodColumnName = ''; // The name of the main time-series column (e.g., 'Date', 'Week', 'Month').
let revenueColumnName = ''; // The name of the primary metric used for flagging (e.g., 'Revenue').

// --- DOM Element Cache ---
const csvInput = document.getElementById("csvFile");
const compareBtn = document.getElementById("compareBtn");
const exportBtn = document.getElementById("exportBtn");
const resultsTable = document.getElementById("resultsTable");
const comparisonTypeSelect = document.getElementById("comparisonType");
const period1Select = document.getElementById("period1");
const period2Select = document.getElementById("period2");
const filterSelect = document.getElementById("filterSelect");
const managerFilterSelect = document.getElementById("managerFilterSelect");
const generateReportBtn = document.getElementById("generateReportBtn");
const reportOutput = document.getElementById("reportOutput");


// ===== 2. CSV PARSING & DATA PREPARATION =====

/**
 * Attaches an event listener to the file input to parse the selected CSV file.
 * This is the primary entry point for loading data.
 */
csvInput.addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (!file) return;

    Papa.parse(file, {
        header: true, // Treat the first row as headers.
        skipEmptyLines: true, // Ignore empty lines.
        dynamicTyping: true, // Automatically convert numbers and booleans.
        complete: function (results) {
            if (!results.data.length || !results.data[0]) {
                alert("File is empty or contains invalid data.");
                return;
            }

            const headers = Object.keys(results.data[0]);

            // Auto-detect the primary period column. Must be one of these.
            if (headers.includes('Date')) periodColumnName = 'Date';
            else if (headers.includes('Week')) periodColumnName = 'Week';
            else if (headers.includes('Month')) periodColumnName = 'Month';
            else {
                alert('Error: Could not find a period column (must be named Date, Month, or Week).');
                return;
            }

            // --- Business Logic Filter ---
            // Filter out test/dev rows (e.g., 'TDS') and rows without a valid period or entity.
            const tdsPattern = /^TDS\s+\d+$/;
            parsedData = results.data.filter(row =>
                row &&
                row[periodColumnName] != null && // Must have a period
                (row["Site/Application"] || row["Ad system"]) && // Must have an entity
                !tdsPattern.test(row["Site/Application"] || "") // Must not be a 'TDS' row
            );

            if (parsedData.length === 0) {
                 alert(`Error: Found 0 rows with data. Please check that the file contains the column '${periodColumnName}' and that it is filled, or that all rows were not filtered out.`);
                 return;
            }

            // Dynamically identify all columns that contain numeric data (metrics).
            const nonMetricCols = ['Date', 'Month', 'Week', 'Site/Application', 'Customer Success Manager', 'Client', 'Ad system'];
            numericHeaders = Object.keys(results.data[0]).filter(key =>
                !nonMetricCols.includes(key) && typeof results.data[0][key] === 'number');

            // Find the primary metric for flagging (assumed to be 'revenue').
            revenueColumnName = numericHeaders.find(h => h.toLowerCase().includes('revenue'));
            if (!revenueColumnName) {
                // Fallback to the first numeric header if 'revenue' isn't found.
                revenueColumnName = numericHeaders.length > 0 ? numericHeaders[0] : '';
                alert(`Warning: 'Revenue' column not found. The flag will be based on the first metric: '${revenueColumnName}'.`);
            }

            // Populate dropdowns with data from the file.
            populatePeriodSelectors();
            populateManagerFilter();
            alert(`File loaded successfully. Found ${parsedData.length} rows. The flag will be based on the '${revenueColumnName}' column.`);
        },
    });
});


/**
 * Populates the 'managerFilterSelect' dropdown with unique, sorted manager names from the data.
 */
function populateManagerFilter() {
    managerFilterSelect.innerHTML = '<option value="all">All Managers</option>';
    const managerSet = new Set(
        parsedData
            .map(row => row['Customer Success Manager'])
            .filter(Boolean) // Remove empty/null values
    );
    
    const sortedManagers = Array.from(managerSet).sort();
    sortedManagers.forEach(manager => {
        managerFilterSelect.add(new Option(manager, manager));
    });
}

/**
 * Helper function to determine the type of data in the period column.
 * This informs how the periods should be sorted.
 * @param {string|number} periodValue - The value from the period column (e.g., "January 2025", "2025-10-27").
 * @returns {string} - The detected type ('numeric', 'monthly_name', 'daily', 'unknown').
 */
function detectDataType(periodValue) {
    if (typeof periodValue !== 'string' && !isNaN(periodValue)) return 'numeric';
    // Matches "January 2025", "February", etc.
    if (typeof periodValue === 'string' && /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\b/i.test(periodValue)) return 'monthly_name';
    // Attempts to parse as a date.
    if (typeof periodValue === 'string' && !isNaN(new Date(periodValue).getTime())) return 'daily';
    return 'unknown';
}

/**
 * Populates the period1 and period2 dropdowns with unique, sorted period values.
 * Sorting logic is based on the detected data type for user-friendliness.
 */
function populatePeriodSelectors() {
    const periodSet = new Set(parsedData.map(row => row[periodColumnName]));
    let availablePeriods = Array.from(periodSet);
    const dataType = availablePeriods.length > 0 ? detectDataType(availablePeriods[0]) : 'unknown';
    
    // Sort available periods based on their data type for a user-friendly order.
    if (dataType === 'monthly_name') {
        // Sorts "Month YYYY" strings in reverse chronological order.
        const monthOrder = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        availablePeriods.sort((a, b) => {
            const [monthA, yearA] = a.split(' ');
            const [monthB, yearB] = b.split(' ');
            if (yearA !== yearB) return yearB - yearA; // Newer year first
            return monthOrder.indexOf(monthB) - monthOrder.indexOf(monthA); // Newer month first
        });
    } else if (dataType === 'numeric') {
        // Sorts numbers (like weeks or years) in descending order.
        availablePeriods.sort((a, b) => Number(b) - Number(a));
    } else if (dataType === 'daily') {
        // Sorts dates (like "2025-10-27") in reverse chronological order.
        availablePeriods.sort((a, b) => new Date(b) - new Date(a));
    }
    // 'unknown' type will be sorted alphanumerically by default.

    period1Select.innerHTML = "";
    period2Select.innerHTML = "";
    availablePeriods.forEach(period => {
        period1Select.add(new Option(period, period));
        period2Select.add(new Option(period, period));
    });

    // Default to comparing the two most recent periods.
    if (period1Select.options.length > 1) {
        period1Select.selectedIndex = 1; // e.g., "Period 1"
        period2Select.selectedIndex = 0; // e.g., "Period 2"
    }
}


// ===== 3. CORE COMPARISON LOGIC =====

/**
 * Attaches an event listener to the "Compare" button to process the data.
 * This is the main function of the application. It aggregates, compares, and flags data.
 */
compareBtn.addEventListener("click", () => {
    const period1 = period1Select.value;
    const period2 = period2Select.value;
    const groupBy = comparisonTypeSelect.value === 'Site/Application' ? 'Site/Application' : 'Ad system';
    if (!period1 || !period2 || period1 === period2) {
        alert("Please select two different periods to compare.");
        return;
    }
    
    // --- Smart Data Aggregation ---
    // This loop builds the data structure for comparison.
    // CRITICAL: If multiple rows are found for the same entity (key) and period,
    // it selects ONLY the row with the highest value in the `revenueColumnName` column.
    // This prevents old/zero-value/duff data from skewing the comparison.
    const dataByEntity = {};
    parsedData.forEach(row => {
        const period = row[periodColumnName];
        // 1. Skip rows not in the selected periods
        if (period != period1 && period != period2) {
            return;
        }

        const key = row[groupBy];
        if (!key) return; // Skip rows without a group-by key

        // 2. Prepare data from the current row
        const newMetrics = {};
        numericHeaders.forEach(h => newMetrics[h] = row[h] || 0);
        const newMeta = { manager: row['Customer Success Manager'], client: row['Client'] };
        const newRevenue = newMetrics[revenueColumnName] || 0;

        // 3. Ensure a top-level object exists for this entity
        if (!dataByEntity[key]) {
            dataByEntity[key] = {};
        }

        // 4. Check if an entry already exists for this entity AND this period
        const existingEntry = dataByEntity[key][period];

        if (!existingEntry) {
            // 4a. This is the first entry for this key/period. Add it.
            dataByEntity[key][period] = {
                metrics: newMetrics,
                meta: newMeta
            };
        } else {
            // 4b. An entry already exists. Compare revenues.
            const existingRevenue = existingEntry.metrics[revenueColumnName] || 0;
            if (newRevenue > existingRevenue) {
                // The new row has more revenue. Replace the old one.
                dataByEntity[key][period] = {
                    metrics: newMetrics,
                    meta: newMeta
                };
            }
            // Else: The existing row has more or equal revenue. Do nothing, keeping the best one.
        }
    });

    // --- Comparison & Flagging ---
    // Now that data is aggregated, loop through each entity and compare the two periods.
    const results = [];
    for (const key in dataByEntity) {
        const entityData1 = dataByEntity[key][period1]; // Data for the "older" period
        const entityData2 = dataByEntity[key][period2]; // Data for the "newer" period
        const metricsComparison = {};

        if (entityData1 && entityData2) {
            // Case 1: Data exists for both periods.
            numericHeaders.forEach(metric => {
                const val1 = entityData1.metrics[metric] || 0;
                const val2 = entityData2.metrics[metric] || 0;
                // Calculate percentage change
                const changePct = val1 !== 0 ? (val2 - val1) / val1 : (val2 > 0 ? 1 : 0);
                metricsComparison[metric] = { val1, val2, changePct };
            });

            // Calculate flagging logic based on the primary revenue metric.
            const rev1 = entityData1.metrics[revenueColumnName] || 0;
            const rev2 = entityData2.metrics[revenueColumnName] || 0;
            const dropAmt = rev1 - rev2; // Positive value indicates a drop
            const dropPct = rev1 !== 0 ? (rev1 - rev2) / rev1 : 0; // Positive value indicates a drop
            
            // --- Flagging Thresholds (Business Logic) ---
            let amountThreshold = 100;
            const percentThreshold = 0.05; // 5% drop
            if (periodColumnName === 'Date') amountThreshold = 15;
            else if (periodColumnName === 'Week') amountThreshold = 50;
            else if (periodColumnName === 'Month') amountThreshold = 100;
            
            // Flag "YES" if revenue dropped AND the drop was significant.
            const flag = (rev2 < rev1 && dropAmt > amountThreshold && dropPct > percentThreshold) ? "YES" : "";
            results.push({ key, meta: entityData1.meta, metrics: metricsComparison, flag });
        
        } else {
            // Case 2: Data is missing for one period ("NULL" case).
            const flag = "NULL";
            const existingData = entityData1 || entityData2; // Get whichever data object exists
            numericHeaders.forEach(metric => {
                const val1 = entityData1 ? entityData1.metrics[metric] || 0 : 0;
                const val2 = entityData2 ? entityData2.metrics[metric] || 0 : 0;
                const changePct = val1 !== 0 ? (val2 - val1) / val1 : (val2 > 0 ? 1 : 0);
                metricsComparison[metric] = { val1, val2, changePct };
            });
            results.push({ key, meta: existingData.meta, metrics: metricsComparison, flag });
        }
    }

    // --- Finalize and Render ---
    lastRenderedRows = results; // Cache the full, unfiltered results
    // Reset filters to their default state
    filterSelect.value = "all";
    managerFilterSelect.value = "all";
    // Apply filters (which will be "all") and render the table
    applyFiltersAndRender();
});


// ===== 4. FILTERING & TABLE RENDERING =====

/**
 * Applies all active filters (flag status, manager) to the `lastRenderedRows`
 * and then calls `renderTable()` to update the UI.
 * This function is called every time a filter dropdown is changed.
 */
function applyFiltersAndRender() {
    const flagFilterValue = filterSelect.value;
    const managerFilterValue = managerFilterSelect.value;

    // Start with the full, unfiltered dataset from the last comparison
    let filteredRows = [...lastRenderedRows];

    // Apply Flag filter
    switch (flagFilterValue) {
        case 'yes':
            filteredRows = filteredRows.filter(r => r.flag === 'YES');
            break;
        case 'null':
            filteredRows = filteredRows.filter(r => r.flag === 'NULL');
            break;
        case 'yes_null':
            filteredRows = filteredRows.filter(r => r.flag === 'YES' || r.flag === 'NULL');
            break;
        // 'all' case does nothing
    }

    // Apply Manager filter
    if (managerFilterValue !== 'all') {
        filteredRows = filteredRows.filter(r => r.meta.manager === managerFilterValue);
    }
    
    // Store the filtered results for export and reporting
    currentlyDisplayedRows = filteredRows;
    
    // Re-render the table with the filtered data
    const groupBy = comparisonTypeSelect.value === 'Site/Application' ? 'Site/Application' : 'Ad system';
    renderTable(currentlyDisplayedRows, groupBy);
}

// --- Filter Event Listeners ---
filterSelect.addEventListener("change", applyFiltersAndRender);
managerFilterSelect.addEventListener("change", applyFiltersAndRender);


/**
 * Renders the provided data array into the main HTML table.
 * @param {Array} data - The array of data to render (usually `currentlyDisplayedRows`).
 * @param {string} groupBy - The entity being grouped by (e.g., 'Site/Application').
 */
function renderTable(data, groupBy) {
    const thead = resultsTable.querySelector("thead");
    const tbody = resultsTable.querySelector("tbody");

    // Build table header dynamically
    let headerHtml = `<th>${groupBy}</th>`;
    if (groupBy === 'Site/Application') {
        headerHtml += `<th>CS Manager</th><th>Client</th>`;
    }
    headerHtml += `<th>Metric</th><th>Period 1 (${period1Select.value})</th><th>Period 2 (${period2Select.value})</th><th>% Change</th><th>Flag (on ${revenueColumnName})</th>`;
    thead.innerHTML = `<tr>${headerHtml}</tr>`;

    // --- Render Table Body ---
    tbody.innerHTML = "";
    if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8">No data matching the selected filters.</td></tr>`;
        return;
    }

    data.forEach(item => {
        const numMetrics = Object.keys(item.metrics).length;
        let isFirstRowForEntity = true; // Flag to handle cell merging (rowspan)

        for (const metricName in item.metrics) {
            const metricData = item.metrics[metricName];
            const tr = document.createElement("tr");
            let rowHtml = '';

            // This logic handles merging cells (rowspan) for a cleaner view.
            if (isFirstRowForEntity) {
                // Add the entity name and metadata, spanning multiple rows
                rowHtml += `<td rowspan="${numMetrics}">${item.key}</td>`;
                 if (groupBy === 'Site/Application') {
                    rowHtml += `<td rowspan="${numMetrics}">${item.meta.manager || ''}</td>`;
                    rowHtml += `<td rowspan="${numMetrics}">${item.meta.client || ''}</td>`;
                }
            }

            // Apply conditional styling for negative/positive change
            const changeColor = metricData.changePct < 0 ? 'color:red;' : 'color:lightgreen;';
            
            rowHtml += `<td>${metricName}</td>`;
            rowHtml += `<td>${metricData.val1.toFixed(2)}</td>`;
            rowHtml += `<td>${metricData.val2.toFixed(2)}</td>`;
            rowHtml += `<td style="${changeColor}">${(metricData.changePct * 100).toFixed(1)}%</td>`;

            if (isFirstRowForEntity) {
                 // Add the flag, spanning multiple rows
                 const flagClass = item.flag === 'YES' ? 'flagged' : (item.flag === 'NULL' ? 'nulled' : '');
                 rowHtml += `<td rowspan="${numMetrics}" class="${flagClass}">${item.flag}</td>`;
            }

            tr.innerHTML = rowHtml;
            tbody.appendChild(tr);
            isFirstRowForEntity = false; // Subsequent rows for this entity won't get the merged cells
        }
    });
}


// ===== 5. EXPORT & REPORT GENERATION =====

/**
 * Attaches an event listener to the "Export" button.
 * Generates a CSV file from the `currentlyDisplayedRows`.
 */
exportBtn.addEventListener("click", () => {
    if (currentlyDisplayedRows.length === 0) {
        alert("No data to export.");
        return;
    }

    const groupBy = comparisonTypeSelect.value === 'Site/Application' ? 'Site/Application' : 'Ad system';
    const isSiteMode = groupBy === 'Site/Application';

    // 1. Build CSV headers dynamically based on the current group-by mode
    const headers = [
        groupBy,
        'CS Manager',
        'Client',
        'Metric',
        `Period 1 (${period1Select.value})`,
        `Period 2 (${period2Select.value})`,
        '% Change',
        `Flag (on ${revenueColumnName})`
    ];
    if (!isSiteMode) {
        // Remove CS Manager and Client if not grouping by Site/Application
        headers.splice(1, 2); 
    }

    const csvRows = [];
    csvRows.push(headers.join(',')); // Add headers as the first row

    // 2. Build CSV rows from the displayed data
    currentlyDisplayedRows.forEach(item => {
        for (const metricName in item.metrics) {
            const metricData = item.metrics[metricName];
            const row = [
                item.key,
                // Conditionally add manager and client data
                ...(isSiteMode ? [item.meta.manager || '', item.meta.client || ''] : []),
                metricName, 
                metricData.val1.toFixed(2),
                metricData.val2.toFixed(2),
                `${(metricData.changePct * 100).toFixed(2)}%`, // Use 2 decimal places for export
                item.flag || ''
            ];
            
            // Wrap all values in quotes and escape existing quotes to ensure CSV integrity
            const formattedRow = row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(',');
            csvRows.push(formattedRow);
        }
    });

    // 3. Create and Download File
    const csvContent = csvRows.join('\n');
    
    // \uFEFF is a UTF-8 BOM (Byte Order Mark) to ensure Excel opens the file
    // with correct character encoding (especially for Cyrillic or other non-Latin characters).
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    
    // Create a temporary link to trigger the download
    const link = document.createElement("a");
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", "comparison_export.csv");
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click(); // Programmatically click the link to start download
        document.body.removeChild(link); // Clean up the temporary link
    }
});


/**
 * Attaches an event listener to the "Generate Report" button.
 * Generates a plain-text summary from `currentlyDisplayedRows` and
 * displays it in the `reportOutput` textarea.
 */
generateReportBtn.addEventListener("click", () => {
    if (currentlyDisplayedRows.length === 0) {
        alert("No data available for report generation. Please perform a comparison first.");
        reportOutput.value = ""; 
        return;
    }

    let reportText = ""; 
    // Iterate over the currently visible (filtered) rows
    currentlyDisplayedRows.forEach(item => {
        const appName = item.key;
        const managerName = item.meta.manager || 'Not specified'; 
        const clientName = item.meta.client || 'Not specified';
        
        // Get data for the primary revenue metric
        const revenueMetric = item.metrics[revenueColumnName];
        if (!revenueMetric) return; // Skip if this entity has no revenue data

        const period1Value = revenueMetric.val1;
        const period2Value = revenueMetric.val2;
        const dollarChange = period2Value - period1Value;
        const percentChange = (revenueMetric.changePct * 100).toFixed(2) + '%';
        
        // Format the currency using Russian locale (commas for decimals, $ sign).
        const formattedDollarChange = dollarChange.toLocaleString('ru-RU', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 2
        });
        
        // Build the text entry for this item
        const entryText = `${appName}
CS Manager - ${managerName}
Client - ${clientName}
% Change - ${percentChange}
$ Change - ${formattedDollarChange}
------------------------------------
`;
        
        reportText += entryText;
    });

    if (reportText.trim() === "") {
        reportOutput.value = "There are no suitable records in the current selection for generating the report.";
    } else {
        reportOutput.value = reportText.trim();
    }
});
