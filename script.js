// запускаем иконки немедленно, если lucide уже загрузился (благодаря defer)
if (typeof lucide !== 'undefined') {
    lucide.createIcons();
} else {
    // если нет ждем window.load (самый безопасный способ)
    window.addEventListener('load', () => {
        lucide.createIcons();
    });
}


// --- Global State Variables (Analyzer) ---
let parsedData = [];
let numericHeaders = [];
let lastRenderedRows = [];
let currentlyDisplayedRows = [];
let periodColumnName = '';
let revenueColumnName = '';

// --- DOM Element Cache (Analyzer) ---
let csvInput, compareBtn, exportBtn, resultsTable, comparisonTypeSelect,
    period1Select, period2Select, filterSelect, managerFilterSelect,
    generateReportBtn, reportOutput;


// ===== CSV PARSING & PREPARATION (Analyzer) =====

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: true, // Auto-detect numbers for Part 1 (File Upload)
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
                 alert(`Error: Found 0 rows with data...`);
                 return;
            }
            const nonMetricCols = ['Date', 'Month', 'Week', 'Site/Application', 'Customer Success Manager', 'Client', 'Ad system'];
            numericHeaders = Object.keys(results.data[0]).filter(key =>
                !nonMetricCols.includes(key) && typeof results.data[0][key] === 'number');
            
            revenueColumnName = numericHeaders.find(h => h.toLowerCase().includes('revenue'));
            if (!revenueColumnName) {
                revenueColumnName = numericHeaders.length > 0 ? numericHeaders[0] : '';
                alert(`Warning: 'Revenue' column not found. Flag based on '${revenueColumnName}'.`);
            }
            
            populatePeriodSelectors();
            populateManagerFilter();
            alert(`File loaded successfully. Found ${parsedData.length} rows. Flag based on '${revenueColumnName}'.`);
        },
    });
}


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


// ===== CORE COMPARISON LOGIC (Analyzer) =====

function onCompareClick() {
    const period1 = period1Select.value;
    const period2 = period2Select.value;
    const groupBy = comparisonTypeSelect.value === 'Site/Application' ? 'Site/Application' : 'Ad system';
    if (!period1 || !period2 || period1 === period2) {
        alert("Please select two different periods to compare.");
        return;
    }
    
    // ыmart Data Aggregation (Max Revenue)
    const dataByEntity = {};
    parsedData.forEach(row => {
        const period = row[periodColumnName];
        if (period != period1 && period != period2) {
            return;
        }
        const key = row[groupBy];
        if (!key) return;

        const newMetrics = {};
        numericHeaders.forEach(h => newMetrics[h] = row[h] || 0);
        const newMeta = { manager: row['Customer Success Manager'], client: row['Client'] };
        const newRevenue = newMetrics[revenueColumnName] || 0;

        if (!dataByEntity[key]) {
            dataByEntity[key] = {};
        }

        const existingEntry = dataByEntity[key][period];

        if (!existingEntry) {
            dataByEntity[key][period] = { metrics: newMetrics, meta: newMeta };
        } else {
            const existingRevenue = existingEntry.metrics[revenueColumnName] || 0;
            if (newRevenue > existingRevenue) {
                dataByEntity[key][period] = { metrics: newMetrics, meta: newMeta };
            }
        }
    });

    // сomparison & Flagging
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
            
            const flag = (rev2 < rev1 && dropAmt > amountThreshold && dropPct > percentThreshold) ? "YES" : "";
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
}


// ===== FILTERING & RENDERING (Analyzer) =====

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

// ===== EXPORT & REPORTING (Analyzer) =====

function onExportClick() {
    if (currentlyDisplayedRows.length === 0) {
        alert("No data to export.");
        return;
    }
    const groupBy = comparisonTypeSelect.value === 'Site/Application' ? 'Site/Application' : 'Ad system';
    const isSiteMode = groupBy === 'Site/Application';
    const headers = [ groupBy, 'CS Manager', 'Client', 'Metric',
        `Period 1 (${period1Select.value})`, `Period 2 (${period2Select.value})`,
        '% Change', `Flag (on ${revenueColumnName})`];
    if (!isSiteMode) {
        headers.splice(1, 2); 
    }
    const csvRows = [headers.join(',')];
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
            csvRows.push(row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','));
        }
    });
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
}

function onGenerateReportClick() {
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
            style: 'currency', currency: 'USD', minimumFractionDigits: 2
        });
        
        const entryText = `${appName}\nCS Manager - ${managerName}\nClient - ${clientName}\n% Change - ${percentChange}\n$ Change - ${formattedDollarChange}\n------------------------------------\n`;
        reportText += entryText;
    });
    if (reportText.trim() === "") {
        reportOutput.value = "There are no suitable records in the current selection for generating the report.";
    } else {
        reportOutput.value = reportText.trim();
    }
}

// ==========================================================
// ==========================================================
//     ===== ЛОГИКА ДЭШБОРДА И ТРИГГЕРОВ (ОБЩАЯ) =====
// ==========================================================
// ==========================================================

const LATEST_MONTH_FILES = [
    'data_sites/november2025.csv'
];

const ALL_OTHER_FILES = [
    'data_sites/june2025.csv',
    'data_sites/july2025.csv',
    'data_sites/august2025.csv',
    'data_sites/september2025.csv', 
    'data_sites/october2025.csv'
];
// --------------------------------------------------


// --- глобальные переменные для Дэшборда и Триггеров ---
let allChartData = []; // Будет хранить ВСЕ данные из ВСЕХ файлов
let allChartMetrics = new Set();
let allChartEntities = new Set();
let allChartManagers = new Set(); 
let allChartClients = new Set(); 
let myChart = null; 
let minDataDate = new Date(8640000000000000); 
let maxDataDate = new Date(-8640000000000000);

// глобальные хранилища для агрегированных периодов
let allAvailableDays = new Set();
let allAvailableWeeks = new Set();
let allAvailableMonths = new Set();
const ruMonths = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];


// --- переменные для хранения ВЫБРАННЫХ значений ---
let selectedChartEntity = 'all';
let selectedChartManager = 'all';
let selectedChartClient = 'all';

// --- глобальная переменная для статуса загрузки ---
let isDefaultDataLoaded = false;
let isAllDataLoaded = false; 

