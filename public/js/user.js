(() => {
let auditChart = null;
let activities = [];
let currentPage = 1;
let statusCount = 0;
let progressChange = 0;
let chartMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let earliestActivityMonth = "";
let monthActivities = [];
let monthRequestId = 0;
let isolatedLegendUser = null;
let searchQuery = "";
let selectedActivityUser = "";
let selectedActivityAction = "";
let selectedActivityColumn = "";
let selectedActivityDataset = "";
let selectedActivityStartDate = "";
let selectedActivityEndDate = "";
let draftActivityStartDate = "";
let draftActivityEndDate = "";
let auditCalendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

const rowsPerPage = 10;

function getUserBadgeStyle(username) {
    const color = window.getInverseTextAverageColor(username);
    const background = `#${[1, 3, 5].map(offset => {
        const channel = parseInt(color.slice(offset, offset + 2), 16);
        return Math.round(channel + (255 - channel) * 0.85)
            .toString(16)
            .padStart(2, "0");
    }).join("").toUpperCase()}`;
    const textColor = `#${[1, 3, 5].map(offset =>
        Math.round(parseInt(color.slice(offset, offset + 2), 16) * 0.72)
            .toString(16)
            .padStart(2, "0")
    ).join("").toUpperCase()}`;
    return `background:${background};color:${textColor}`;
}

async function loadActivities() {
    try {
        const response = await fetch("/api/user/activity?limit=1000", {
            method: "GET",
            credentials: "same-origin",
            cache: "no-store"
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        if (data && Array.isArray(data.activities)) {
            activities = data.activities;
        } else if (Array.isArray(data)) {
            activities = data;
        } else {
            activities = [];
        }

        statusCount = Number(data?.statusCount || 0);
        progressChange = Number(data?.progressChange || 0);
        earliestActivityMonth = String(
            data?.earliestActivityMonth || getEarliestProgressMonth()
        );
    } catch (error) {
        console.error("Failed to load user activity:", error);
        activities = [];
        statusCount = 0;
        progressChange = 0;
    }

    currentPage = 1;

    populateActivityFilters();
    renderChart();
    renderTable();
    await loadChartMonth();
}

function formatMonthKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function isProgressActivity(activity) {
    return activity.action === "STATUS_CHANGE" ||
        (activity.action === "UPDATE" &&
            activity.column.trim().toUpperCase() === "STATUS");
}

function progressForActivity(activity) {
    const oldFilled = String(activity.oldValue ?? "").trim() !== "";
    const newFilled = String(activity.newValue ?? "").trim() !== "";

    if (!oldFilled && newFilled) return 1;
    if (oldFilled && !newFilled) return -1;
    return 0;
}

function getEarliestProgressMonth() {
    return getProgressMonths()[0] || "";
}

function getProgressMonths() {
    return activities
        .map(normalizeActivity)
        .filter(isProgressActivity)
        .map(activity => String(activity.createdAt).slice(0, 7))
        .filter(month => /^\d{4}-\d{2}$/.test(month))
        .sort();
}

function getProgressActivitiesForMonth(month) {
    return activities
        .map(normalizeActivity)
        .filter(activity =>
            isProgressActivity(activity) &&
            String(activity.createdAt).slice(0, 7) === month
        )
        .map(activity => ({
            username: activity.username,
            day: Number(String(activity.createdAt).slice(8, 10)),
            progress_change: progressForActivity(activity)
        }))
        .filter(activity => Number.isInteger(activity.day));
}

function updateMonthNavigation() {
    const label = document.getElementById("auditMonthLabel");
    const previous = document.getElementById("auditPreviousMonth");
    const next = document.getElementById("auditNextMonth");
    const currentMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const monthKey = formatMonthKey(chartMonth);

    if (label) {
        label.textContent = chartMonth.toLocaleDateString("ms-MY", {
            month: "long",
            year: "numeric"
        });
    }

    if (previous) {
        previous.disabled = Boolean(
            earliestActivityMonth && monthKey <= earliestActivityMonth
        );
    }

    if (next) {
        next.disabled = chartMonth >= currentMonth;
    }
}

async function loadChartMonth() {
    updateMonthNavigation();
    const requestId = ++monthRequestId;

    try {
        const response = await fetch(
            `/api/user/activity/month?month=${encodeURIComponent(formatMonthKey(chartMonth))}`,
            {
                method: "GET",
                credentials: "same-origin",
                cache: "no-store"
            }
        );

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        if (requestId !== monthRequestId) return;
        monthActivities = Array.isArray(data?.activities)
            ? data.activities
            : [];
        isolatedLegendUser = null;
        if (!monthActivities.length) {
            monthActivities = getProgressActivitiesForMonth(
                formatMonthKey(chartMonth)
            );
        }
        earliestActivityMonth = String(
            data?.earliestActivityMonth ||
            earliestActivityMonth ||
            getEarliestProgressMonth()
        );
    } catch (error) {
        if (requestId !== monthRequestId) return;
        console.error("Failed to load monthly status activity:", error);
        monthActivities = getProgressActivitiesForMonth(
            formatMonthKey(chartMonth)
        );
        isolatedLegendUser = null;
    }

    updateMonthNavigation();
    renderChart();
}

function changeChartMonth(offset) {
    const target = new Date(
        chartMonth.getFullYear(),
        chartMonth.getMonth() + offset,
        1
    );
    const currentMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const targetKey = formatMonthKey(target);

    if (
        target > currentMonth ||
        (offset < 0 && earliestActivityMonth && targetKey < earliestActivityMonth)
    ) {
        return;
    }

    chartMonth = target;
    loadChartMonth();
}

function normalizeActivity(activity) {
    return {
        id: activity.id ?? "",
        username: activity.username ?? "",
        dataset:
            activity.dataset_name ??
            activity.dataset ??
            "",
        action:
            String(activity.action ?? "")
                .trim()
                .toUpperCase(),
        row:
            activity.row_id ??
            activity.row ??
            "",
        column:
            activity.column_name ??
            activity.column ??
            "",
        oldValue:
            activity.old_value ??
            activity.oldValue ??
            "",
        newValue:
            activity.new_value ??
            activity.newValue ??
            "",
        progressChange:
            Number(
                activity.progress_change ??
                activity.progressChange ??
                0
            ),
        createdAt:
            activity.created_at ??
            activity.createdAt ??
            ""
    };
}

function getDatasetMetadataChanges(activity) {
    if (
        activity.action !== "DATASET_UPDATE" ||
        String(activity.column).trim().toLowerCase() !== "metadata"
    ) {
        return null;
    }

    let oldMetadata;
    let newMetadata;
    try {
        oldMetadata = JSON.parse(activity.oldValue);
        newMetadata = JSON.parse(activity.newValue);
    } catch {
        return {
            fields: ["Metadata"],
            changes: [{ oldValue: "Tidak dapat dibaca", newValue: "Tidak dapat dibaca" }]
        };
    }

    if (
        !oldMetadata || typeof oldMetadata !== "object" || Array.isArray(oldMetadata) ||
        !newMetadata || typeof newMetadata !== "object" || Array.isArray(newMetadata)
    ) {
        return {
            fields: ["Metadata"],
            changes: [{ oldValue: "Tidak dapat dibaca", newValue: "Tidak dapat dibaca" }]
        };
    }

    const fieldLabels = {
        name: "Nama",
        datasetType: "Jenis Set Data",
        unitInCharge: "Unit"
    };
    const changes = [...new Set([...Object.keys(oldMetadata), ...Object.keys(newMetadata)])]
        .filter(key => JSON.stringify(oldMetadata[key]) !== JSON.stringify(newMetadata[key]))
        .map(key => ({
            field: fieldLabels[key] ||
                key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/^./, character => character.toUpperCase()),
            oldValue: formatAuditMetadataValue(oldMetadata[key]),
            newValue: formatAuditMetadataValue(newMetadata[key])
        }));

    return {
        fields: changes.length ? changes.map(change => change.field) : ["—"],
        changes: changes.length ? changes : [{ oldValue: "—", newValue: "Tiada perubahan" }]
    };
}

function formatAuditMetadataValue(value) {
    if (value === null || value === undefined || String(value).trim() === "") {
        return "—";
    }
    return typeof value === "object" ? JSON.stringify(value) : String(value);
}

function parseCreatedAt(createdAt) {
    if (!createdAt) {
        return null;
    }

    const value = String(createdAt).trim();

    const match = value.match(
        /^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/
    );

    if (match) {
        return new Date(
            Number(match[1]),
            Number(match[2]) - 1,
            Number(match[3]),
            Number(match[4]),
            Number(match[5]),
            Number(match[6])
        );
    }

    const parsed = new Date(value);

    if (Number.isNaN(parsed.getTime())) {
        return null;
    }

    return parsed;
}

function formatDateTime(createdAt) {
    if (!createdAt) {
        return {
            date: "",
            time: ""
        };
    }

    const value = String(createdAt).trim();

    const match = value.match(
        /^(\d{4}-\d{2}-\d{2})\s+(.+)$/
    );

    if (match) {
        return {
            date: match[1],
            time: match[2]
        };
    }

    const parsed = new Date(value);

    if (!Number.isNaN(parsed.getTime())) {
        return {
            date: parsed.toLocaleDateString(),
            time: parsed.toLocaleTimeString()
        };
    }

    return {
        date: value,
        time: ""
    };
}

function getDateKey(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
        return "";
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function getLastMonthDates() {
    const dates = [];
    const today = new Date();

    const start = new Date(
        today.getFullYear(),
        today.getMonth() - 1,
        today.getDate()
    );

    const cursor = new Date(
        start.getFullYear(),
        start.getMonth(),
        start.getDate()
    );

    while (cursor <= today) {
        dates.push(getDateKey(cursor));
        cursor.setDate(cursor.getDate() + 1);
    }

    return dates;
}

function createChartData() {
    const daysInMonth = new Date(
        chartMonth.getFullYear(),
        chartMonth.getMonth() + 1,
        0
    ).getDate();
    const today = new Date();
    const visibleDays = chartMonth.getFullYear() === today.getFullYear() &&
        chartMonth.getMonth() === today.getMonth()
        ? today.getDate()
        : daysInMonth;
    const labels = Array.from({ length: daysInMonth }, (_, index) => {
        const date = new Date(chartMonth.getFullYear(), chartMonth.getMonth(), index + 1);
        return date.toLocaleDateString("ms-MY", {
            day: "numeric",
            month: "short",
            year: "numeric"
        });
    });
    const dailyByUser = new Map();

    monthActivities.forEach(activity => {
        const username = String(activity.username || "").trim() || "Unknown";
        const day = Number(activity.day);
        if (!Number.isInteger(day) || day < 1 || day > daysInMonth) return;

        if (!dailyByUser.has(username)) {
            dailyByUser.set(username, {
                values: Array(daysInMonth).fill(0)
            });
        }

        dailyByUser.get(username).values[day - 1] += Number(
            activity.progress_change ?? activity.progressChange ?? 0
        );
    });

    const datasets = [...dailyByUser.entries()]
        .sort(([first], [second]) => first.localeCompare(second))
        .map(([username, { values: dailyValues }]) => {
            let cumulative = 0;
            const color = window.getInverseTextAverageColor(username);
            const [red, green, blue] = color.match(/[A-F0-9]{2}/gi).map(channel =>
                Number.parseInt(channel, 16)
            );
            const lineColor = `rgba(${red}, ${green}, ${blue}, 0.65)`;
            const fillColor = `rgba(${red}, ${green}, ${blue}, 0.12)`;

            return {
                label: username,
                data: dailyValues.map((value, index) => {
                    cumulative += value;
                    return index < visibleDays ? cumulative : null;
                }),
                borderColor: lineColor,
                backgroundColor: fillColor,
                borderWidth: 2,
                tension: 0,
                fill: true,
                pointRadius: 3,
                pointHoverRadius: 5,
                spanGaps: true
            };
        });

    return {
        labels,
        datasets
    };
}

function renderChart() {
    const canvas =
        document.getElementById(
            "auditLineChart"
        );

    if (
        !canvas ||
        typeof Chart === "undefined"
    ) {
        return;
    }

    const data =
        createChartData();

    const progressValues = data.datasets.flatMap(dataset =>
        dataset.data.filter(Number.isFinite)
    );
    const lowestProgress = progressValues.length
        ? Math.min(...progressValues)
        : 0;
    const highestProgress = progressValues.length
        ? Math.max(...progressValues)
        : 0;
    const progressAxisPadding = highestProgress >= 10
        ? Math.ceil(highestProgress * 0.05)
        : 0;
    const progressAxisMaximum = Math.max(
        10,
        highestProgress + progressAxisPadding
    );

    if (auditChart) {
        auditChart.destroy();
        auditChart = null;
    }

    auditChart = new Chart(canvas, {
        type: "line",
        data: {
            labels: data.labels,
            datasets: data.datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                intersect: false,
                mode: "nearest",
                axis: "xy"
            },
            plugins: {
                legend: {
                    display: true,
                    onClick: (event, legendItem, legend) => {
                        const chart = legend.chart;
                        const clickedIndex = legendItem.datasetIndex;
                        const clickedUser = chart.data.datasets[clickedIndex]?.label;
                        if (!clickedUser) return;

                        isolatedLegendUser =
                            isolatedLegendUser === clickedUser
                                ? null
                                : clickedUser;
                        chart.data.datasets.forEach((dataset, index) => {
                            const isVisible = isolatedLegendUser === null ||
                                dataset.label === isolatedLegendUser;
                            chart.setDatasetVisibility(index, isVisible);
                        });
                        chart.update();
                    }
                },
                tooltip: {
                    mode: "nearest",
                    intersect: false,
                    callbacks: {
                        label: context =>
                            `${context.dataset.label}: ${context.raw} progres terkumpul`
                    }
                }
            },
            scales: {
                x: {
                    ticks: { display: false },
                    title: {
                        display: true,
                        text: "HARI"
                    }
                },
                y: {
                    min: lowestProgress - 1,
                    max: progressAxisMaximum,
                    title: {
                        display: true,
                        text: "PROGRES"
                    },
                    ticks: {
                        callback: value => value
                    }
                }
            }
        }
    });
}

function renderTable() {
    const tbody =
        document.getElementById(
            "auditTableBody"
        );

    const info =
        document.getElementById(
            "auditPaginationInfo"
        );

    if (
        !tbody ||
        !info
    ) {
        return;
    }

    const normalized =
        activities.map(
            normalizeActivity
        );

    const filteredActivities = normalized.filter(activity => {
        const action = getActivityActionLabel(activity.action);
        const matchesSearch = !searchQuery || [
            activity.username,
            action,
            activity.dataset,
            activity.row,
            activity.column,
            activity.oldValue,
            activity.newValue,
            activity.createdAt
        ].some(value => String(value ?? "").toLocaleLowerCase().includes(searchQuery));
        return matchesSearch &&
            (!selectedActivityUser || activity.username === selectedActivityUser) &&
            (!selectedActivityAction || action === selectedActivityAction) &&
            (!selectedActivityColumn || activity.column === selectedActivityColumn) &&
            (!selectedActivityDataset || activity.dataset === selectedActivityDataset) &&
            ((!selectedActivityStartDate && !selectedActivityEndDate) ||
                (getActivityDateKey(activity.createdAt) >= selectedActivityStartDate &&
                    getActivityDateKey(activity.createdAt) <= selectedActivityEndDate));
    });

    const total = filteredActivities.length;

    const totalPages =
        Math.max(
            Math.ceil(
                total /
                rowsPerPage
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
        rowsPerPage;

    const pageRows =
        filteredActivities.slice(
            start,
            start + rowsPerPage
        );

    tbody.innerHTML = "";

    if (!pageRows.length) {
        const row =
            document.createElement(
                "tr"
            );

        row.innerHTML = `<td colspan="5" class="audit-empty">Tiada aktiviti sepadan</td>`;

        tbody.appendChild(row);
    } else {
        pageRows.forEach(activity => {
            const row =
                document.createElement(
                    "tr"
                );

            const dateTime =
                formatDateTime(
                    activity.createdAt
                );

            const actionText = getActivityActionLabel(activity.action);
            const actionClass = getActivityActionBadgeClass(activity.action);
            const action = escapeHTML(actionText);
            const user = escapeHTML(activity.username);
            const userBadgeStyle = getUserBadgeStyle(activity.username);
            const metadataChanges = getDatasetMetadataChanges(activity);
            const previousValue = escapeHTML(activity.oldValue || "—");
            const nextValue = escapeHTML(activity.newValue || "—");
            const locationContent = metadataChanges
                ? `<div class="audit-location-values audit-metadata-fields">${metadataChanges.fields
                    .map(field => `<span class="audit-location-badge">${escapeHTML(field)}</span>`)
                    .join("")}</div>`
                : `<div class="audit-location-values">
                    <span class="audit-location-badge" title="${escapeHTML(activity.row || "—")}"><span class="audit-location-text">${escapeHTML(activity.row || "—")}</span></span>
                    <span class="audit-location-transition" aria-hidden="true">, </span>
                    <span class="audit-location-badge" title="${escapeHTML(activity.column || "—")}"><span class="audit-location-text">${escapeHTML(activity.column || "—")}</span></span>
                </div>`;
            const changeContent = metadataChanges
                ? `<div class="audit-change-values audit-metadata-changes">${metadataChanges.changes
                    .map(change => `<div class="audit-metadata-change">
                        <span class="audit-value-badge old" title="${escapeHTML(change.oldValue)}"><span class="audit-value-text">${escapeHTML(change.oldValue)}</span></span>
                        <span class="audit-value-transition" aria-hidden="true">&gt;</span>
                        <span class="audit-value-badge new" title="${escapeHTML(change.newValue)}"><span class="audit-value-text">${escapeHTML(change.newValue)}</span></span>
                    </div>`)
                    .join("")}</div>`
                : `<div class="audit-change-values">
                    <span class="audit-value-badge old" title="${previousValue}"><span class="audit-value-text">${previousValue}</span></span>
                    <span class="audit-value-transition" aria-hidden="true">&gt;</span>
                    <span class="audit-value-badge new" title="${nextValue}"><span class="audit-value-text">${nextValue}</span></span>
                </div>`;

            row.innerHTML = `
                <td class="audit-user audit-user-cell">
                    <span class="audit-user-badge" style="${userBadgeStyle}">
                        ${user}
                    </span>
                </td>

                <td>
                    <span class="audit-action ${actionClass}">
                        ${action || "—"}
                    </span>
                </td>

                <td class="audit-location-cell">
                    ${locationContent}
                </td>

                <td class="audit-change-cell">
                    ${changeContent}
                </td>

                <td>
                    ${escapeHTML([dateTime.date, dateTime.time].filter(Boolean).join(" ") || "—")}
                </td>
            `;
            tbody.appendChild(row);
        });
    }

    const first = total ? start + 1 : 0;
    const last = Math.min(start + pageRows.length, total);
    info.textContent = total
        ? `${first.toLocaleString()}-${last.toLocaleString()} daripada ${total.toLocaleString()} aktiviti`
        : "0 aktiviti";

    document.getElementById("auditFirstPage").disabled = currentPage === 1;
    document.getElementById("auditPreviousPage").disabled = currentPage === 1;
    document.getElementById("auditNextPage").disabled = currentPage === totalPages;
    document.getElementById("auditLastPage").disabled = currentPage === totalPages;
    const filterButton = document.getElementById("auditFilterButton");
    filterButton?.classList.toggle(
        "active",
        Boolean(selectedActivityUser || selectedActivityAction || selectedActivityColumn || selectedActivityDataset)
    );
    const dateButton = document.getElementById("auditDateFilterButton");
    const calendarMenu = document.getElementById("auditCalendarMenu");
    const hasDateRange = Boolean(selectedActivityStartDate && selectedActivityEndDate);
    dateButton?.classList.toggle("active", hasDateRange);
    if (dateButton) {
        const label = hasDateRange
            ? `Tapis tarikh: ${formatActivityDateKey(selectedActivityStartDate)} hingga ${formatActivityDateKey(selectedActivityEndDate)}`
            : "Pilih julat tarikh";
        dateButton.title = label;
        dateButton.setAttribute("aria-label", label);
    }
    dateButton?.setAttribute("aria-expanded", String(Boolean(calendarMenu?.classList.contains("show"))));
}

function getActivityActionLabel(action) {
    const normalizedAction = String(action ?? "").trim().toUpperCase();
    return ({
        EDIT: "UPDATE",
        STATUS_CHANGE: "UPDATE",
        DATASET_CREATE: "DATASET ADD",
        DATASET_UPDATE: "DATASET UPDATE",
        DATASET_DELETE: "DATASET DELETE"
    })[normalizedAction] || normalizedAction.replace(/_+/g, " ");
}

function getActivityActionBadgeClass(action) {
    const normalizedAction = String(action ?? "").trim().toUpperCase().replace(/[\s-]+/g, "_");
    const datasetBadgeClasses = {
        DATASET_CREATE: "dataset-add",
        DATASET_ADD: "dataset-add",
        DATASET_UPDATE: "dataset-update",
        DATASET_DELETE: "dataset-delete"
    };
    if (datasetBadgeClasses[normalizedAction]) {
        return datasetBadgeClasses[normalizedAction];
    }

    if (normalizedAction === "STATUS_CHANGE") {
        return "update";
    }

    const verb = normalizedAction.split("_").pop();
    if (["ADD", "ADDED", "CREATE", "CREATED", "INSERT", "INSERTED"].includes(verb)) {
        return "add";
    }
    if (["DELETE", "DELETED", "REMOVE", "REMOVED"].includes(verb)) {
        return "delete";
    }
    if (["CHANGE", "CHANGED", "EDIT", "EDITED", "UPDATE", "UPDATED"].includes(verb)) {
        return "update";
    }
    return "other";
}

function populateActivityFilters() {
    const userFilter = document.getElementById("auditUserFilter");
    const actionFilter = document.getElementById("auditActionFilter");
    const columnFilter = document.getElementById("auditColumnFilter");
    const datasetFilter = document.getElementById("auditDatasetFilter");
    if (!userFilter || !actionFilter || !columnFilter || !datasetFilter) return;

    const selectedUser = userFilter.value || selectedActivityUser;
    const selectedAction = actionFilter.value || selectedActivityAction;
    const selectedColumn = columnFilter.value || selectedActivityColumn;
    const selectedDataset = datasetFilter.value || selectedActivityDataset;
    const normalized = activities.map(normalizeActivity);
    const users = [...new Set(normalized.map(activity => activity.username).filter(Boolean))]
        .sort((first, second) => first.localeCompare(second));
    const actions = [...new Set(normalized.map(activity => getActivityActionLabel(activity.action)).filter(Boolean))]
        .sort((first, second) => first.localeCompare(second));
    const columns = [...new Set(normalized.map(activity => activity.column).filter(Boolean))]
        .sort((first, second) => first.localeCompare(second));
    const datasets = [...new Set(normalized.map(activity => activity.dataset).filter(Boolean))]
        .sort((first, second) => first.localeCompare(second));

    userFilter.replaceChildren(new Option("Semua pengguna", ""));
    users.forEach(user => userFilter.add(new Option(user, user)));
    actionFilter.replaceChildren(new Option("Semua tindakan", ""));
    actions.forEach(action => actionFilter.add(new Option(action, action)));
    columnFilter.replaceChildren(new Option("Semua lajur", ""));
    columns.forEach(column => columnFilter.add(new Option(column, column)));
    datasetFilter.replaceChildren(new Option("Semua set data", ""));
    datasets.forEach(dataset => datasetFilter.add(new Option(dataset, dataset)));

    userFilter.value = users.includes(selectedUser) ? selectedUser : "";
    actionFilter.value = actions.includes(selectedAction) ? selectedAction : "";
    columnFilter.value = columns.includes(selectedColumn) ? selectedColumn : "";
    datasetFilter.value = datasets.includes(selectedDataset) ? selectedDataset : "";
    selectedActivityUser = userFilter.value;
    selectedActivityAction = actionFilter.value;
    selectedActivityColumn = columnFilter.value;
    selectedActivityDataset = datasetFilter.value;
}

function escapeHTML(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function getActivityDateKey(createdAt) {
    const parsed = parseCreatedAt(createdAt);
    if (!parsed) return "";
    return [
        parsed.getFullYear(),
        String(parsed.getMonth() + 1).padStart(2, "0"),
        String(parsed.getDate()).padStart(2, "0")
    ].join("-");
}

function formatActivityDateKey(dateKey) {
    if (!dateKey) return "";
    const [year, month, day] = dateKey.split("-");
    return `${day}/${month}/${year}`;
}

function renderAuditCalendar() {
    const monthLabel = document.getElementById("auditCalendarMonth");
    const daysContainer = document.getElementById("auditCalendarDays");
    const preview = document.getElementById("auditCalendarPreview");
    const applyButton = document.getElementById("auditCalendarApply");
    if (!monthLabel || !daysContainer || !preview || !applyButton) return;

    const year = auditCalendarMonth.getFullYear();
    const month = auditCalendarMonth.getMonth();
    const monthNames = [
        "Januari", "Februari", "Mac", "April", "Mei", "Jun",
        "Julai", "Ogos", "September", "Oktober", "November", "Disember"
    ];
    monthLabel.textContent = `${monthNames[month]} ${year}`;

    const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const todayKey = getActivityDateKey(new Date());
    const hasRange = Boolean(draftActivityStartDate && draftActivityEndDate);
    const rangeStart = hasRange
        ? (draftActivityStartDate < draftActivityEndDate ? draftActivityStartDate : draftActivityEndDate)
        : "";
    const rangeEnd = hasRange
        ? (draftActivityStartDate > draftActivityEndDate ? draftActivityStartDate : draftActivityEndDate)
        : "";
    const buttons = [];

    for (let index = 0; index < firstWeekday; index += 1) {
        buttons.push('<span class="audit-calendar-empty" aria-hidden="true"></span>');
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
        const dateKey = [
            year,
            String(month + 1).padStart(2, "0"),
            String(day).padStart(2, "0")
        ].join("-");
        const classes = ["audit-calendar-day"];
        if (hasRange && dateKey >= rangeStart && dateKey <= rangeEnd) classes.push("in-range");
        if (dateKey === draftActivityStartDate) classes.push("range-start");
        if (dateKey === draftActivityEndDate) classes.push("range-end");
        if (dateKey === todayKey) classes.push("today");
        buttons.push(
            `<button type="button" class="${classes.join(" ")}" data-calendar-date="${dateKey}" aria-pressed="${dateKey === draftActivityStartDate || dateKey === draftActivityEndDate}">${day}</button>`
        );
    }

    daysContainer.innerHTML = buttons.join("");
    preview.textContent = draftActivityStartDate
        ? draftActivityEndDate
            ? `${formatActivityDateKey(draftActivityStartDate)} hingga ${formatActivityDateKey(draftActivityEndDate)}`
            : formatActivityDateKey(draftActivityStartDate)
        : "";
    applyButton.disabled = !hasRange;
}

function initializeUserPage() {
    if (document.getElementById("auditTableBody")) {
        const search = document.getElementById("auditSearch");
        if (search && search.dataset.bound !== "true") {
            search.dataset.bound = "true";
            search.addEventListener("input", () => {
                searchQuery = search.value.trim().toLocaleLowerCase();
                currentPage = 1;
                renderTable();
            });
        }
        const filterButton = document.getElementById("auditFilterButton");
        const filterMenu = document.getElementById("auditFilterMenu");
        if (filterButton && filterButton.dataset.bound !== "true") {
            filterButton.dataset.bound = "true";
            filterButton.addEventListener("click", event => {
                event.stopPropagation();
                const isOpen = filterMenu?.classList.toggle("show") || false;
                filterButton.setAttribute("aria-expanded", String(isOpen));
            });
        }
        if (filterMenu && filterMenu.dataset.bound !== "true") {
            filterMenu.dataset.bound = "true";
            filterMenu.addEventListener("click", event => event.stopPropagation());
            document.addEventListener("click", event => {
                if (filterMenu.contains(event.target) || filterButton?.contains(event.target)) return;
                filterMenu.classList.remove("show");
                filterButton?.setAttribute("aria-expanded", "false");
            });
        }
        const dateButton = document.getElementById("auditDateFilterButton");
        const calendarMenu = document.getElementById("auditCalendarMenu");
        if (dateButton && calendarMenu && dateButton.dataset.bound !== "true") {
            dateButton.dataset.bound = "true";
            dateButton.addEventListener("click", event => {
                event.stopPropagation();
                const willOpen = !calendarMenu.classList.contains("show");
                calendarMenu.classList.toggle("show", willOpen);
                if (willOpen) {
                    draftActivityStartDate = selectedActivityStartDate;
                    draftActivityEndDate = selectedActivityEndDate;
                    const selectedDate = selectedActivityStartDate || selectedActivityEndDate;
                    const parsedDate = selectedDate
                        ? parseCreatedAt(`${selectedDate} 00:00:00`)
                        : new Date();
                    auditCalendarMonth = new Date(
                        parsedDate.getFullYear(),
                        parsedDate.getMonth(),
                        1
                    );
                    renderAuditCalendar();
                }
                dateButton.setAttribute("aria-expanded", String(willOpen));
            });
        }
        if (calendarMenu && calendarMenu.dataset.bound !== "true") {
            calendarMenu.dataset.bound = "true";
            calendarMenu.addEventListener("click", event => {
                event.stopPropagation();
                const target = event.target.closest("button");
                if (!target) return;

                if (target.dataset.calendarOffset) {
                    auditCalendarMonth.setMonth(
                        auditCalendarMonth.getMonth() + Number(target.dataset.calendarOffset)
                    );
                    renderAuditCalendar();
                    return;
                }

                if (target.dataset.calendarDate) {
                    const selectedDate = target.dataset.calendarDate;
                    if (!draftActivityStartDate || draftActivityEndDate) {
                        draftActivityStartDate = selectedDate;
                        draftActivityEndDate = "";
                    } else if (selectedDate < draftActivityStartDate) {
                        draftActivityEndDate = draftActivityStartDate;
                        draftActivityStartDate = selectedDate;
                    } else {
                        draftActivityEndDate = selectedDate;
                    }
                    renderAuditCalendar();
                    return;
                }

                if (target.id === "auditCalendarApply" && draftActivityStartDate && draftActivityEndDate) {
                    selectedActivityStartDate = draftActivityStartDate;
                    selectedActivityEndDate = draftActivityEndDate;
                    calendarMenu.classList.remove("show");
                    currentPage = 1;
                    renderTable();
                } else if (target.id === "auditCalendarClear") {
                    selectedActivityStartDate = "";
                    selectedActivityEndDate = "";
                    draftActivityStartDate = "";
                    draftActivityEndDate = "";
                    calendarMenu.classList.remove("show");
                    currentPage = 1;
                    renderTable();
                    renderAuditCalendar();
                }
            });
            document.addEventListener("click", event => {
                if (calendarMenu.contains(event.target) || dateButton?.contains(event.target)) return;
                calendarMenu.classList.remove("show");
                dateButton?.setAttribute("aria-expanded", "false");
            });
        }
        [["auditUserFilter", "user"], ["auditActionFilter", "action"], ["auditColumnFilter", "column"], ["auditDatasetFilter", "dataset"]].forEach(([id, field]) => {
            const select = document.getElementById(id);
            if (!select || select.dataset.bound === "true") return;
            select.dataset.bound = "true";
            select.addEventListener("change", () => {
                if (field === "user") selectedActivityUser = select.value;
                else if (field === "action") selectedActivityAction = select.value;
                else if (field === "column") selectedActivityColumn = select.value;
                else selectedActivityDataset = select.value;
                currentPage = 1;
                renderTable();
            });
        });
        const previous = document.getElementById("auditPreviousMonth");
        const next = document.getElementById("auditNextMonth");
        if (previous && previous.dataset.bound !== "true") {
            previous.dataset.bound = "true";
            previous.addEventListener("click", () => changeChartMonth(-1));
        }
        if (next && next.dataset.bound !== "true") {
            next.dataset.bound = "true";
            next.addEventListener("click", () => changeChartMonth(1));
        }
        const pageActions = [
            ["auditFirstPage", () => { currentPage = 1; renderTable(); }],
            ["auditPreviousPage", () => { currentPage = Math.max(1, currentPage - 1); renderTable(); }],
            ["auditNextPage", () => {
                currentPage = Math.min(
                    Math.max(1, Math.ceil(getFilteredActivityCount() / rowsPerPage)),
                    currentPage + 1
                );
                renderTable();
            }],
            ["auditLastPage", () => {
                currentPage = Math.max(1, Math.ceil(getFilteredActivityCount() / rowsPerPage));
                renderTable();
            }]
        ];
        pageActions.forEach(([id, handler]) => {
            const button = document.getElementById(id);
            if (button && button.dataset.bound !== "true") {
                button.dataset.bound = "true";
                button.addEventListener("click", handler);
            }
        });
        return loadActivities();
    }
}

function getFilteredActivityCount() {
    const query = searchQuery;
    return activities.map(normalizeActivity).filter(activity => {
        const action = getActivityActionLabel(activity.action);
        const matchesSearch = !query || [
            activity.username, action, activity.dataset, activity.row,
            activity.column, activity.oldValue, activity.newValue, activity.createdAt
        ].some(value => String(value ?? "").toLocaleLowerCase().includes(query));
        return matchesSearch &&
            (!selectedActivityUser || activity.username === selectedActivityUser) &&
            (!selectedActivityAction || action === selectedActivityAction) &&
            (!selectedActivityColumn || activity.column === selectedActivityColumn) &&
            (!selectedActivityDataset || activity.dataset === selectedActivityDataset) &&
            ((!selectedActivityStartDate && !selectedActivityEndDate) ||
                (getActivityDateKey(activity.createdAt) >= selectedActivityStartDate &&
                    getActivityDateKey(activity.createdAt) <= selectedActivityEndDate));
    }).length;
}

document.addEventListener(
    "DOMContentLoaded",
    () => window.registerAppPageLoadTask(initializeUserPage())
);
document.addEventListener(
    "app:page-loaded",
    () => window.registerAppPageLoadTask(initializeUserPage())
);
})();