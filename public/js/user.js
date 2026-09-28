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

const rowsPerPage = 10;
const userColors = {
    Dini: "#2563eb",
    Ezri: "#db2777",
    Faiz: "#059669",
    Rais: "#d97706"
};
const userBadgeStyles = {
    Dini: "background:#dbeafe;color:#1d4ed8",
    Ezri: "background:#fce7f3;color:#be185d",
    Faiz: "background:#d1fae5;color:#047857",
    Rais: "background:#fef3c7;color:#b45309"
};

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
        selectLatestProgressMonth();
    } catch (error) {
        console.error("Failed to load user activity:", error);
        activities = [];
        statusCount = 0;
        progressChange = 0;
    }

    currentPage = 1;

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

function getLatestProgressMonth() {
    const months = getProgressMonths();
    return months[months.length - 1] || "";
}

function getProgressMonths() {
    return activities
        .map(normalizeActivity)
        .filter(isProgressActivity)
        .map(activity => String(activity.createdAt).slice(0, 7))
        .filter(month => /^\d{4}-\d{2}$/.test(month))
        .sort();
}

function selectLatestProgressMonth() {
    const latestMonth = getLatestProgressMonth();
    const currentMonth = formatMonthKey(
        new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    );

    if (!latestMonth || latestMonth > currentMonth) return;

    const [year, month] = latestMonth.split("-").map(Number);
    chartMonth = new Date(year, month - 1, 1);
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
            dailyByUser.set(username, Array(daysInMonth).fill(0));
        }

        dailyByUser.get(username)[day - 1] += Number(
            activity.progress_change ?? activity.progressChange ?? 0
        );
    });

    const datasets = [...dailyByUser.entries()]
        .sort(([first], [second]) => first.localeCompare(second))
        .map(([username, dailyValues], index) => {
            let cumulative = 0;
            const color = userColors[username] || [
                "#7c3aed", "#0891b2", "#dc2626", "#4f46e5", "#65a30d", "#c026d3"
            ][index % 6];

            return {
                label: username,
                data: dailyValues.map(value => {
                    cumulative += value;
                    return cumulative;
                }),
                borderColor: color,
                backgroundColor: color,
                borderWidth: 2,
                tension: 0.3,
                fill: false,
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
                    title: { display: false }
                },
                y: {
                    beginAtZero: true,
                    min: 0,
                    title: {
                        display: true,
                        text: "PROGRES TERKUMPUL"
                    },
                    ticks: {
                        stepSize: 1
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

    const total =
        normalized.length;

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
        normalized.slice(
            start,
            start + rowsPerPage
        );

    tbody.innerHTML = "";

    if (!pageRows.length) {
        const row =
            document.createElement(
                "tr"
            );

        row.innerHTML = `
            <td colspan="8" class="audit-empty">
                No activity found
            </td>
        `;

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

            const actionLabels = {
                STATUS_CHANGE: "UPDATE",
                DATASET_CREATE: "DATASET ADD",
                DATASET_DELETE: "DATASET DELETE"
            };
            const actionText = actionLabels[activity.action] || activity.action;
            const actionClass = {
                DATASET_CREATE: "dataset-add",
                DATASET_DELETE: "dataset-delete"
            }[activity.action] || actionText.toLowerCase().replaceAll(" ", "-");
            const action = escapeHTML(actionText);
            const user = escapeHTML(activity.username);
            const userBadgeStyle = userBadgeStyles[activity.username] ||
                "background:#f3f4f6;color:#475467";

            row.innerHTML = `
                <td class="audit-user">
                    <span class="audit-user-badge" style="${userBadgeStyle}">
                        ${user}
                    </span>
                </td>

                <td>
                    <span class="audit-action ${actionClass}">
                        ${action || "—"}
                    </span>
                </td>

                <td>
                    ${escapeHTML(
                        activity.dataset
                    )}
                </td>

                <td>
                    ${escapeHTML(
                        activity.row
                    )}
                </td>

                <td>
                    ${escapeHTML(
                        activity.column
                    )}
                </td>

                <td class="audit-value">
                    ${escapeHTML(
                        activity.oldValue || "—"
                    )}
                </td>

                <td class="audit-value">
                    ${escapeHTML(
                        activity.newValue || "—"
                    )}
                </td>

                <td>
                    ${escapeHTML(
                        [dateTime.date, dateTime.time].filter(Boolean).join(" ")
                    )}
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
}

function escapeHTML(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function initializeUserPage() {
    if (document.getElementById("auditTableBody")) {
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
                currentPage = Math.min(Math.max(1, Math.ceil(activities.length / rowsPerPage)), currentPage + 1);
                renderTable();
            }],
            ["auditLastPage", () => {
                currentPage = Math.max(1, Math.ceil(activities.length / rowsPerPage));
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
        loadActivities();
    }
}

document.addEventListener(
    "DOMContentLoaded",
    initializeUserPage
);
document.addEventListener(
    "app:page-loaded",
    initializeUserPage
);
})();