// --- DOM-элементы Дэшборда ---
let showDashboardBtn, closeDashboardBtn, dashboardView, dashboardLoadingStatus,
    chartMetricSelect, chartEntitySearch, chartGranularitySelect, reloadChartBtn,
    chartManagerSearch, chartClientSearch, chartEntitySuggestions,
    chartManagerSuggestions, chartClientSuggestions, chartCanvas, dashboardSpinner,
    dateRangeDaily, dateRangeWeekly, dateRangeMonthly, chartDateFrom, chartDateTo,
    chartWeekFrom, chartWeekTo, chartMonthFrom, chartMonthTo;

// --- глобальные переменные для ТРИГГЕРОВ ---
let triggerLastRenderedRows = [];
let triggerCurrentlyDisplayedRows = [];
let triggerNumericHeaders = []; 
let triggerRevenueColumnName = ''; 

// --- DOM-элементы для ТРИГГЕРОВ ---
let showTriggerViewBtn, closeTriggerViewBtn, triggerView, triggerGranularitySelect, 
    triggerComparisonType, triggerPeriod1, triggerPeriod2, triggerCompareBtn,
    triggerExportBtn, triggerGenerateReportBtn, triggerManagerFilter, 
    triggerFlagFilter, triggerResultsTable, triggerReportOutput;

// --- DOM-элементы для ГЛОБАЛЬНОГО лоадера ---
let globalLoaderOverlay, globalLoaderMessage;


// ===== ХЕЛПЕРЫ ДЛЯ ДАТ =====
/**
 * Получает ISO-неделю для даты.
 * @param {Date} date - Объект Date
 * @returns {string} - Форматированная строка "Неделя WW, YYYY"
 */
function getISOWeek(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - dayNum + 3);
    const firstThursday = d.getTime();
    d.setUTCMonth(0, 1);
    if (d.getUTCDay() !== 4) {
        d.setUTCMonth(0, 1 + ((4 - d.getUTCDay()) + 7) % 7);
    }
    const weekNum = 1 + Math.ceil((firstThursday - d.getTime()) / 604800000);
    return `Неделя ${weekNum}, ${date.getFullYear()}`;
}

/**
 * Форматирует строку "YYYY-MM" в "Месяц YYYY" на русском
 * @param {string} monthYear - Строка "YYYY-MM"
 * @returns {string} - "Октябрь 2025"
 */
function formatMonthYear(my) { // my = "2025-10"
    const [year, month] = my.split('-');
    const d = new Date(year, month - 1, 1);
    const formatted = d.toLocaleString('ru-RU', { month: 'long', year: 'numeric' });
    return formatted.charAt(0).toUpperCase() + formatted.slice(1); // "Октябрь 2025"
}

/**
 * сортировщик для недель "Неделя WW, YYYY" (от новой к старой)
 */
function sortWeeks(a, b) { 
    const [, weekA, yearA] = a.split(/[\s,]+/);
    const [, weekB, yearB] = b.split(/[\s,]+/);
    if (yearA !== yearB) return yearB - yearA;
    return weekB - weekA;
}

/**
 * сортировщик для месяцев "Месяц YYYY" (от нового к старому)
 */
function sortMonths(a, b) { 
    const [monthA, yearA] = a.split(' ');
    const [monthB, yearB] = b.split(' ');
    if (yearA !== yearB) return yearB - yearA;
    return ruMonths.indexOf(monthB.toLowerCase()) - ruMonths.indexOf(monthA.toLowerCase());
}

/**
 * хелпер для парсинга недель "Неделя WW, YYYY" в Date (для сортировки)
 */
function parseWeekString(weekString) {
    const [, week, year] = weekString.split(/[\s,]+/);
    const date = new Date(year, 0, 1 + (week - 1) * 7);
    if (date.getDay() <= 4) date.setDate(date.getDate() - date.getDay() + 1);
    else date.setDate(date.getDate() + 8 - date.getDay());
    return date;
}
/**
 * хелпер для парсинга месяцев "Месяц YYYY" в Date (для сортировки)
 */
function parseMonthString(monthString) {
    const [month, year] = monthString.split(' ');
    return new Date(year, ruMonths.indexOf(month.toLowerCase()), 1);
}
// ================================

// ===== ХЕЛПЕРЫ ДЛЯ ГЛОБАЛЬНОГО ЛОАДЕРА =====
function showGlobalLoader(message) {
    globalLoaderMessage.textContent = message;
    globalLoaderOverlay.style.display = 'flex';
}
function hideGlobalLoader() {
    globalLoaderOverlay.style.display = 'none';
}
// ============================================


/**
 * асинхронно загружает и парсит один CSV-файл
 * @param {string} filename - Имя файла (e.g., "january2025.csv")
 * @returns {Promise<Array>} - Promise, который вернет массив строк данных
 */
function fetchAndParseCSV(filename) {
    return fetch(filename)
        .then(response => {
            if (!response.ok) {
                throw new Error(`Failed to load ${filename}: ${response.statusText}`);
            }
            return response.text();
        })
        .then(csvText => {
            return new Promise((resolve, reject) => {
                Papa.parse(csvText, {
                    header: true,
                    delimiter: ";", 
                    skipEmptyLines: true,
                    complete: (results) => {
                        if (results.errors.length > 0) {
                            console.warn(`Errors parsing ${filename}:`, results.errors);
                        }
                        resolve(results.data);
                    },
                    error: (error) => reject(error)
                });
            });
        });
}

/**
 * Обрабатывает массив сырых данных, стандартизирует и фильтрует их.
 * @param {Array} rawData - Массив данных из PapaParse
 * @returns {Array} - Очищенный и отфильтрованный массив данных
 */
