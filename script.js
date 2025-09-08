lucide.createIcons();

// global variables for storing data and state
let parsedData = [];
let numericHeaders = [];
let lastRenderedRows = []; // slways stores the FULL result of the last comparison
let currentlyDisplayedRows = []; // stores the filtered result that is visible to the user
let periodColumnName = '';
let revenueColumnName = '';

// access to all controls on the page
const csvInput = document.getElementById("csvFile");
const compareBtn = document.getElementById("compareBtn");
const exportBtn = document.getElementById("exportBtn");
const resultsTable = document.getElementById("resultsTable");
const comparisonTypeSelect = document.getElementById("comparisonType");
const period1Select = document.getElementById("period1");
const period2Select = document.getElementById("period2");

// filter elements
const filterSelect = document.getElementById("filterSelect");
const managerFilterSelect = document.getElementById("managerFilterSelect");

// parsing a CSV file when it is selected
csvInput.addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (!file) return;
    Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: true,
        complete: function (results) {
            if (!results.data.length || !results.data[0]) {
                alert("File is empty or contains invalid data.");
                return;
            }
            const headers = Object.keys(results.data[0]);
            if (headers.includes('Date')) periodColumnName = 'Date';
            else if (headers.includes('Week')) periodColumnName = 'Week';
            else if (headers.includes('Month')) periodColumnName = 'Month';
            else {
                alert('Error: Could not find a period column (must be named Date, Month, or Week).');
                return;
            }

            const tdsPattern = /^TDS\s+\d+$/;
            parsedData = results.data.filter(row =>
                row &&
                row[periodColumnName] != null &&
                (row["Site/Application"] || row["Ad system"]) &&
                !tdsPattern.test(row["Site/Application"] || "")
            );

            if (parsedData.length === 0) {
                 alert(`Error: Found 0 rows with data. Please check that the file contains the column '${periodColumnName}' and that it is filled, or that all rows were not filtered out.`);
                 return;
            }
            const nonMetricCols = ['Date', 'Month', 'Week', 'Site/Application', 'Customer Success Manager', 'Client', 'Ad system'];
            numericHeaders = Object.keys(results.data[0]).filter(key =>
                !nonMetricCols.includes(key) && typeof results.data[0][key] === 'number');
            revenueColumnName = numericHeaders.find(h => h.toLowerCase().includes('revenue'));
            if (!revenueColumnName) {
                revenueColumnName = numericHeaders.length > 0 ? numericHeaders[0] : '';
                alert(`Warning: 'Revenue' column not found. The flag will be based on the first metric: '${revenueColumnName}'.`);
            }
            populatePeriodSelectors();
            populateManagerFilter();
            alert(`File loaded successfully. Found ${parsedData.length} rows. The flag will be based on the '${revenueColumnName}' column.`);
        },
    });
});


// function for filling the filter by managers
function populateManagerFilter() {
    managerFilterSelect.innerHTML = '<option value="all">All Managers</option>';
    const managerSet = new Set(
        parsedData
            .map(row => row['Customer Success Manager'])
            .filter(Boolean)
    );
    
    const sortedManagers = Array.from(managerSet).sort();
    sortedManagers.forEach(manager => {
        managerFilterSelect.add(new Option(manager, manager));
    });
}

// functions for determining data types and filling period selectors
function detectDataType(periodValue) {
    if (typeof periodValue !== 'string' && !isNaN(periodValue)) return 'numeric';
    if (typeof periodValue === 'string' && /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\b/i.test(periodValue)) return 'monthly_name';
    if (typeof periodValue === 'string' && !isNaN(new Date(periodValue).getTime())) return 'daily';
    return 'unknown';
}

function populatePeriodSelectors() {
    const periodSet = new Set(parsedData.map(row => row[periodColumnName]));
    let availablePeriods = Array.from(periodSet);
    const dataType = availablePeriods.length > 0 ? detectDataType(availablePeriods[0]) : 'unknown';

    if (dataType === 'monthly_name') {
        const monthOrder = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        availablePeriods.sort((a, b) => {
            const [monthA, yearA] = a.split(' ');
            const [monthB, yearB] = b.split(' ');
            if (yearA !== yearB) return yearB - yearA;
            return monthOrder.indexOf(monthB) - monthOrder.indexOf(monthA);
        });
    } else if (dataType === 'numeric') {
        availablePeriods.sort((a, b) => Number(b) - Number(a));
    } else if (dataType === 'daily') {
        availablePeriods.sort((a, b) => new Date(b) - new Date(a));
    }

    period1Select.innerHTML = "";
    period2Select.innerHTML = "";
    availablePeriods.forEach(period => {
        period1Select.add(new Option(period, period));
        period2Select.add(new Option(period, period));
    });

    if (period1Select.options.length > 1) {
        period1Select.selectedIndex = 1;
        period2Select.selectedIndex = 0;
    }
}

