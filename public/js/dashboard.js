(() => {
let datasets = [];
let currentDataset = null;
let currentHeaders = [];
let currentRows = [];
let filteredRows = [];

let currentPage = 1;
let pageSize = 50;
let sortColumn = -1;
let sortDirection = "asc";
let selectedPIC = "";

let lineChart = null;
let barChart = null;
let pieChart = null;

let picSelect;
let totalRecords;
let totalRecipients;
let totalParticipants;
let contactedRecipients;
let multiProgramParticipants;
let participantTotal = 0;
let currentDateTime;
let currentDate;
let currentTime;
let clockInterval = null;
let statsSection;
let tableSearch;
let pageSizeSelect;
let dataTableHead;
let dataTableBody;
let paginationInfo;
let paginationButtons;
let recipientNoData;
let analysisDescription;
let analysisSummary;
let analysisColumns;
let barColumnSelect;
let pieColumnSelect;
let pieTotal;
let pieLegend;
let lineLegend;
let barLegend;

async function initializeDashboard() {
    picSelect = document.getElementById("picSelect");
    totalRecords = document.getElementById("totalRecords");
    totalRecipients = document.getElementById("totalRecipients");
    totalParticipants = document.getElementById("totalParticipants");
    contactedRecipients = document.getElementById("contactedRecipients");
    multiProgramParticipants = document.getElementById("multiProgramParticipants");
    currentDateTime = document.getElementById("currentDateTime");
    currentDate = document.getElementById("currentDate");
    currentTime = document.getElementById("currentTime");
    totalRecords = totalRecipients;
    statsSection = document.getElementById("statsSection");
    tableSearch = document.getElementById("tableSearch");
    pageSizeSelect = document.getElementById("pageSize");
    dataTableHead = document.getElementById("dataTableHead");
    dataTableBody = document.getElementById("dataTableBody");
    paginationInfo = document.getElementById("paginationInfo");
    paginationButtons = document.getElementById("paginationButtons");
    recipientNoData = document.getElementById("recipientNoData");
    analysisDescription = document.getElementById("analysisDescription");
    analysisSummary = document.getElementById("analysisSummary");
    analysisColumns = document.getElementById("analysisColumns");
    barColumnSelect = document.getElementById("barColumnSelect");
    pieColumnSelect = document.getElementById("pieColumnSelect");
    pieTotal = document.getElementById("pieTotal");
    pieLegend = document.getElementById("pieLegend");
    lineLegend = document.getElementById("lineLegend");
    barLegend = document.getElementById("barLegend");

    if (!picSelect) {
        if (clockInterval) {
            clearInterval(clockInterval);
            clockInterval = null;
        }
        return;
    }

    updateDashboardClock();

    if (clockInterval) {
        clearInterval(clockInterval);
    }

    clockInterval = setInterval(updateDashboardClock, 1000);

    if (picSelect.dataset.initialized !== "true") {
        picSelect.dataset.initialized = "true";

        tableSearch?.addEventListener("input", applyFilters);
        pageSizeSelect?.addEventListener("change", () => {
            pageSize = Number(pageSizeSelect.value);
            currentPage = 1;
            renderTable();
        });
        picSelect?.addEventListener("change", () => {
            selectedPIC = picSelect.value;
            applyFilters();
        });
    }

    arrangeDashboard();
    await loadCombinedRecipientData();
}

function updateDashboardClock() {
    if (!currentDate || !currentTime) {
        return;
    }

    const now = new Date();

    currentDate.textContent = new Intl.DateTimeFormat("ms-MY", {
        dateStyle: "medium"
    }).format(now);

    currentTime.textContent = new Intl.DateTimeFormat("ms-MY", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
    }).format(now);
}

function arrangeDashboard() {
    const dashboardContent =
        document.querySelector(".dashboard-content");

    if (!dashboardContent || !statsSection) {
        return;
    }

    dashboardContent.prepend(statsSection);
}

function getHeaders() {
    if (currentHeaders.length) {
        return currentHeaders;
    }

    const columnCount = currentRows.reduce(
        (count, row) => Math.max(count, row.length),
        0
    );

    return Array.from(
        { length: columnCount },
        (_, index) => `Column ${index + 1}`
    );
}

function normalizeFilterValue(value) {
    const text = String(value ?? "").trim();

    return text === "(Kosong)"
        ? "__EMPTY__"
        : text;
}

function getDatasetViewerUrl(datasetId, filters) {
    const params = new URLSearchParams();

    Object.entries(filters).forEach(
        ([column, value]) => {
            if (
                column &&
                value !== undefined &&
                value !== null
            ) {
                params.set(
                    column,
                    normalizeFilterValue(value)
                );
            }
        }
    );

    const query = params.toString();

    const detailParams = new URLSearchParams(query);
    detailParams.set("id", datasetId);

    return `/data-set?${detailParams.toString()}`;
}

function openChartFilter(columnIndex, value) {
    if (
        columnIndex === undefined ||
        columnIndex === null
    ) {
        return;
    }

    if (
        value === undefined ||
        value === null
    ) {
        return;
    }

    const headers = getHeaders();

    const clickedColumn =
        headers[columnIndex];

    if (!clickedColumn) {
        return;
    }

    const filters = {};

    const normalizedColumn =
        String(clickedColumn)
            .trim()
            .toLowerCase();

    const clickedValue =
        normalizeFilterValue(value);

    const normalizedFilterColumn =
        normalizedColumn === "status"
            ? "status"
            : normalizedColumn === "pic"
                ? "pic"
                : "";

    if (!normalizedFilterColumn) {
        return;
    }

    filters[normalizedFilterColumn] = clickedValue;

    if (
        selectedPIC &&
        normalizedColumn !== "pic"
    ) {
        filters.pic = selectedPIC;
    }

    const params = new URLSearchParams();

    Object.entries(filters).forEach(([column, filterValue]) => {
        if (filterValue !== undefined && filterValue !== null) {
            params.set(column, filterValue);
        }
    });

    const query = params.toString();
    const url = `/penerima-bantuan${query ? `?${query}` : ""}`;

    window.dispatchEvent(
        new CustomEvent("app:navigate", {
            detail: {
                url
            }
        })
    );
}

function populatePICFilter() {
    if (!picSelect) {
        return;
    }

    picSelect.innerHTML = "";

    const allOption =
        document.createElement("option");

    allOption.value = "";
    allOption.textContent = "Semua PIC";

    picSelect.appendChild(allOption);

    const headers = getHeaders();

    const picIndex =
        headers.findIndex(
            header =>
                String(header)
                    .trim()
                    .toLowerCase() === "pic"
        );

    if (picIndex === -1) {
        picSelect.disabled = true;
        selectedPIC = "";
        return;
    }

    const picValues = new Set();
    currentRows.forEach(row => {
        const value =
            String(
                row[picIndex] ?? ""
            ).trim();

        if (value) {
            picValues.add(value);
        }
    });

    [...picValues]
        .sort((a, b) =>
            a.localeCompare(b)
        )
        .forEach(pic => {
            const option =
                document.createElement("option");

            option.value = pic;
            option.textContent = pic;

            picSelect.appendChild(option);
        });

    picSelect.disabled = false;

    if (
        selectedPIC &&
        picValues.has(selectedPIC)
    ) {
        picSelect.value =
            selectedPIC;
    } else {
        selectedPIC = "";
        picSelect.value = "";
    }
}

function getPICFilteredRows() {
    const headers = getHeaders();

    const picIndex =
        headers.findIndex(
            header =>
                String(header)
                    .trim()
                    .toLowerCase() === "pic"
        );

    if (picIndex === -1 || !selectedPIC) {
        return [...currentRows];
    }

    return currentRows.filter(
        row =>
            selectedPIC === "__NO_PIC__"
                ? !String(row[picIndex] ?? "").trim()
                : String(row[picIndex] ?? "").trim() === selectedPIC
    );
}

function getSearchFilteredRows() {
    let rows =
        getPICFilteredRows();

    const search =
        tableSearch
            ? tableSearch.value
                .toLowerCase()
                .trim()
            : "";

    if (!search) {
        return rows;
    }

    return rows.filter(row =>
        row.some(value =>
            String(value ?? "")
                .toLowerCase()
                .includes(search)
        )
    );
}

function applyFilters() {
    filteredRows =
        getSearchFilteredRows();

    currentPage = 1;

    totalParticipants.textContent =
        participantTotal.toLocaleString();

    renderTable();
    renderAnalysis();
    updateCharts();
}

function renderTable() {
    dataTableHead.innerHTML = "";
    dataTableBody.innerHTML = "";

    const headers = getHeaders();
    const tableContainer = document.getElementById("recipientTableContainer");
    const tableFooter = paginationInfo?.closest(".table-footer");
    const analysisSection = document.getElementById("datasetAnalysisSection");
    const chartsSection = document.getElementById("chartsSection");
    const recordsSection = document.getElementById("datasetRecordsSection");
    const hasRecipientData = currentRows.length > 0;

    if (recipientNoData) {
        recipientNoData.style.display = hasRecipientData ? "none" : "block";
    }
    [analysisSection, chartsSection, recordsSection].forEach(section => {
        if (section) {
            section.style.display = hasRecipientData ? "" : "none";
        }
    });
    if (tableContainer) {
        tableContainer.style.display = hasRecipientData ? "" : "none";
    }
    if (tableFooter) {
        tableFooter.style.display = hasRecipientData ? "" : "none";
    }

    if (!headers.length) {
        paginationInfo.textContent =
            "0 rekod";

        paginationButtons.innerHTML = "";

        return;
    }

    const headerRow =
        document.createElement("tr");

    headers.forEach(
        (header, index) => {
            const th =
                document.createElement("th");

            th.textContent =
                header ||
                `Column ${index + 1}`;

            const indicator =
                document.createElement(
                    "span"
                );

            indicator.className =
                "sort-indicator";

            if (
                sortColumn === index
            ) {
                indicator.textContent =
                    sortDirection === "asc"
                        ? " ▲"
                        : " ▼";
            }

            th.appendChild(
                indicator
            );

            th.addEventListener(
                "click",
                () => {
                    sortTable(index);
                }
            );

            headerRow.appendChild(th);
        }
    );

    dataTableHead.appendChild(
        headerRow
    );

    const total =
        filteredRows.length;

    const totalPages =
        Math.max(
            Math.ceil(
                total / pageSize
            ),
            1
        );

    if (
        currentPage >
        totalPages
    ) {
        currentPage =
            totalPages;
    }

    const start =
        (currentPage - 1) *
        pageSize;

    const end =
        Math.min(
            start + pageSize,
            total
        );

    filteredRows
        .slice(start, end)
        .forEach(row => {
            const tr =
                document.createElement(
                    "tr"
                );

            headers.forEach(
                (_, index) => {
                    const td =
                        document.createElement(
                            "td"
                        );

                    td.textContent =
                        row[index] ?? "";

                    tr.appendChild(td);
                }
            );

            dataTableBody.appendChild(
                tr
            );
        });

    paginationInfo.textContent =
        total
            ? `Memaparkan ${(
                start + 1
            ).toLocaleString()}–${end.toLocaleString()} daripada ${total.toLocaleString()} rekod`
            : "0 rekod";

    renderPagination(
        totalPages
    );
}

function sortTable(column) {
    if (
        sortColumn === column
    ) {
        sortDirection =
            sortDirection === "asc"
                ? "desc"
                : "asc";
    } else {
        sortColumn = column;
        sortDirection = "asc";
    }

    filteredRows.sort(
        (a, b) => {
            const valueA =
                String(
                    a[column] ?? ""
                )
                    .trim()
                    .toLowerCase();

            const valueB =
                String(
                    b[column] ?? ""
                )
                    .trim()
                    .toLowerCase();

            const numberA =
                Number(
                    valueA.replace(
                        /,/g,
                        ""
                    )
                );

            const numberB =
                Number(
                    valueB.replace(
                        /,/g,
                        ""
                    )
                );

            let comparison;

            if (
                valueA !== "" &&
                valueB !== "" &&
                Number.isFinite(
                    numberA
                ) &&
                Number.isFinite(
                    numberB
                )
            ) {
                comparison =
                    numberA -
                    numberB;
            } else {
                comparison =
                    valueA.localeCompare(
                        valueB
                    );
            }

            return sortDirection ===
                "asc"
                ? comparison
                : -comparison;
        }
    );

    currentPage = 1;

    renderTable();
}

function renderPagination(totalPages) {
    paginationButtons.innerHTML = "";

    if (totalPages <= 1) {
        return;
    }

    const previous =
        document.createElement(
            "button"
        );

    previous.className =
        "btn btn-sm btn-outline-secondary";

    previous.textContent = "‹";

    previous.disabled =
        currentPage === 1;

    previous.addEventListener(
        "click",
        () => {
            if (
                currentPage > 1
            ) {
                currentPage--;
                renderTable();
            }
        }
    );

    paginationButtons.appendChild(
        previous
    );

    const maxButtons = 7;

    let startPage =
        Math.max(
            1,
            currentPage -
                Math.floor(
                    maxButtons / 2
                )
        );

    let endPage =
        Math.min(
            totalPages,
            startPage +
                maxButtons -
                1
        );

    if (
        endPage -
            startPage +
            1 <
        maxButtons
    ) {
        startPage =
            Math.max(
                1,
                endPage -
                    maxButtons +
                    1
            );
    }

    for (
        let page = startPage;
        page <= endPage;
        page++
    ) {
        const button =
            document.createElement(
                "button"
            );

        button.className =
            page === currentPage
                ? "btn btn-sm btn-primary"
                : "btn btn-sm btn-outline-secondary";

        button.textContent =
            page;

        button.addEventListener(
            "click",
            () => {
                currentPage =
                    page;

                renderTable();
            }
        );

        paginationButtons.appendChild(
            button
        );
    }

    const next =
        document.createElement(
            "button"
        );

    next.className =
        "btn btn-sm btn-outline-secondary";

    next.textContent = "›";

    next.disabled =
        currentPage ===
        totalPages;

    next.addEventListener(
        "click",
        () => {
            if (
                currentPage <
                totalPages
            ) {
                currentPage++;
                renderTable();
            }
        }
    );

    paginationButtons.appendChild(
        next
    );
}

async function loadCombinedRecipientData() {
    try {
        const [recipientResponse, participantResponse] = await Promise.all([
            fetch("/api/penerima-bantuan"),
            fetch("/api/peserta-program")
        ]);

        if (!recipientResponse.ok || !participantResponse.ok) {
            throw new Error("Gagal memuatkan data dashboard.");
        }

        const recipientPayload = await recipientResponse.json();
        const participantPayload = await participantResponse.json();
        const recipients = recipientPayload.recipients || [];
        const participants = participantPayload.participants || [];
        participantTotal = participants.length;
        const contactedRecipientTotal = recipients.filter(recipient =>
            String(recipient.status ?? "").trim()
        ).length;
        const multiProgramParticipantTotal = participants.filter(participant =>
            Number(participant.jumlahProgram) > 1
        ).length;

        currentHeaders = [
            "NAMA",
            "KAD PENGENALAN",
            "TELEFON",
            "EMAIL",
            "STATUS",
            "CATATAN",
            "PIC"
        ];
        currentRows = recipients.map(recipient => [
            recipient.nama || "",
            recipient.kadPengenalan || "",
            recipient.telefon || "",
            recipient.email || "",
            recipient.status || "",
            recipient.catatan || "",
            recipient.pic || ""
        ]);
        currentDataset = { id: "combined-recipients", name: "Penerima Bantuan" };
        selectedPIC = "";
        currentPage = 1;
        sortColumn = -1;
        sortDirection = "asc";

        if (tableSearch) {
            tableSearch.value = "";
        }

        if (totalRecipients) {
            totalRecipients.textContent = recipients.length.toLocaleString();
        }
        if (totalParticipants) {
            totalParticipants.textContent = participantTotal.toLocaleString();
        }
        if (contactedRecipients) {
            contactedRecipients.textContent =
                contactedRecipientTotal.toLocaleString();
        }
        if (multiProgramParticipants) {
            multiProgramParticipants.textContent =
                multiProgramParticipantTotal.toLocaleString();
        }
        updateDashboardClock();

        populatePICFilter();
        filteredRows = [...currentRows];
        document.querySelector(".dashboard-page")?.classList.remove(
            "dashboard-data-pending"
        );
        renderTable();
        renderAnalysis();
        updateCharts();
    } catch (error) {
        console.error("Dashboard loading error:", error);
        alert(error.message);
    }
}

async function loadDatasets() {
    try {
        const response =
            await fetch(
                "/api/datasets"
            );

        if (!response.ok) {
            throw new Error(
                "Unable to load datasets."
            );
        }

        const payload =
            await response.json();

        datasets =
            Array.isArray(payload)
                ? payload
                : payload.datasets ||
                  payload.data ||
                  [];

        totalDatasets.textContent =
            datasets.length.toLocaleString();

        updateDatabaseSize();

        datasetSelect.innerHTML =
            "";

        if (!datasets.length) {
            datasetSelect.innerHTML =
                '<option value="">Tiada set data tersedia</option>';

            showNoDataset();

            return;
        }

        datasets.forEach(
            dataset => {
                const option =
                    document.createElement(
                        "option"
                    );

                option.value =
                    dataset.id;

                option.textContent =
                    `${dataset.name} (${Number(
                        dataset.row_count ||
                        0
                    ).toLocaleString()} baris)`;

                datasetSelect.appendChild(
                    option
                );
            }
        );

        await loadDataset(
            datasets[0].id
        );
    } catch (error) {
        console.error(
            "Dataset loading error:",
            error
        );

        alert(
            error.message
        );
    }
}

async function loadDataset(id) {
    if (!id) {
        showNoDataset();
        return;
    }

    try {
        datasetSelect.disabled =
            true;

        const response =
            await fetch(
                `/api/datasets/${encodeURIComponent(
                    id
                )}`
            );

        const result =
            await response.json();

        if (!response.ok) {
            throw new Error(
                result.error ||
                "Unable to load dataset."
            );
        }

        currentDataset =
            result.dataset ||
            result.data ||
            result;

        parseCSV(
            currentDataset.csv ||
            ""
        );

        selectedPIC = "";
        currentPage = 1;
        sortColumn = -1;
        sortDirection = "asc";

        if (tableSearch) {
            tableSearch.value = "";
        }

        populatePICFilter();
        populateChartColumnSelectors();

        filteredRows =
            [...currentRows];

        totalRecords.textContent =
            currentRows.length.toLocaleString();

        renderTable();
        renderAnalysis();
        updateCharts();
    } catch (error) {
        console.error(
            "Dataset error:",
            error
        );

        alert(
            error.message
        );
    } finally {
        datasetSelect.disabled =
            false;
    }
}

function parseCSV(csv) {
    currentRows = [];
    currentHeaders = [];

    if (!csv) {
        return;
    }

    const rows = [];

    let row = [];
    let value = "";
    let insideQuotes = false;

    for (
        let i = 0;
        i < csv.length;
        i++
    ) {
        const char = csv[i];
        const next = csv[i + 1];

        if (char === '"') {
            if (
                insideQuotes &&
                next === '"'
            ) {
                value += '"';
                i++;
            } else {
                insideQuotes =
                    !insideQuotes;
            }
        } else if (
            char === "," &&
            !insideQuotes
        ) {
            row.push(value);
            value = "";
        } else if (
            (
                char === "\n" ||
                char === "\r"
            ) &&
            !insideQuotes
        ) {
            if (
                char === "\r" &&
                next === "\n"
            ) {
                i++;
            }

            row.push(value);
            value = "";

            if (
                row.some(
                    cell =>
                        cell !== ""
                )
            ) {
                rows.push(row);
            }

            row = [];
        } else {
            value += char;
        }
    }

    if (
        value !== "" ||
        row.length > 0
    ) {
        row.push(value);

        if (
            row.some(
                cell =>
                    cell !== ""
            )
        ) {
            rows.push(row);
        }
    }

    if (!rows.length) {
        return;
    }

    currentHeaders =
        rows[0].map(
            (header, index) =>
                String(header).trim() ||
                `Column ${index + 1}`
        );

    currentRows =
        rows
            .slice(1)
            .map(row => {
                const normalized =
                    [...row];

                while (
                    normalized.length <
                    currentHeaders.length
                ) {
                    normalized.push(
                        ""
                    );
                }

                return normalized.slice(
                    0,
                    currentHeaders.length
                );
            });
}

function updateDatabaseSize() {
    const size =
        datasets.reduce(
            (total, dataset) =>
                total +
                Number(
                    dataset.file_size ||
                    0
                ),
            0
        );

    databaseSize.textContent =
        formatFileSize(size);
}

function formatFileSize(bytes) {
    if (bytes < 1024) {
        return `${bytes} B`;
    }

    if (
        bytes <
        1024 * 1024
    ) {
        return `${(
            bytes / 1024
        ).toFixed(1)} KB`;
    }

    if (
        bytes <
        1024 *
            1024 *
            1024
    ) {
        return `${(
            bytes /
            1024 /
            1024
        ).toFixed(1)} MB`;
    }

    return `${(
        bytes /
        1024 /
        1024 /
        1024
    ).toFixed(2)} GB`;
}

function showNoDataset() {
    currentDataset = null;

    currentRows = [];
    currentHeaders = [];
    filteredRows = [];

    selectedPIC = "";

    picSelect.innerHTML =
        '<option value="">Semua PIC</option>';

    picSelect.disabled =
        true;

    totalRecords.textContent =
        "0";

    dataTableHead.innerHTML =
        "";

    dataTableBody.innerHTML =
        "";

    paginationInfo.textContent =
        "0 records";

    paginationButtons.innerHTML =
        "";

    analysisDescription.textContent =
        "Pilih set data untuk melihat analisis kualiti data";

    analysisSummary.innerHTML =
        "";

    analysisColumns.innerHTML =
        "";

    destroyCharts();
}

function getCategoryCounts(columnIndex) {
    const counts = new Map();

    const rows =
        getPICFilteredRows();

    rows.forEach(row => {
        const rawValue =
            String(
                row[columnIndex] ?? ""
            ).trim();

        if (!rawValue) {
            counts.set(
                "(Kosong)",
                (
                    counts.get(
                        "(Kosong)"
                    ) || 0
                ) + 1
            );

            return;
        }

        const categories =
            rawValue
                .split(",")
                .map(
                    value =>
                        value.trim()
                )
                .filter(Boolean);

        categories.forEach(
            category => {
                counts.set(
                    category,
                    (
                        counts.get(
                            category
                        ) || 0
                    ) + 1
                );
            }
        );
    });

    return [
        ...counts.entries()
    ].sort(
        (a, b) =>
            b[1] - a[1]
    );
}

function chartColors(count) {
    const palette = [
        "#344F61",
        "#6E93AA",
        "#9FBCCB",
        "#B8CFDB",
        "#7D9BA9",
        "#CBDCE3"
    ];

    return Array.from(
        { length: count },
        (_, index) => palette[index % palette.length]
    );
}

function createLegendItem(
    container,
    label,
    count
) {
    const item =
        document.createElement(
            "div"
        );

    item.className =
        "legend-item";

    const dot =
        document.createElement(
            "span"
        );

    dot.className =
        "legend-dot";

    const text =
        document.createElement(
            "span"
        );

    text.textContent =
        label;

    const countElement =
        document.createElement(
            "span"
        );

    countElement.className =
        "legend-count";

    countElement.textContent =
        typeof count === "number"
            ? count.toLocaleString()
            : count;

    item.append(
        dot,
        text,
        countElement
    );

    container.appendChild(
        item
    );
}

function renderCategoryLegend(
    container,
    entries,
    showPercentages
) {
    container.innerHTML =
        "";

    const total =
        entries.reduce(
            (sum, [, count]) =>
                sum + count,
            0
        );

    entries.forEach(
        ([label, count]) => {
            const percentage =
                total
                    ? (
                        count /
                        total *
                        100
                    ).toFixed(1)
                    : "0.0";

            createLegendItem(
                container,
                label,
                showPercentages
                    ? `${percentage}% (${count.toLocaleString()})`
                    : count
            );
        }
    );
}

function destroyCharts() {
    [lineChart, barChart, pieChart].forEach(chart => {
        if (chart) {
            chart.destroy();
        }
    });

    lineChart = null;
    barChart = null;
    pieChart = null;

    lineLegend.innerHTML =
        "";

    barLegend.innerHTML =
        "";

    pieLegend.innerHTML =
        "";

    pieTotal.textContent =
        "0";
}

function updateCharts() {
    updateBarChart();
    updatePieChart();
}

function updateBarChart() {
    if (barChart) {
        barChart.destroy();
        barChart = null;
    }

    barLegend.innerHTML =
        "";

    const section =
        document.getElementById(
            "barChartSection"
        );

    if (!section) {
        return;
    }

    const wrapper =
        section.querySelector(
            ".chart-wrapper"
        );

    const legend =
        section.querySelector(
            ".chart-legend"
        );

    const barIndex = getHeaders().findIndex(
        header => String(header).trim().toLowerCase() === "status"
    );

    if (!currentRows.length || barIndex < 0) {
        wrapper.style.display =
            "none";

        legend.style.display =
            "none";

        return;
    }

    wrapper.style.display =
        "";

    legend.style.display =
        "";

    const columnIndex =
        Number(barIndex);

    const entries =
        getCategoryCounts(
            columnIndex
        );

    if (!entries.length) {
        return;
    }

    barChart = new Chart(
        document.getElementById("barChart"),
        {
            type: "bar",
            data: {
                labels: entries.map(([label]) => label),
                datasets: [{
                    label: "Kuantiti",
                    data: entries.map(([, count]) => count),
                    backgroundColor: chartColors(entries.length),
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                onClick: (event, elements) => {
                    const index = elements[0]?.index;
                    const value = entries[index]?.[0];
                    if (value !== undefined) {
                        openChartFilter(columnIndex, value);
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: context =>
                                `Kuantiti: ${context.parsed.y.toLocaleString()}`
                        }
                    }
                },
                scales: {
                    x: { grid: { display: false } },
                    y: { beginAtZero: true, ticks: { precision: 0 } }
                },
                animation: { duration: 250 }
            }
        }
    );

    renderCategoryLegend(
        barLegend,
        entries,
        false
    );
}

function updatePieChart() {
    if (pieChart) {
        pieChart.destroy();
        pieChart = null;
    }

    pieLegend.innerHTML =
        "";

    pieTotal.textContent =
        "0";

    const section =
        document.getElementById(
            "pieChartSection"
        );

    if (!section) {
        return;
    }

    const wrapper =
        section.querySelector(
            ".pie-wrapper"
        );

    const legend =
        section.querySelector(
            ".chart-legend"
        );

    const pieIndex = getHeaders().findIndex(
        header => String(header).trim().toLowerCase() === "status"
    );

    if (!currentRows.length || pieIndex < 0) {
        wrapper.style.display =
            "none";

        legend.style.display =
            "none";

        return;
    }

    wrapper.style.display =
        "";

    legend.style.display =
        "";

    const columnIndex =
        Number(pieIndex);

    const entries =
        getCategoryCounts(
            columnIndex
        );

    if (!entries.length) {
        return;
    }

    const total =
        entries.reduce(
            (sum, [, count]) =>
                sum + count,
            0
        );

    pieTotal.textContent =
        total.toLocaleString();

    pieChart = new Chart(
        document.getElementById("pieChart"),
        {
            type: "doughnut",
            data: {
                labels: entries.map(([label]) => label),
                datasets: [{
                    data: entries.map(([, count]) => count),
                    backgroundColor: chartColors(entries.length),
                    borderWidth: 3,
                    hoverOffset: 12
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: "64%",
                onClick: (event, elements) => {
                    const index = elements[0]?.index;
                    const value = entries[index]?.[0];
                    if (value !== undefined) {
                        openChartFilter(columnIndex, value);
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: context => {
                                const percentage = total
                                    ? (context.parsed / total * 100).toFixed(1)
                                    : "0.0";
                                return `${context.label}: ${percentage}% (${context.parsed.toLocaleString()})`;
                            }
                        }
                    }
                }
            }
        }
    );

    renderCategoryLegend(
        pieLegend,
        entries,
        true
    );
}

function populateChartColumnSelectors() {
    const headers =
        getHeaders();

    [
        barColumnSelect,
        pieColumnSelect
    ].forEach(
        select => {
            if (!select) {
                return;
            }

            const previousValue =
                select.value;

            select.innerHTML =
                "";

            const placeholder =
                document.createElement(
                    "option"
                );

            placeholder.value =
                "";

            placeholder.textContent =
                "Pilih lajur";

            select.appendChild(
                placeholder
            );

            headers.forEach(
                (
                    header,
                    index
                ) => {
                    const option =
                        document.createElement(
                            "option"
                        );

                    option.value =
                        index;

                    option.textContent =
                        header ||
                        `Column ${index + 1}`;

                    select.appendChild(
                        option
                    );
                }
            );

            if (
                previousValue !==
                    "" &&
                headers[
                    Number(
                        previousValue
                    )
                ] !== undefined
            ) {
                select.value =
                    previousValue;

                return;
            }

            const statusIndex =
                headers.findIndex(
                    header =>
                        String(
                            header
                        )
                            .trim()
                            .toLowerCase() ===
                        "status"
                );

            if (
                statusIndex !== -1
            ) {
                select.value =
                    statusIndex;
            }
        }
    );
}

function renderAnalysis() {
    analysisSummary.innerHTML =
        "";

    analysisColumns.innerHTML =
        "";

    const headers =
        getHeaders();

    const rows =
        getPICFilteredRows();

    const rowCount =
        rows.length;

    const columnCount =
        headers.length;

    if (
        !currentDataset ||
        !columnCount
    ) {
        analysisDescription.textContent =
            "Pilih set data untuk melihat analisis kualiti data";

        return;
    }

    let filledCells = 0;

    const rowKeys =
        new Set();

    let duplicateRows = 0;

    rows.forEach(
        row => {
            const key =
                JSON.stringify(
                    row
                );

            if (
                rowKeys.has(
                    key
                )
            ) {
                duplicateRows++;
            } else {
                rowKeys.add(
                    key
                );
            }
        }
    );

    const columnAnalysis =
        headers.map(
            (
                header,
                index
            ) => {
                const values =
                    rows.map(
                        row =>
                            String(
                                row[
                                    index
                                ] ??
                                ""
                            ).trim()
                    );

                const filled =
                    values.filter(
                        Boolean
                    );

                filledCells +=
                    filled.length;

                const numericValues =
                    filled
                        .map(
                            value =>
                                Number(
                                    value.replace(
                                        /,/g,
                                        ""
                                    )
                                )
                        )
                        .filter(
                            value =>
                                Number.isFinite(
                                    value
                                )
                        );

                const isNumeric =
                    filled.length >
                        0 &&
                    numericValues.length ===
                        filled.length;

                return {
                    header,
                    filled:
                        filled.length,
                    empty:
                        rowCount -
                        filled.length,
                    distinct:
                        new Set(
                            filled
                        ).size,
                    isNumeric,
                    numericValues
                };
            }
        );

    const totalCells =
        rowCount *
        columnCount;

    const completeness =
        totalCells
            ? (
                filledCells /
                totalCells *
                100
            )
            : 0;

    analysisDescription.textContent =
        `${
            currentDataset.name ||
            "Set data terpilih"
        } · ${
            rowCount.toLocaleString()
        } baris dianalisis` +
        (
            selectedPIC
                ? ` · PIC: ${selectedPIC}`
                : ""
        );

    const metrics = [
        [
            "Lajur",
            columnCount
        ],

        [
            "Kelengkapan",
            `${completeness.toFixed(
                1
            )}%`
        ],

        [
            "Sel diisi",
            filledCells
        ],

        [
            "Baris pendua",
            duplicateRows
        ]
    ];

    metrics.forEach(
        ([label, value]) => {
            const card =
                document.createElement(
                    "div"
                );

            card.className =
                "analysis-metric";

            const labelElement =
                document.createElement(
                    "div"
                );

            labelElement.className =
                "analysis-metric-label";

            labelElement.textContent =
                label;

            const valueElement =
                document.createElement(
                    "div"
                );

            valueElement.className =
                "analysis-metric-value";

            valueElement.textContent =
                typeof value ===
                "number"
                    ? value.toLocaleString()
                    : value;

            card.append(
                labelElement,
                valueElement
            );

            analysisSummary.appendChild(
                card
            );
        }
    );

    columnAnalysis.forEach(
        item => {
            const row =
                document.createElement(
                    "tr"
                );

            let type;

            if (
                item.isNumeric &&
                item.numericValues.length
            ) {
                type =
                    `Numeric: ${Math.min(
                        ...item.numericValues
                    ).toLocaleString()} – ${Math.max(
                        ...item.numericValues
                    ).toLocaleString()}`;
            } else {
                type =
                    "Teks / campuran";
            }

            [
                item.header,
                item.filled.toLocaleString(),
                item.empty.toLocaleString(),
                item.distinct.toLocaleString(),
                type
            ].forEach(
                value => {
                    const cell =
                        document.createElement(
                            "td"
                        );

                    cell.textContent =
                        value;

                    row.appendChild(
                        cell
                    );
                }
            );

            analysisColumns.appendChild(
                row
            );
        }
    );
}

if (tableSearch) {
    tableSearch.addEventListener(
        "input",
        applyFilters
    );
}

if (pageSizeSelect) {
    pageSizeSelect.addEventListener(
        "change",
        () => {
            pageSize =
                Number(
                    pageSizeSelect.value
                );

            currentPage = 1;

            renderTable();
        }
    );
}

if (picSelect) {
    picSelect.addEventListener(
        "change",
        () => {
            selectedPIC =
                picSelect.value;

            applyFilters();
        }
    );
}

initializeDashboard();

document.addEventListener("app:page-loaded", () => {
    const pathname = typeof window.appPathname === "function"
        ? window.appPathname(window.location.pathname)
        : window.location.pathname;
    if (pathname === "/") {
        initializeDashboard();
    }
});
})();