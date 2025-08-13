let parsedData = []
let availableDates = []
let headers = {}
let lastRenderedRows = []
let filterActive = false

const csvInput = document.getElementById("csvFile")
const date1Select = document.getElementById("date1")
const date2Select = document.getElementById("date2")
const compareBtn = document.getElementById("compareBtn")
const exportBtn = document.getElementById("exportBtn")
const resultsBody = document.querySelector("#resultsTable tbody")
const filterBtn = document.getElementById("filterBtn")

let fileType = "site" // site или adSystem

// ——— смена заголовков
function resetTableHeader(type = fileType) {
  const theadRow = document.querySelector("#resultsTable thead tr")
  if (!theadRow) return
  if (type === "adSystem") {
    theadRow.innerHTML = `
      <th>Ad system</th>
      <th>Revenue Date 1</th>
      <th>Revenue Date 2</th>
      <th>% Drop</th>
      <th>$ Drop</th>
      <th>Flag</th>
    `
  } else {
    theadRow.innerHTML = `
      <th>Site/Application</th>
      <th>CS Manager</th>
      <th>Client</th>
      <th>Revenue Date 1</th>
      <th>Revenue Date 2</th>
      <th>% Drop</th>
      <th>$ Drop</th>
      <th>Flag</th>
    `
  }
}

csvInput.addEventListener("change", (event) => {
  const file = event.target.files[0]
  if (file) {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: function (results) {
        const cols = Object.keys(results.data[0] || {})
        if (cols.includes("Ad system")) {
          fileType = "adSystem"
          parsedData = results.data.filter(
            (row) => row["Date"] && row["Ad system"] && row["Revenue Ad system"]
          )
        } else {
          fileType = "site"
          parsedData = results.data.filter(
            (row) => row["Date"] && row["Revenue Ad system"] && row["Site/Application"] && !row["Site/Application"].includes("_pau")
          )
        }

        if (!parsedData.length) {
          alert("No valid data rows found.")
          return
        }

        resetTableHeader(fileType)
        populateDateSelectors()
      },
    })
  }
})

function populateDateSelectors() {
  const datesSet = new Set(parsedData.map((row) => row["Date"]))
  availableDates = Array.from(datesSet).sort()

  date1Select.innerHTML = ""
  date2Select.innerHTML = ""
  availableDates.forEach((date) => {
    date1Select.appendChild(new Option(date, date))
    date2Select.appendChild(new Option(date, date))
  })
}

compareBtn.addEventListener("click", () => {
  if (fileType === "adSystem") {
    compareByAdSystem()
  } else {
    compareBySite()
  }
})

// ---- проверка (site) ----
function compareBySite() {
  const date1 = date1Select.value
  const date2 = date2Select.value
  if (!date1 || !date2 || date1 === date2) {
    alert("Please select two different dates.")
    return
  }

  const bySite = {}
  parsedData.forEach((row) => {
    const key = `${row["Site/Application"]}|${row["Customer Success Manager"]}|${row["Client"]}`
    if (!bySite[key]) bySite[key] = {}
    bySite[key][row["Date"]] = parseFloat(row["Revenue Ad system"]) || 0
  })

  const rows = []
  for (const key in bySite) {
    const [site, manager, client] = key.split("|")
    const rev1 = bySite[key][date1] || 0
    const rev2 = bySite[key][date2] || 0
    if (rev1 === 0) continue

    const dropPct = (rev1 - rev2) / rev1
    const dropAmt = rev1 - rev2
    const flag = rev2 < rev1 && dropAmt > 100 && dropPct > 0.1 ? "YES" : ""

    rows.push({ site, manager, client, rev1, rev2, dropPct, dropAmt, flag })
  }

  renderTable(rows, "site")
  filterBtn.style.display = "inline-block"
  filterBtn.textContent = "Show Only Flagged"
  filterActive = false
}

// ---- проверка (adSystem) ----
function compareByAdSystem() {
  const date1 = date1Select.value
  const date2 = date2Select.value
  if (!date1 || !date2 || date1 === date2) {
    alert("Please select two different dates.")
    return
  }

  const bySystem = {}
  parsedData.forEach((row) => {
    const key = row["Ad system"]
    if (!bySystem[key]) bySystem[key] = {}
    bySystem[key][row["Date"]] = parseFloat(row["Revenue Ad system"]) || 0
  })

  const rows = []
  for (const adSystem in bySystem) {
    const rev1 = bySystem[adSystem][date1] || 0
    const rev2 = bySystem[adSystem][date2] || 0
    if (rev1 === 0) continue

    const dropPct = (rev1 - rev2) / rev1
    const dropAmt = rev1 - rev2
    const flag = rev2 < rev1 && dropAmt > 100 && dropPct > 0.1 ? "YES" : ""

    rows.push({ adSystem, rev1, rev2, dropPct, dropAmt, flag })
  }

  renderTable(rows, "adSystem")
  filterBtn.style.display = "inline-block"
  filterBtn.textContent = "Show Only Flagged"
  filterActive = false
}

// ---- рендер ----
function renderTable(data, type) {
  lastRenderedRows = data
  resultsBody.innerHTML = ""

  resetTableHeader(type)

  data.forEach((row) => {
    const tr = document.createElement("tr")
    const isFlagged = row.flag === "YES"

    if (type === "adSystem") {
      tr.innerHTML = `
        <td>${row.adSystem}</td>
        <td>${row.rev1.toFixed(2)}</td>
        <td>${row.rev2.toFixed(2)}</td>
        <td>${(row.dropPct * 100).toFixed(1)}%</td>
        <td style="${isFlagged ? 'color:red;font-weight:bold;' : ''}">${row.dropAmt.toFixed(2)}</td>
        <td>${row.flag}</td>
      `
    } else {
      tr.innerHTML = `
        <td>${row.site}</td>
        <td>${row.manager}</td>
        <td>${row.client}</td>
        <td>${row.rev1.toFixed(2)}</td>
        <td>${row.rev2.toFixed(2)}</td>
        <td>${(row.dropPct * 100).toFixed(1)}%</td>
        <td style="${isFlagged ? 'color:red;font-weight:bold;' : ''}">${row.dropAmt.toFixed(2)}</td>
        <td>${row.flag}</td>
      `
    }

    resultsBody.appendChild(tr)
  })
}

// ---- экспорт файла ----
exportBtn.addEventListener("click", () => {
  const rows = Array.from(resultsBody.querySelectorAll("tr")).map((tr) =>
    Array.from(tr.children).map((td) => td.textContent)
  )

  let header = ""
  if (fileType === "adSystem") {
    header = "Ad system,Revenue Date 1,Revenue Date 2,% Drop,$ Drop,Flag\n"
  } else {
    header = "Site/Application,CS Manager,Client,Revenue Date 1,Revenue Date 2,% Drop,$ Drop,Flag\n"
  }

  const csvContent = header + rows.map((r) => r.join(",")).join("\n")

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
  const link = document.createElement("a")
  link.href = URL.createObjectURL(blob)
  link.download = "comparison_results.csv"
  link.click()
})

// ---- фильтр ----
filterBtn.addEventListener("click", () => {
  const flaggedRows = lastRenderedRows.filter((row) => row.flag === "YES")
  renderTable(flaggedRows, fileType)
  filterBtn.style.display = "none"
})