// data comparison logic
compareBtn.addEventListener("click", () => {
    const period1 = period1Select.value;
    const period2 = period2Select.value;
    const groupBy = comparisonTypeSelect.value === 'Site/Application' ? 'Site/Application' : 'Ad system';
    if (!period1 || !period2 || period1 === period2) {
        alert("Please select two different periods to compare.");
        return;
    }
    const dataByEntity = {};
    parsedData.forEach(row => {
        if (row[periodColumnName] == period1 || row[periodColumnName] == period2) {
            const key = row[groupBy];
            if (!key) return;
            if (!dataByEntity[key]) dataByEntity[key] = {};
            const metrics = {};
            numericHeaders.forEach(h => metrics[h] = row[h] || 0);
            dataByEntity[key][row[periodColumnName]] = {
                metrics,
                meta: { manager: row['Customer Success Manager'], client: row['Client'] }
            };
        }
    });

    const results = [];
    for (const key in dataByEntity) {
        const entityData1 = dataByEntity[key][period1];
        const entityData2 = dataByEntity[key][period2];
        const metricsComparison = {};

        if (entityData1 && entityData2) {
            numericHeaders.forEach(metric => {
                const val1 = entityData1.metrics[metric] || 0;
                const val2 = entityData2.metrics[metric] || 0;
                const changePct = val1 !== 0 ? (val2 - val1) / val1 : (val2 > 0 ? 1 : 0);
                metricsComparison[metric] = { val1, val2, changePct };
            });

            const rev1 = entityData1.metrics[revenueColumnName] || 0;
            const rev2 = entityData2.metrics[revenueColumnName] || 0;
            const dropAmt = rev1 - rev2;
            const dropPct = rev1 !== 0 ? (rev1 - rev2) / rev1 : 0;
            let amountThreshold = 100;
            const percentThreshold = 0.05;
            if (periodColumnName === 'Date') amountThreshold = 15;
            else if (periodColumnName === 'Week') amountThreshold = 50;
            else if (periodColumnName === 'Month') amountThreshold = 100;
            const flag = rev2 < rev1 && dropAmt > amountThreshold && dropPct > percentThreshold ? "YES" : "";
            results.push({ key, meta: entityData1.meta, metrics: metricsComparison, flag });
        } else {
            const flag = "NULL";
            const existingData = entityData1 || entityData2;
            numericHeaders.forEach(metric => {
                const val1 = entityData1 ? entityData1.metrics[metric] || 0 : 0;
                const val2 = entityData2 ? entityData2.metrics[metric] || 0 : 0;
                const changePct = val1 !== 0 ? (val2 - val1) / val1 : (val2 > 0 ? 1 : 0);
                metricsComparison[metric] = { val1, val2, changePct };
            });
            results.push({ key, meta: existingData.meta, metrics: metricsComparison, flag });
        }
    }

    lastRenderedRows = results;
    filterSelect.value = "all";
    managerFilterSelect.value = "all";
    applyFiltersAndRender();
});


// central filtering function
function applyFiltersAndRender() {
    const flagFilterValue = filterSelect.value;
    const managerFilterValue = managerFilterSelect.value;

    let filteredRows = [...lastRenderedRows];

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
    }

    if (managerFilterValue !== 'all') {
        filteredRows = filteredRows.filter(r => r.meta.manager === managerFilterValue);
    }
    
    currentlyDisplayedRows = filteredRows;
    
    const groupBy = comparisonTypeSelect.value === 'Site/Application' ? 'Site/Application' : 'Ad system';
    renderTable(currentlyDisplayedRows, groupBy);
}

// listeners for filters
filterSelect.addEventListener("change", applyFiltersAndRender);
managerFilterSelect.addEventListener("change", applyFiltersAndRender);


