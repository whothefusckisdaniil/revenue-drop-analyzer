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

csvInput.addEventListener("change", (event) => {
  const file = event.target.files[0]
  if (file) {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: function (results) {
        parsedData = results.data.filter((row) => row["Date"] && row["Revenue Ad system"] && !row["Site/Application"].includes("_pau"))
        if (!parsedData.length) {
          alert("No valid data rows found.")
          return
        }
        const firstRow = parsedData[0]
        const requiredCols = ["Date", "Site/Application", "Customer Success Manager", "Client", "Revenue Ad system"]
        const missing = requiredCols.filter((col) => !(col in firstRow))
        if (missing.length) {
          alert("Missing required columns: " + missing.join(", "))
          return
        }
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
    const option1 = new Option(date, date)
    const option2 = new Option(date, date)
    date1Select.appendChild(option1)
    date2Select.appendChild(option2)
  })
}

compareBtn.addEventListener("click", () => {
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

  renderTable(rows)

  // Сброс фильтра после нового сравнения
  filterActive = false
  filterBtn.textContent = "Show Only Flagged"
})

function renderTable(data) {
  lastRenderedRows = data
  resultsBody.innerHTML = ""
  data.forEach((row) => {
    const tr = document.createElement("tr")
    tr.innerHTML = `
      <td>${row.site}</td>
      <td>${row.manager}</td>
      <td>${row.client}</td>
      <td>${row.rev1.toFixed(2)}</td>
      <td>${row.rev2.toFixed(2)}</td>
      <td>${(row.dropPct * 100).toFixed(1)}%</td>
      <td>${row.dropAmt.toFixed(2)}</td>
      <td>${row.flag}</td>
    `
    resultsBody.appendChild(tr)
  })
}

exportBtn.addEventListener("click", () => {
  const rows = Array.from(resultsBody.querySelectorAll("tr")).map((tr) =>
    Array.from(tr.children).map((td) => td.textContent)
  )
  const csvContent =
    "Site/Application,CS Manager,Client,Revenue Date 1,Revenue Date 2,% Drop,$ Drop,Flag\n" +
    rows.map((r) => r.join(",")).join("\n")

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
  const link = document.createElement("a")
  link.href = URL.createObjectURL(blob)
  link.download = "comparison_results.csv"
  link.click()
})

// ... остальные переменные остаются без изменений

filterBtn.style.display = "none" // скрыть кнопку при загрузке страницы

compareBtn.addEventListener("click", () => {
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

  renderTable(rows)

  // Показываем кнопку фильтрации заново
  filterBtn.style.display = "inline-block"
  filterBtn.textContent = "Show Only Flagged"
})

filterBtn.addEventListener("click", () => {
  const flaggedRows = lastRenderedRows.filter((row) => row.flag === "YES")
  renderTable(flaggedRows)

  // Скрываем кнопку после фильтрации
  filterBtn.style.display = "none"
})