function processAndStandardizeData(rawData) {
    const tempMetrics = new Set();
    const tempEntities = new Set();
    const tempManagers = new Set(); 
    const tempClients = new Set(); 
    const tempDays = new Set(); 
    const tempWeeks = new Set(); 
    const tempMonths = new Set(); 
    const nonMetricCols = ['date', 'month', 'week', 'site/application', 'customer success manager', 'client', 'ad system', 'parseddate', 'monthyear', 'entity', 'weekyear', 'formattedmonth'];

    const processedData = rawData.map(row => {
        const newRow = {};
        for (const key in row) {
            const standardKey = key.trim().toLowerCase(); 
            newRow[standardKey] = row[key];
        }

        const entity = newRow['site/application'] || newRow['ad system'];
        const manager = newRow['customer success manager']; 
        const client = newRow['client']; 

        if(entity) {
            newRow['entity'] = entity;
            tempEntities.add(entity);
        }
        if(manager) { 
            tempManagers.add(manager);
        }
        if(client) { 
            tempClients.add(client);
        }

        for (const key in newRow) {
            if (nonMetricCols.includes(key)) continue;
            let val = newRow[key];
            if (typeof val === 'string') {
                val = parseFloat(String(val).replace(/\s/g, '').replace(',', '.'));
            }
            if (typeof val === 'number' && !isNaN(val)) {
                newRow[key] = val;
                if (key === 'cpm(v)') {
                    tempMetrics.add('CPM(v)');
                } else {
                    tempMetrics.add(key.charAt(0).toUpperCase() + key.slice(1)); 
                }
            } else {
                newRow[key] = 0;
            }
        }

        if (newRow.date) {
            newRow.parsedDate = new Date(newRow.date + "T00:00:00");
            if (!isNaN(newRow.parsedDate.getTime())) { 
                newRow.monthYear = `${newRow.parsedDate.getFullYear()}-${(newRow.parsedDate.getMonth() + 1).toString().padStart(2, '0')}`;
                newRow.weekYear = getISOWeek(newRow.parsedDate);
                newRow.formattedMonth = formatMonthYear(newRow.monthYear);

                if (newRow.parsedDate < minDataDate) minDataDate = newRow.parsedDate;
                if (newRow.parsedDate > maxDataDate) maxDataDate = newRow.parsedDate;
                
                tempDays.add(newRow.date);
                tempWeeks.add(newRow.weekYear);
                tempMonths.add(newRow.formattedMonth);
            } else {
                newRow.parsedDate = null;
            }
        }
        
        return newRow;
    }).filter(row => {
        const hasEntity = row.entity;
        const hasDate = row.parsedDate && !isNaN(row.parsedDate.getTime());
        const clientName = String(row['client'] || '').toLowerCase().trim();
        const isValidClient = clientName !== 'без статистики';
        const hasAdRequests = row['ad requests'] > 0;
        const hasViewableImpressions = row['viewble impressions'] > 0;
        return hasEntity && hasDate && isValidClient && hasAdRequests && hasViewableImpressions;
    }); 
    
    // --- Обновляем ГЛОБАЛЬНЫЕ списки ---
    tempMetrics.forEach(m => allChartMetrics.add(m));
    tempEntities.forEach(e => allChartEntities.add(e));
    tempManagers.forEach(m => allChartManagers.add(m));
    tempClients.forEach(c => allChartClients.add(c));
    tempDays.forEach(d => allAvailableDays.add(d));
    tempWeeks.forEach(w => allAvailableWeeks.add(w));
    tempMonths.forEach(m => allAvailableMonths.add(m));

    return processedData;
}


/**
 * загружает, парсит и стандартизирует список файлов
 * @param {Array<string>} fileList - Массив имен файлов
 * @returns {boolean} - true, если успех
 */
async function loadDataFiles(fileList) {
    if (fileList.length === 0) return true;

    try {
        const allFilePromises = fileList.map(fetchAndParseCSV);
        const allDataArrays = await Promise.all(allFilePromises);
        
        const rawChartData = [].concat(...allDataArrays);
        if (rawChartData.length === 0) {
             console.warn("Loaded files, but no data found in them.");
             return true; // не ошибка, просто нет данных
        }
        
        // обрабатываем и СРАЗУ добавляем в allChartData
        const newData = processAndStandardizeData(rawChartData);
        allChartData = allChartData.concat(newData);
        
        return true;
        
    } catch (error) {
        console.error("Error loading chart data:", error);
        alert(`Error: ${error.message}`);
        return false;
    }
}

/**
 * обновляет *все* фильтры на странице (Дэшборд и Триггеры)
 * на основе *текущего* состояния allChartData.
 */
function refreshAllFilters() {
    // 1. сортируем и готовим данные
    const metricsArray = Array.from(allChartMetrics);
    const revenueMetrics = metricsArray.filter(m => m.toLowerCase().includes('revenue')).sort();
    const cpmMetric = metricsArray.find(m => m.toLowerCase() === 'cpm(v)');
    const otherMetrics = metricsArray.filter(m => !m.toLowerCase().includes('revenue') && m.toLowerCase() !== 'cpm(v)').sort();

    const sortedMetrics = [...revenueMetrics, ...(cpmMetric ? [cpmMetric] : []), ...otherMetrics];
        
    // 2. обновляем фильтры Дэшборда
    chartMetricSelect.innerHTML = "";
    sortedMetrics.forEach(metric => {
        chartMetricSelect.add(new Option(metric, metric));
    });
    
    // обновляем селекторы Недель
    chartWeekFrom.innerHTML = "";
    chartWeekTo.innerHTML = "";
    const sortedWeeks = Array.from(allAvailableWeeks).sort(sortWeeks);
    const reversedWeeks = [...sortedWeeks].reverse(); // (от старой к новой)
    reversedWeeks.forEach(week => {
        chartWeekFrom.add(new Option(week, week));
        chartWeekTo.add(new Option(week, week));
    });

    // 3. обновляем фильтры Триггеров
    populateTriggerManagerFilter();
    populateTriggerPeriodSelectors(triggerGranularitySelect.value); // Перезаполняем периоды
    
    // 4. обновляем заголовки для Триггеров
    const sampleRow = allChartData[0] || {};
    const nonMetricCols = ['date', 'month', 'week', 'site/application', 'customer success manager', 'client', 'ad system', 'parseddate', 'monthyear', 'entity', 'weekyear', 'formattedmonth'];
    triggerNumericHeaders = Object.keys(sampleRow).filter(key => 
        !nonMetricCols.includes(key) && typeof sampleRow[key] === 'number');
    triggerRevenueColumnName = triggerNumericHeaders.find(h => h.includes('revenue')) || triggerNumericHeaders[0] || '';
    
    // 5. устанавливаем даты по умолчанию
    setDefaultDateRanges();
}

/**
 * "Гейткипер" для проверки, загружены ли *все* данные.
 */