// table rendering function
function renderTable(data, groupBy) {
    const thead = resultsTable.querySelector("thead");
    const tbody = resultsTable.querySelector("tbody");
    let headerHtml = `<th>${groupBy}</th>`;
    if (groupBy === 'Site/Application') {
        headerHtml += `<th>CS Manager</th><th>Client</th>`;
    }
    headerHtml += `<th>Metric</th><th>Period 1 (${period1Select.value})</th><th>Period 2 (${period2Select.value})</th><th>% Change</th><th>Flag (on ${revenueColumnName})</th>`;
    thead.innerHTML = `<tr>${headerHtml}</tr>`;
    tbody.innerHTML = "";
    if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8">No data matching the selected filters.</td></tr>`;
        return;
    }
    data.forEach(item => {
        const numMetrics = Object.keys(item.metrics).length;
        let isFirstRowForEntity = true;
        for (const metricName in item.metrics) {
            const metricData = item.metrics[metricName];
            const tr = document.createElement("tr");
            let rowHtml = '';
            if (isFirstRowForEntity) {
                rowHtml += `<td rowspan="${numMetrics}">${item.key}</td>`;
                 if (groupBy === 'Site/Application') {
                    rowHtml += `<td rowspan="${numMetrics}">${item.meta.manager || ''}</td>`;
                    rowHtml += `<td rowspan="${numMetrics}">${item.meta.client || ''}</td>`;
                }
            }
            const changeColor = metricData.changePct < 0 ? 'color:red;' : 'color:lightgreen;';
            rowHtml += `<td>${metricName}</td>`;
            rowHtml += `<td>${metricData.val1.toFixed(2)}</td>`;
            rowHtml += `<td>${metricData.val2.toFixed(2)}</td>`;
            rowHtml += `<td style="${changeColor}">${(metricData.changePct * 100).toFixed(1)}%</td>`;
            if (isFirstRowForEntity) {
                 const flagClass = item.flag === 'YES' ? 'flagged' : (item.flag === 'NULL' ? 'nulled' : '');
                 rowHtml += `<td rowspan="${numMetrics}" class="${flagClass}">${item.flag}</td>`;
            }
            tr.innerHTML = rowHtml;
            tbody.appendChild(tr);
            isFirstRowForEntity = false;
        }
    });
}

// =======================================================
//              ===== EXPORT CODE =====
// =======================================================
exportBtn.addEventListener("click", () => {
    if (currentlyDisplayedRows.length === 0) {
        alert("No data to export.");
        return;
    }

    const groupBy = comparisonTypeSelect.value === 'Site/Application' ? 'Site/Application' : 'Ad system';
    const isSiteMode = groupBy === 'Site/Application';

    // 1. headers for a CSV file
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
        headers.splice(1, 2); 
    }

    const csvRows = [];
    csvRows.push(headers.join(',')); 

    // 2. go through the data and create rows for CSV
    currentlyDisplayedRows.forEach(item => {
        for (const metricName in item.metrics) {
            const metricData = item.metrics[metricName];
            const row = [
                item.key,
                ...(isSiteMode ? [item.meta.manager || '', item.meta.client || ''] : []),
                metricName,
                metricData.val1.toFixed(2),
                metricData.val2.toFixed(2),
                `${(metricData.changePct * 100).toFixed(2)}%`,
                item.flag || ''
            ];
            
            // quotation marks for safety
            const formattedRow = row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(',');
            csvRows.push(formattedRow);
        }
    });

    // 3. create and download the file
    const csvContent = csvRows.join('\n');
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    
    const link = document.createElement("a");
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", "comparison_export.csv");
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
});


// report generation
const generateReportBtn = document.getElementById("generateReportBtn");
const reportOutput = document.getElementById("reportOutput");

generateReportBtn.addEventListener("click", () => {
    if (currentlyDisplayedRows.length === 0) {
        alert("No data available for report generation. Please perform a comparison first.");
        reportOutput.value = ""; 
        return;
    }
    let reportText = ""; 
    currentlyDisplayedRows.forEach(item => {
        const appName = item.key;
        const managerName = item.meta.manager || 'Not specified'; 
        const clientName = item.meta.client || 'Not specified';
        const revenueMetric = item.metrics[revenueColumnName];
        if (!revenueMetric) return;

        const period1Value = revenueMetric.val1;
        const period2Value = revenueMetric.val2;
        const dollarChange = period2Value - period1Value;
        const percentChange = (revenueMetric.changePct * 100).toFixed(2) + '%';
        const formattedDollarChange = dollarChange.toLocaleString('ru-RU', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 2
        });
        
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
