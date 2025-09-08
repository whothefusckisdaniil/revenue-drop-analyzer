# CSV Data Analyzer & Reporter

A lightweight, client-side web application for analyzing and comparing time-series data from CSV files. This tool is designed for performance analysis, allowing users to compare two periods, filter results, and generate concise reports for managers.

-----

## ✨ Features

  * **Client-Side CSV Parsing**: Upload and process CSV files directly in your browser. No data is sent to a server.
  * **Period Comparison**: Compare any two time periods (e.g., day-over-day, week-over-week) found in your data.
  * **Dynamic Grouping**: Group results by **"Site/Application"** or **"Ad system"**.
  * **Performance Flagging**: Automatically flags entries with significant performance drops based on configurable thresholds.
  * **Advanced Filtering**: Filter the comparison results by flag status (**YES**, **NULL**) and by **CS Manager**.
  * **CSV Export**: Export the filtered and formatted comparison table to a new CSV file.
  * **Manager Reports**: Generate a clean, copy-paste-ready text summary of the key changes, perfect for sending in messengers or emails.

-----

## 📂 File Structure

  * `index.html`: The main HTML file containing the user interface and application layout.
  * `script.js`: All the JavaScript logic for parsing, data comparison, filtering, rendering, and exporting.

-----

## 📋 Required CSV Format

For the analyzer to work correctly, your CSV file **must** have a header row and include the following columns:

1.  **A Time Period Column**: The column header must be exactly `Date`, `Week`, or `Month`.
2.  **An Entity Column**: At least one of these columns must be present: `Site/Application` or `Ad system`.
3.  **Manager & Client Columns**: `Customer Success Manager` and `Client` columns are required for filtering and reporting.
4.  **Numeric Metric Columns**: At least one column with numerical data (e.g., `Revenue`, `Clicks`, `Impressions`). The script will automatically identify a column with "revenue" in its name for performance flagging.

#### Example Structure:

| Site/Application | Customer Success Manager | Client | Month | Revenue | Clicks |
|------------------|--------------------------|--------|-------------|---------|--------|
| App: Cool App    | John Doe                 | ABC Inc| August 2025 | 1500.75 | 32000  |
| orda.kz          | Jane Smith               | Orda LLC| August 2025 | 2200.50 | 45000  |
| App: Cool App    | John Doe                 | ABC Inc| July 2025   | 1200.00 | 28000  |
| orda.kz          | Jane Smith               | Orda LLC| July 2025   | 2500.10 | 48000  |

-----

## 🚀 How to Use

1.  Open the `index.html` file in any modern web browser.
2.  Click **"Select File"** and choose your prepared CSV file.
3.  The **"Period 1"** and **"Period 2"** dropdowns will automatically populate. Select the two periods you wish to compare.
4.  Click the **"Compare"** button to generate the comparison table.
5.  Use the **Manager** and **Flag** dropdowns to filter the results as needed.
6.  Click **"Export"** to download the currently displayed table as a new CSV file.
7.  Click **"Generate a report"** to create a text summary in the text area at the bottom of the page.

-----

## 🛠️ Dependencies

This project runs entirely in the browser and uses two external libraries loaded via CDN:

  * [**PapaParse.js**](https://www.papaparse.com/): A powerful, in-browser CSV parsing library.
  * [**Lucide Icons**](https://lucide.dev/): Beautiful and consistent open-source icons.