async function ensureAllDataIsLoaded(loaderType = 'global') {
    if (isAllDataLoaded) {
        return true; // Все уже загружено, ничего не делаем
    }
    
    if (ALL_OTHER_FILES.length === 0) {
        isAllDataLoaded = true; // Нет "других" файлов, значит все загружено
        return true;
    }

    if (loaderType === 'global') {
        showGlobalLoader('Загрузка дополнительных данных...');
    } else {
        dashboardSpinner.style.display = 'block';
    }
    
    try {
        const success = await loadDataFiles(ALL_OTHER_FILES);
        if (success) {
            isAllDataLoaded = true;
            refreshAllFilters(); // <--- КЛЮЧЕВОЙ ШАГ: Обновляем все фильтры
        }
        return success;
    } catch (error) {
        console.error("Failed to load all data:", error);
        alert("Failed to load additional data: " + error.message);
        return false;
    } finally {
        if (loaderType === 'global') {
            hideGlobalLoader();
        } else {
            dashboardSpinner.style.display = 'none';
        }
    }
}


/**
 * Устанавливает мин/макс и значения по умолчанию для полей выбора дат.
 */
function setDefaultDateRanges() {
    if (!minDataDate || !maxDataDate || minDataDate > maxDataDate) return;

    const toISODate = (date) => date.toISOString().split('T')[0];
    const toISOMonth = (date) => date.toISOString().substring(0, 7);

    // --- 1. Поля ДНЕЙ ---
    chartDateFrom.min = toISODate(minDataDate);
    chartDateFrom.max = toISODate(maxDataDate);
    chartDateTo.min = toISODate(minDataDate);
    chartDateTo.max = toISODate(maxDataDate);
    
    chartDateTo.value = toISODate(maxDataDate);
    let defaultFromDate = new Date(maxDataDate);
    defaultFromDate.setDate(maxDataDate.getDate() - 29);
    if (defaultFromDate < minDataDate) defaultFromDate = minDataDate;
    chartDateFrom.value = toISODate(defaultFromDate);

    // --- 2. Поля НЕДЕЛЬ (уже заполнены в populateChartFilters) ---
    if (chartWeekTo.options.length > 0) {
        chartWeekTo.selectedIndex = chartWeekTo.options.length - 1; // Последняя неделя
        let defaultWeekIndex = Math.max(0, chartWeekTo.options.length - 12); // ~3 месяца
        chartWeekFrom.selectedIndex = defaultWeekIndex;
    }
    
    // --- 3. Поля МЕСЯЦЕВ ---
    chartMonthFrom.min = toISOMonth(minDataDate);
    chartMonthFrom.max = toISOMonth(maxDataDate);
    chartMonthTo.min = toISOMonth(minDataDate);
    chartMonthTo.max = toISOMonth(maxDataDate);

    chartMonthTo.value = toISOMonth(maxDataDate);
    let defaultFromMonth = new Date(maxDataDate.getFullYear(), maxDataDate.getMonth() - 5, 1); // 6 месяцев
    if (defaultFromMonth < minDataDate) defaultFromMonth = minDataDate;
    chartMonthFrom.value = toISOMonth(defaultFromMonth);
}


/**
 * Агрегирует (суммирует или усредняет) данные для графика на основе фильтров
 * @returns {Object | null} - { labels: [], data: [] } или null, если валидация не пройдена
 */
function processDataForChart() {
    const entity = selectedChartEntity;
    const manager = selectedChartManager;
    const client = selectedChartClient;
    const metric = chartMetricSelect.value;
    const granularity = chartGranularitySelect.value; 
    
    const metricKey = metric.toLowerCase();

    // --- 1. Валидация диапазона дат ---
    let periodFrom, periodTo;
    let periodKey;
    
    if (granularity === 'daily') {
        periodKey = 'date';
        if (!chartDateFrom.value || !chartDateTo.value) {
            alert("Please select a 'From' and 'To' date."); return null;
        }
        periodFrom = new Date(chartDateFrom.value + "T00:00:00");
        periodTo = new Date(chartDateTo.value + "T00:00:00");
    } else if (granularity === 'weekly') {
        periodKey = 'weekYear';
        if (!chartWeekFrom.value || !chartWeekTo.value) {
            alert("Please select a 'From' and 'To' week."); return null;
        }
        periodFrom = parseWeekString(chartWeekFrom.value);
        periodTo = parseWeekString(chartWeekTo.value);
    } else { // 'monthly'
        periodKey = 'formattedMonth';
        if (!chartMonthFrom.value || !chartMonthTo.value) {
            alert("Please select a 'From' and 'To' month."); return null;
        }
        const [fromYear, fromMonth] = chartMonthFrom.value.split('-').map(Number);
        const [toYear, toMonth] = chartMonthTo.value.split('-').map(Number);
        periodFrom = new Date(fromYear, fromMonth - 1, 1);
        periodTo = new Date(toYear, toMonth - 1, 1);
    }

    if (periodTo < periodFrom) {
        alert("'From' date must be before 'To' date.");
        return null;
    }

    // --- 2. Фильтрация данных ---
    let filteredData = allChartData.filter(row => {
        const inEntity = (entity === 'all' || row.entity === entity);
        const inManager = (manager === 'all' || row['customer success manager'] === manager); 
        const inClient = (client === 'all' || row['client'] === client); 
        
        let inDateRange = false;
        if (granularity === 'daily') {
            inDateRange = row.parsedDate >= periodFrom && row.parsedDate <= new Date(periodTo.getTime() + 86399999); // Включаем весь день
        } else if (granularity === 'weekly') {
             const rowDate = parseWeekString(row.weekYear);
             inDateRange = rowDate >= periodFrom && rowDate <= periodTo;
        } else { // monthly
             const rowDate = parseMonthString(row.formattedMonth);
             inDateRange = rowDate >= periodFrom && rowDate <= periodTo;
        }
        
        return inEntity && inManager && inClient && inDateRange; 
    });
    
    // --- 3. Агрегация ---
    const aggregationMap = new Map();

    filteredData.forEach(row => {
        let key = row[periodKey];
        if (!key) return;

        let stats = aggregationMap.get(key);
        if (!stats) {
            stats = { sum: 0, count: 0, hasValue: false };
            aggregationMap.set(key, stats);
        }
        
        const rowValue = row[metricKey];
        
        if (rowValue !== null && rowValue !== undefined) {
             stats.sum += rowValue;
             stats.count += 1;
             stats.hasValue = true;
        }
    });

    // --- 4. Сортировка ---
    let sortedKeys;
    if (granularity === 'daily') {
        sortedKeys = Array.from(aggregationMap.keys()).sort((a,b) => new Date(a) - new Date(b));
    } else if (granularity === 'weekly') {
        // ИСПРАВЛЕНИЕ: sortWeeks(b,a) -> старые к новым
        sortedKeys = Array.from(aggregationMap.keys()).sort((a,b) => sortWeeks(b,a)); 
    } else { // monthly
        // ИСПРАВЛЕНИЕ: sortMonths(b,a) -> старые к новым
        sortedKeys = Array.from(aggregationMap.keys()).sort((a,b) => sortMonths(b,a));
    }
    // sortedKeys.reverse(); // <--- ИСПРАВЛЕНИЕ: ЭТА СТРОКА БЫЛА ОШИБКОЙ
    // ========================================================

    const labels = sortedKeys;
    const data = sortedKeys.map(key => {
        const stats = aggregationMap.get(key);
        if (!stats || !stats.hasValue) return 0;

        if (metric === 'CPM(v)') {
            return stats.count > 0 ? stats.sum / stats.count : 0; // Среднее
        } else {
            return stats.sum; // Сумма
        }
    });

    return { labels, data };
}

/**
 * Рисует или обновляет график на canvas
 */
async function renderChart() {
    // 1. Проверяем, нужно ли дозагрузить ВСЕ данные
    await ensureAllDataIsLoaded('dashboard'); // 'dashboard' использует внутренний спиннер

    if (allChartData.length === 0) return; 

    dashboardSpinner.style.display = 'block';
    await new Promise(resolve => setTimeout(resolve, 0));

    try {
        if (!chartCanvas) {
            chartCanvas = document.getElementById('myChart');
            if (!chartCanvas) {
                 console.error("renderChart: chartCanvas is still not found!");
                 return;
            }
        }

        const chartData = processDataForChart();
        
        if (!chartData) {
            dashboardSpinner.style.display = 'none'; 
            return; 
        }

        const { labels, data } = chartData;
        const metric = chartMetricSelect.value;

        if (myChart) {
            myChart.destroy();
        }

        Chart.defaults.color = 'rgba(255, 259, 255, 0.7)';
        Chart.defaults.borderColor = 'rgba(255, 255, 255, 0.1)';

        myChart = new Chart(chartCanvas, {
            type: 'line', 
            data: {
                labels: labels,
                datasets: [{
                    label: metric,
                    data: data,
                    fill: true,
                    backgroundColor: 'rgba(10, 132, 255, 0.2)', 
                    borderColor: 'rgba(10, 132, 255, 1)', 
                    tension: 0.1, 
                    pointBackgroundColor: 'rgba(10, 132, 255, 1)',
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false, 
                plugins: {
                    legend: {
                        display: false 
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        titleColor: '#ffffff',
                        bodyColor: '#ffffff',
                    }
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Period'
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: metric === 'CPM(v)' ? `Average ${metric}` : `Total ${metric}`
                        },
                        ticks: {
                            callback: function(value) {
                                if (value >= 1000000) return (value / 1000000).toFixed(1) + 'M';
                                if (value >= 1000) return (value / 1000).toFixed(1) + 'k';
                                return value.toFixed(2);
                            }
                        }
                    }
                }
            }
        });

    } catch (error) {
        console.error("Error rendering chart:", error);
        alert("An error occurred while building the chart: " + error.message);
    } finally {
        dashboardSpinner.style.display = 'none';
    }
}

// ===== 6. СЛУШАТЕЛИ СОБЫТИЙ (Дэшборд) =====

// --- "Умный" поиск ---

function showSuggestions(inputEl, suggestionsEl, dataArray, onSelect, allText) {
    const searchTerm = inputEl.value.toLowerCase();
    suggestionsEl.innerHTML = ''; 

    const allOption = document.createElement('div');
    allOption.className = 'all-option';
    allOption.textContent = allText;
    allOption.addEventListener('click', () => {
        onSelect('all');
        inputEl.value = ''; 
        suggestionsEl.style.display = 'none';
    });
    suggestionsEl.appendChild(allOption);
    
    const filtered = Array.from(dataArray).filter(item => item.toLowerCase().includes(searchTerm));
    
    filtered.slice(0, 50).forEach(item => {
        const div = document.createElement('div');
        div.textContent = item;
        div.addEventListener('click', () => {
            onSelect(item);
            inputEl.value = item; 
            suggestionsEl.style.display = 'none';
        });
        suggestionsEl.appendChild(div);
    });

    suggestionsEl.style.display = 'block';
}

function hideAllSuggestions() {
    chartEntitySuggestions.style.display = 'none';
    chartManagerSuggestions.style.display = 'none';
    chartClientSuggestions.style.display = 'none';
}

// ==========================================================
// ==========================================================
// ===== ЧАСТЬ 3: ЛОГИКА "TRIGGER ANALYZER" =====
// ==========================================================
// ==========================================================

/**
 * Заполняет фильтр менеджеров для модального окна "Triggers"
 */
function populateTriggerManagerFilter() {
    triggerManagerFilter.innerHTML = '<option value="all">All Managers</option>';
    const sortedManagers = Array.from(allChartManagers).sort();
    sortedManagers.forEach(manager => {
        triggerManagerFilter.add(new Option(manager, manager));
    });
}

/**
 * [TRIGGERS] Заполняет селекторы Period 1 и 2 на основе выбранной гранулярности
 */
function populateTriggerPeriodSelectors(granularity) {
    let availablePeriods = [];
    if (granularity === 'daily') {
        availablePeriods = Array.from(allAvailableDays).sort((a,b) => new Date(b) - new Date(a));
    } else if (granularity === 'weekly') {
        availablePeriods = Array.from(allAvailableWeeks).sort(sortWeeks);
    } else { // monthly
        availablePeriods = Array.from(allAvailableMonths).sort(sortMonths);
    }

    triggerPeriod1.innerHTML = "";
    triggerPeriod2.innerHTML = "";
    availablePeriods.forEach(period => {
        triggerPeriod1.add(new Option(period, period));
        triggerPeriod2.add(new Option(period, period));
    });

    if (triggerPeriod1.options.length > 1) {
        triggerPeriod1.selectedIndex = 1; // По умолчанию - вчера
        triggerPeriod2.selectedIndex = 0; // По умолчанию - сегодня
    }
}

/**
 * [TRIGGERS] Логика сравнения для модального окна
 */
async function onTriggerCompareClick() {
    // ===== НОВОЕ: Гейткипер для загрузки данных =====
    showGlobalLoader('Проверяем и загружаем данные...');
    const loaded = await ensureAllDataIsLoaded('global');
    if (!loaded) {
        hideGlobalLoader();
        return; 
    }
    // ==========================================

    const period1 = triggerPeriod1.value;
    const period2 = triggerPeriod2.value;
    const granularity = triggerGranularitySelect.value;
    
    // Определяем, по какому ключу в row искать (entity или ad system)
    const groupBy = triggerComparisonType.value === 'Site/Application' ? 'entity' : 'ad system';
    // Определяем, по какому ключу фильтровать даты (date, weekYear, formattedMonth)
    let periodKey = 'date';
    if (granularity === 'weekly') periodKey = 'weekYear';
    if (granularity === 'monthly') periodKey = 'formattedMonth';

    
    if (!period1 || !period2 || period1 === period2) {
        alert("Please select two different periods to compare.");
        hideGlobalLoader(); 
        return;
    }
    
    // 1. Агрегируем (суммируем) все данные для выбранных периодов
    const aggregatedData = {}; 

    allChartData.forEach(row => {
        const period = row[periodKey];
        if (period != period1 && period != period2) {
            return;
        }
        
        const key = row[groupBy];
        if (!key) return;

        const uniqueKey = `${period}_${key}`;

        if (!aggregatedData[uniqueKey]) {
            aggregatedData[uniqueKey] = {
                metrics: {},
                meta: { manager: row['customer success manager'], client: row['client'] },
                period: period,
                key: key
            };
            triggerNumericHeaders.forEach(h => aggregatedData[uniqueKey].metrics[h] = 0);
        }

        triggerNumericHeaders.forEach(h => {
            aggregatedData[uniqueKey].metrics[h] += (row[h] || 0);
        });
    });

    // 2. Пересчитываем CPM(v) и готовим A/B
    const dataByEntity = {}; 
    
    for (const uniqueKey in aggregatedData) {
        const data = aggregatedData[uniqueKey];
        
        const revenueKey = triggerRevenueColumnName; 
        const revenue = data.metrics[revenueKey] || 0;
        const impressions = data.metrics['viewble impressions'];
        
        if (impressions > 0) {
            data.metrics['cpm(v)'] = (revenue / impressions) * 1000;
        } else {
            data.metrics['cpm(v)'] = 0;
        }

        if (!dataByEntity[data.key]) {
            dataByEntity[data.key] = {};
        }
        dataByEntity[data.key][data.period] = data;
    }


    // 3. Comparison & Flagging
    const results = [];
    for (const key in dataByEntity) {
        const entityData1 = dataByEntity[key][period1];
        const entityData2 = dataByEntity[key][period2];
        const metricsComparison = {};

        if (entityData1 && entityData2) {
            triggerNumericHeaders.forEach(metric => {
                const val1 = entityData1.metrics[metric] || 0;
                const val2 = entityData2.metrics[metric] || 0;
                const changePct = val1 !== 0 ? (val2 - val1) / val1 : (val2 > 0 ? 1 : 0);
                metricsComparison[metric] = { val1, val2, changePct };
            });

            const rev1 = entityData1.metrics[triggerRevenueColumnName] || 0;
            const rev2 = entityData2.metrics[triggerRevenueColumnName] || 0;
            const dropAmt = rev1 - rev2;
            const dropPct = rev1 !== 0 ? (rev1 - rev2) / rev1 : 0;
            
            let amountThreshold = 100;
            if (granularity === 'daily') amountThreshold = 15;
            if (granularity === 'weekly') amountThreshold = 50;
            const percentThreshold = 0.05;
            
            const flag = (rev2 < rev1 && dropAmt > amountThreshold && dropPct > percentThreshold) ? "YES" : "";
            results.push({ key, meta: entityData1.meta, metrics: metricsComparison, flag });
        
        } else {
            const flag = "NULL";
            const existingData = entityData1 || entityData2;
            triggerNumericHeaders.forEach(metric => {
                const val1 = entityData1 ? entityData1.metrics[metric] || 0 : 0;
                const val2 = entityData2 ? entityData2.metrics[metric] || 0 : 0;
                const changePct = val1 !== 0 ? (val2 - val1) / val1 : (val2 > 0 ? 1 : 0);
                metricsComparison[metric] = { val1, val2, changePct };
            });
            results.push({ key, meta: existingData.meta, metrics: metricsComparison, flag });
        }
    }

    triggerLastRenderedRows = results;
    triggerFlagFilter.value = "all";
    triggerManagerFilter.value = "all";
    applyTriggerFiltersAndRender();
    hideGlobalLoader(); // <-- Прячем лоадер
}

/**
 * [TRIGGERS] Фильтрация и рендер для модального окна
 */
function applyTriggerFiltersAndRender() {
    const flagFilterValue = triggerFlagFilter.value;
    const managerFilterValue = triggerManagerFilter.value;

    let filteredRows = [...triggerLastRenderedRows];

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
    
    triggerCurrentlyDisplayedRows = filteredRows;
    const groupBy = triggerComparisonType.value; // 'Site/Application' or 'Ad system'
    renderTriggerTable(triggerCurrentlyDisplayedRows, groupBy);
}


/**
 * [TRIGGERS] Рендер таблицы для модального окна
 */
function renderTriggerTable(data, groupBy) {
    const thead = triggerResultsTable.querySelector("thead");
    const tbody = triggerResultsTable.querySelector("tbody");
    let headerHtml = `<th>${groupBy}</th>`;
    if (groupBy === 'Site/Application') {
        headerHtml += `<th>CS Manager</th><th>Client</th>`;
    }
    headerHtml += `<th>Metric</th><th>Period 1 (${triggerPeriod1.value})</th><th>Period 2 (${triggerPeriod2.value})</th><th>% Change</th><th>Flag (on ${triggerRevenueColumnName})</th>`;
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
            // Отображаем "красивое" имя метрики
            const prettyMetricName = metricName.charAt(0).toUpperCase() + metricName.slice(1);
            rowHtml += `<td>${prettyMetricName}</td>`;
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

/**
 * [TRIGGERS] Экспорт CSV из модального окна
 */
function onTriggerExportClick() {
    if (triggerCurrentlyDisplayedRows.length === 0) {
        alert("No data to export.");
        return;
    }
    const groupBy = triggerComparisonType.value;
    const isSiteMode = groupBy === 'Site/Application';
    const headers = [ groupBy, 'CS Manager', 'Client', 'Metric',
        `Period 1 (${triggerPeriod1.value})`, `Period 2 (${triggerPeriod2.value})`,
        '% Change', `Flag (on ${triggerRevenueColumnName})`];
    if (!isSiteMode) {
        headers.splice(1, 2); 
    }
    const csvRows = [headers.join(',')];
    triggerCurrentlyDisplayedRows.forEach(item => {
        for (const metricName in item.metrics) {
            const metricData = item.metrics[metricName];
            const prettyMetricName = metricName.charAt(0).toUpperCase() + metricName.slice(1);
            const row = [
                item.key,
                ...(isSiteMode ? [item.meta.manager || '', item.meta.client || ''] : []),
                prettyMetricName,
                metricData.val1.toFixed(2),
                metricData.val2.toFixed(2),
                `${(metricData.changePct * 100).toFixed(2)}%`,
                item.flag || ''
            ];
            csvRows.push(row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','));
        }
    });
    const csvContent = csvRows.join('\n');
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", "trigger_export.csv");
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}

/**
 * [TRIGGERS] Генерация отчета из модального окна
 */
function onTriggerGenerateReportClick() {
    if (triggerCurrentlyDisplayedRows.length === 0) {
        alert("No data available for report generation.");
        triggerReportOutput.value = ""; 
        return;
    }
    let reportText = ""; 
    triggerCurrentlyDisplayedRows.forEach(item => {
        const appName = item.key;
        const managerName = item.meta.manager || 'Not specified'; 
        const clientName = item.meta.client || 'Not specified';
        const revenueMetric = item.metrics[triggerRevenueColumnName];
        if (!revenueMetric) return;

        const period1Value = revenueMetric.val1;
        const period2Value = revenueMetric.val2;
        const dollarChange = period2Value - period1Value;
        const percentChange = (revenueMetric.changePct * 100).toFixed(2) + '%';
        const formattedDollarChange = dollarChange.toLocaleString('ru-RU', {
            style: 'currency', currency: 'USD', minimumFractionDigits: 2
        });
        
        const entryText = `${appName}\nCS Manager - ${managerName}\nClient - ${clientName}\n% Change - ${percentChange}\n$ Change - ${formattedDollarChange}\n------------------------------------\n`;
        reportText += entryText;
    });
    if (reportText.trim() === "") {
        triggerReportOutput.value = "There are no suitable records in the current selection for generating the report.";
    } else {
        triggerReportOutput.value = reportText.trim();
    }
}


// ==========================================================
// ==========================================================
//    ===== ЗАПУСК ПРИЛОЖЕНИЯ (DOMContentLoaded) =====
// ==========================================================
// ==========================================================

document.addEventListener('DOMContentLoaded', () => {
    
    // --- Инициализируем ВСЕ DOM-элементы ---
    
    // Part 1
    csvInput = document.getElementById("csvFile");
    compareBtn = document.getElementById("compareBtn");
    exportBtn = document.getElementById("exportBtn");
    resultsTable = document.getElementById("resultsTable");
    comparisonTypeSelect = document.getElementById("comparisonType");
    period1Select = document.getElementById("period1");
    period2Select = document.getElementById("period2");
    filterSelect = document.getElementById("filterSelect");
    managerFilterSelect = document.getElementById("managerFilterSelect");
    generateReportBtn = document.getElementById("generateReportBtn");
    reportOutput = document.getElementById("reportOutput");

    // Part 2 (Dashboard)
    showDashboardBtn = document.getElementById('showDashboardBtn');
    closeDashboardBtn = document.getElementById('closeDashboardBtn');
    dashboardView = document.getElementById('dashboardView');
    dashboardLoadingStatus = document.getElementById('dashboardLoadingStatus');
    chartMetricSelect = document.getElementById('chartMetricSelect');
    chartEntitySearch = document.getElementById('chartEntitySearch');
    chartGranularitySelect = document.getElementById('chartGranularitySelect');
    reloadChartBtn = document.getElementById('reloadChartBtn');
    chartManagerSearch = document.getElementById('chartManagerSearch');
    chartClientSearch = document.getElementById('chartClientSearch');
    chartEntitySuggestions = document.getElementById('chartEntitySuggestions');
    chartManagerSuggestions = document.getElementById('chartManagerSuggestions');
    chartClientSuggestions = document.getElementById('chartClientSuggestions');
    chartCanvas = document.getElementById('myChart');
    dashboardSpinner = document.getElementById('dashboardSpinner');
    dateRangeDaily = document.querySelector('.date-range-daily');
    dateRangeWeekly = document.querySelector('.date-range-weekly');
    dateRangeMonthly = document.querySelector('.date-range-monthly');
    chartDateFrom = document.getElementById('chartDateFrom');
    chartDateTo = document.getElementById('chartDateTo');
    chartWeekFrom = document.getElementById('chartWeekFrom');
    chartWeekTo = document.getElementById('chartWeekTo');
    chartMonthFrom = document.getElementById('chartMonthFrom');
    chartMonthTo = document.getElementById('chartMonthTo');
    
    // Part 3 (Triggers)
    showTriggerViewBtn = document.getElementById('showTriggerViewBtn');
    closeTriggerViewBtn = document.getElementById('closeTriggerViewBtn');
    triggerView = document.getElementById('triggerView');
    triggerGranularitySelect = document.getElementById('triggerGranularitySelect');
    triggerComparisonType = document.getElementById('triggerComparisonType');
    triggerPeriod1 = document.getElementById('triggerPeriod1');
    triggerPeriod2 = document.getElementById('triggerPeriod2');
    triggerCompareBtn = document.getElementById('triggerCompareBtn');
    triggerExportBtn = document.getElementById('triggerExportBtn');
    triggerGenerateReportBtn = document.getElementById('triggerGenerateReportBtn');
    triggerManagerFilter = document.getElementById('triggerManagerFilter');
    triggerFlagFilter = document.getElementById('triggerFlagFilter');
    triggerResultsTable = document.getElementById('triggerResultsTable');
    triggerReportOutput = document.getElementById('triggerReportOutput');

    // Global Loader
    globalLoaderOverlay = document.getElementById('globalLoaderOverlay');
    globalLoaderMessage = document.getElementById('globalLoaderMessage');

    // --- Привязываем ВСЕ слушатели событий ---
    
    // Part 1
    csvInput.addEventListener("change", handleFileSelect);
    compareBtn.addEventListener("click", onCompareClick);
    filterSelect.addEventListener("change", applyFiltersAndRender);
    managerFilterSelect.addEventListener("change", applyFiltersAndRender);
    exportBtn.addEventListener("click", onExportClick);
    generateReportBtn.addEventListener("click", onGenerateReportClick);

    // Part 2 (Dashboard)
    showDashboardBtn.addEventListener('click', async () => {
        if (!isDefaultDataLoaded) { // Если даже дефолтные данные не загружены
            showGlobalLoader('Загрузка данных...');
            try {
                // ИСПРАВЛЕНИЕ: Ждем, пока lucide и PapaParse точно загрузятся
                if (typeof lucide === 'undefined') await new Promise(r => setTimeout(r, 200));
                lucide.createIcons();
                if (typeof Papa === 'undefined') await new Promise(r => setTimeout(r, 200));

                await loadDataFiles(LATEST_MONTH_FILES);
                isDefaultDataLoaded = true;
                refreshAllFilters(); // <--- Обновляем фильтры с дефолтными данными
                await renderChart(); // <--- Рисуем график
            } catch (err) {
                console.error("Failed to lazy-load data:", err);
                alert('Не удалось загрузить данные: ' + err.message);
            } finally {
                hideGlobalLoader();
            }
        }
        if (isDefaultDataLoaded) {
            document.body.classList.add('dashboard-open');
            if (myChart) myChart.resize();
        }
    });
    closeDashboardBtn.addEventListener('click', () => {
        document.body.classList.remove('dashboard-open');
    });
    chartEntitySearch.addEventListener('input', () => 
        showSuggestions(chartEntitySearch, chartEntitySuggestions, allChartEntities, (value) => {
            selectedChartEntity = value;
        }, 'All Sites/Apps')
    );
    chartEntitySearch.addEventListener('focus', () => 
        showSuggestions(chartEntitySearch, chartEntitySuggestions, allChartEntities, (value) => {
            selectedChartEntity = value;
        }, 'All Sites/Apps')
    );
    chartManagerSearch.addEventListener('input', () => 
        showSuggestions(chartManagerSearch, chartManagerSuggestions, allChartManagers, (value) => {
            selectedChartManager = value;
        }, 'All Managers')
    );
    chartManagerSearch.addEventListener('focus', () => 
        showSuggestions(chartManagerSearch, chartManagerSuggestions, allChartManagers, (value) => {
            selectedChartManager = value;
        }, 'All Managers')
    );
    chartClientSearch.addEventListener('input', () => 
        showSuggestions(chartClientSearch, chartClientSuggestions, allChartClients, (value) => {
            selectedChartClient = value;
        }, 'All Clients')
    );
    chartClientSearch.addEventListener('focus', () => 
        showSuggestions(chartClientSearch, chartClientSuggestions, allChartClients, (value) => {
            selectedChartClient = value;
        }, 'All Clients')
    );
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.filter-group')) {
            hideAllSuggestions();
        }
    });
    chartGranularitySelect.addEventListener('change', () => {
        const granularity = chartGranularitySelect.value;
        dateRangeDaily.style.display = granularity === 'daily' ? 'flex' : 'none';
        dateRangeWeekly.style.display = granularity === 'weekly' ? 'flex' : 'none';
        dateRangeMonthly.style.display = granularity === 'monthly' ? 'flex' : 'none';
    });
    reloadChartBtn.addEventListener('click', renderChart); // renderChart теперь async и сам вызовет ensureAllDataIsLoaded

    // Part 3 (Triggers)
    showTriggerViewBtn.addEventListener('click', async () => {
        if (!isDefaultDataLoaded) { // Та же логика, что и у Дэшборда
            showGlobalLoader('Загрузка данных...');
            try {
                // ИСПРАВЛЕНИЕ: Ждем, пока lucide и PapaParse точно загрузятся
                if (typeof lucide === 'undefined') await new Promise(r => setTimeout(r, 200));
                lucide.createIcons();
                if (typeof Papa === 'undefined') await new Promise(r => setTimeout(r, 200));

                await loadDataFiles(LATEST_MONTH_FILES);
                isDefaultDataLoaded = true;
                refreshAllFilters(); // <--- Обновляем фильтры (включая триггеры)
            } catch (err) {
                console.error("Failed to lazy-load data:", err);
                alert('Не удалось загрузить данные: ' + err.message);
            } finally {
                hideGlobalLoader();
            }
        }
        if (isDefaultDataLoaded) {
            document.body.classList.add('trigger-view-open');
        }
    });
    closeTriggerViewBtn.addEventListener('click', () => {
        document.body.classList.remove('trigger-view-open');
    });
    triggerGranularitySelect.addEventListener('change', () => {
        populateTriggerPeriodSelectors(triggerGranularitySelect.value);
    });
    triggerCompareBtn.addEventListener("click", onTriggerCompareClick); // onTriggerCompareClick теперь async и вызовет ensureAllDataIsLoaded
    triggerFlagFilter.addEventListener("change", applyTriggerFiltersAndRender);
    triggerManagerFilter.addEventListener("change", applyTriggerFiltersAndRender);
    triggerExportBtn.addEventListener("click", onTriggerExportClick);
    triggerGenerateReportBtn.addEventListener("click", onTriggerGenerateReportClick);

    // ===== НОВОЕ: ЗАПУСК ПРИЛОЖЕНИЯ =====
    (async () => {
        // Ждем, пока `defer` скрипты (PapaParse, Chart.js, lucide) точно загрузятся
        // Это необходимо, т.к. DOMContentLoaded может сработать раньше них.
        while (typeof Papa === 'undefined' || typeof Chart === 'undefined' || typeof lucide === 'undefined') {
            await new Promise(r => setTimeout(r, 50)); // Ждем 50ms
        }
        
        lucide.createIcons(); // Теперь 100% безопасно
        
        showGlobalLoader('Загрузка данных...');
        try {
            await loadDataFiles(LATEST_MONTH_FILES);
            isDefaultDataLoaded = true;
            refreshAllFilters(); // Обновляем *все* фильтры с данными по умолчанию
            
            // Сразу рендерим график по умолчанию (но не показываем его)
            await renderChart(); 
            dashboardLoadingStatus.style.display = 'none';
        } catch (err) {
            console.error("Failed to load initial data:", err);
            globalLoaderMessage.textContent = 'Ошибка загрузки данных: ' + err.message;
            // Не прячем лоадер, если ошибка
            return;
        }
        hideGlobalLoader();
    })();
});
