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
let selectedParticipantUnit = "";
let selectedParticipantYear = "";
let currentUserUnit = "";
let participantUnitDefaultInitialized = false;
let participantYearDefaultInitialized = false;
let dashboardMode = "recipients";
let recipientRows = [];
let participantRows = [];
let dashboardRowsLoaded = false;
let participantProgramDrilldown = null;
let participantRowsVersion = 0;
let participantChartEntriesCacheKey = "";
let participantChartEntriesCache = [];
let barChartViewKey = null;

let lineChart = null;
let barChart = null;
let pieChart = null;
let pieChartExitInProgress = false;
let pieChartExitVersion = 0;
let barChartEntranceTimeout = null;

let picSelect;
let totalRecords;
let totalRecipients;
let totalParticipants;
let contactedRecipients;
let uncontactedRecipients;
let multiProgramParticipants;
let currentDateTime;
let currentDate;
let currentTime;
let dashboardLegendList;
let dashboardLegendSignature = null;
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
const chartColorCache = new Map();
const statNumberAnimationFrames = new WeakMap();
const chartPalette = [
    "#60A5FA",
    "#FB923C",
    "#34D399",
    "#A78BFA",
    "#F472B6",
    "#FACC15",
    "#22D3EE",
    "#F87171",
    "#A3E635",
    "#C084FC",
    "#2DD4BF",
    "#FDBA74",
    "#F9A8D4",
    "#93C5FD",
    "#86EFAC",
    "#FDE047",
    "#C4B5FD",
    "#67E8F9",
    "#FCA5A5",
    "#818CF8",
    "#6EE7B7",
    "#E879F9",
    "#FBBF24",
    "#7DD3FC"
];

function shouldReduceDashboardMotion() {
    const isUppDashboard = Boolean(
        document.querySelector(".bpa-shell-page.dashboard-page")
    );
    return !isUppDashboard
        && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const barHoverLiftPlugin = {
    id: "barHoverLift",
    afterDatasetsDraw(chart) {
        const active = chart.getActiveElements().find(
            element => element.datasetIndex === 0
        );
        if (!active) {
            return;
        }

        const bar = chart.getDatasetMeta(active.datasetIndex).data[active.index];
        const { x, y, base, width } = bar.getProps(["x", "y", "base", "width"]);
        const left = x - width / 2;
        const top = Math.max(chart.chartArea.top, y);
        const right = x + width / 2;
        const radius = Math.min(5, width / 2, Math.max(0, (base - top) / 2));
        const ctx = chart.ctx;

        ctx.save();
        ctx.beginPath();
        ctx.rect(
            chart.chartArea.left,
            chart.chartArea.top,
            chart.chartArea.right - chart.chartArea.left,
            chart.chartArea.bottom - chart.chartArea.top
        );
        ctx.clip();
        ctx.fillStyle = bar.options.backgroundColor;
        ctx.shadowColor = "rgba(15, 23, 42, .28)";
        ctx.shadowBlur = 12;
        ctx.shadowOffsetY = 3;
        ctx.beginPath();
        ctx.moveTo(left + radius, top);
        ctx.lineTo(right - radius, top);
        ctx.quadraticCurveTo(right, top, right, top + radius);
        ctx.lineTo(right, base - radius);
        ctx.quadraticCurveTo(right, base, right - radius, base);
        ctx.lineTo(left + radius, base);
        ctx.quadraticCurveTo(left, base, left, base - radius);
        ctx.lineTo(left, top + radius);
        ctx.quadraticCurveTo(left, top, left + radius, top);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }
};

function finishDashboardBarChartEntrance(canvas) {
    if (barChartEntranceTimeout !== null) {
        window.clearTimeout(barChartEntranceTimeout);
        barChartEntranceTimeout = null;
    }
    canvas?.classList.remove("dashboard-chart-animating");
}

const dashboardChartTooltipPlugin = {
    id: "dashboardChartTooltip",
    afterDraw(chart) {
        const tooltip = chart.tooltip;
        const canvas = chart.canvas;
        const wrapper = canvas.parentElement;
        let tooltipElement = wrapper.querySelector(".dashboard-chart-tooltip");

        if (!tooltipElement) {
            tooltipElement = document.createElement("div");
            tooltipElement.className = "dashboard-chart-tooltip";
            tooltipElement.setAttribute("role", "tooltip");
            wrapper.append(tooltipElement);
        }

        if (!tooltip || tooltip.opacity === 0) {
            tooltipElement.style.opacity = "0";
            return;
        }

        tooltipElement.replaceChildren();
        tooltip.title.forEach((titleText, index) => {
            const title = document.createElement("div");
            title.className = "dashboard-chart-tooltip-title";
            title.textContent = titleText;
            if (index === tooltip.title.length - 1 && tooltip.body.length) {
                title.style.marginBottom = "4px";
            }
            tooltipElement.append(title);
        });

        tooltip.body.forEach((bodyItem, index) => {
            const point = tooltip.dataPoints[index];
            bodyItem.lines.forEach(lineText => {
                const row = document.createElement("div");
                row.className = "dashboard-chart-tooltip-row";

                if (tooltip.options.displayColors && point) {
                    const marker = document.createElement("span");
                    marker.className = "dashboard-chart-tooltip-marker";
                    marker.style.backgroundColor = Array.isArray(point.dataset.backgroundColor)
                        ? point.dataset.backgroundColor[point.dataIndex]
                        : point.dataset.backgroundColor;
                    row.append(marker);
                }

                const text = document.createElement("span");
                text.textContent = lineText;
                row.append(text);
                tooltipElement.append(row);
            });
        });

        const canvasRect = canvas.getBoundingClientRect();
        const wrapperRect = wrapper.getBoundingClientRect();
        tooltipElement.style.left = `${canvasRect.left - wrapperRect.left + tooltip.x}px`;
        tooltipElement.style.top = `${canvasRect.top - wrapperRect.top + tooltip.y}px`;
        tooltipElement.style.opacity = "1";
    }
};

async function initializeDashboard(animateCharts = false, resetToDefault = false) {
    if (resetToDefault) {
        dashboardMode = "recipients";
        selectedPIC = "";
        selectedParticipantUnit = "";
        selectedParticipantYear = "";
        currentUserUnit = "";
        participantUnitDefaultInitialized = false;
        participantYearDefaultInitialized = false;
        participantProgramDrilldown = null;
        currentPage = 1;
    }
    participantProgramDrilldown = null;
    barChartViewKey = null;
    const participantYearSelect = document.getElementById("participantYearSelect");
    if (resetToDefault && participantYearSelect) {
        const currentYear = String(new Date().getFullYear());
        selectedParticipantYear = [...participantYearSelect.options]
            .some(option => option.value === currentYear)
            ? currentYear
            : "";
        participantYearSelect.value = selectedParticipantYear;
    }
    picSelect = document.getElementById("picSelect");
    totalRecords = document.getElementById("totalRecords");
    totalRecipients = document.getElementById("totalRecipients");
    totalParticipants = document.getElementById("totalParticipants");
    contactedRecipients = document.getElementById("contactedRecipients");
    uncontactedRecipients = document.getElementById("uncontactedRecipients");
    multiProgramParticipants = document.getElementById("multiProgramParticipants");
    currentDateTime = document.getElementById("currentDateTime");
    currentDate = document.getElementById("currentDate");
    currentTime = document.getElementById("currentTime");
    dashboardLegendList = document.getElementById("dashboardLegendList");
    dashboardLegendSignature = null;
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

    if (animateCharts) {
        [
            totalRecipients,
            totalParticipants,
            contactedRecipients,
            uncontactedRecipients,
            multiProgramParticipants
        ].forEach(startDashboardStatNumberJumble);
    }

    dashboardRowsLoaded = false;
    updateDashboardClock();

    if (clockInterval) {
        clearInterval(clockInterval);
    }

    clockInterval = setInterval(updateDashboardClock, 1000);

    if (picSelect.dataset.initialized !== "true") {
        picSelect.dataset.initialized = "true";

        setupDashboardStatCards();
        document.getElementById("programChartBackButton")?.addEventListener("click", () => {
            participantProgramDrilldown = null;
            updateCharts();
        });
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
        document.addEventListener("change", event => {
            let animateUnitChange = false;
            if (event.target?.id === "participantUnitSelect") {
                selectedParticipantUnit = event.target.value;
                populateParticipantYearOptions();
                animateUnitChange = true;
            } else if (event.target?.id === "participantYearSelect") {
                selectedParticipantYear = event.target.value;
            } else {
                return;
            }
            participantProgramDrilldown = null;
            updateParticipantFilterStatCards(true, animateUnitChange);
            updateCharts();
        });
    }

    setDashboardMode(dashboardMode, false);
    arrangeDashboard();
    document.querySelector(".dashboard-page")?.classList.add(
        "dashboard-data-pending"
    );
    await loadCombinedRecipientData(animateCharts);
}

window.initializeDashboard = initializeDashboard;

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

function startDashboardStatNumberJumble(element) {
    if (
        !element ||
        element.textContent.trim() !== "—" ||
        shouldReduceDashboardMotion()
    ) {
        return;
    }

    const update = now => {
        const previousTick = Number(element.dataset.jumbleTick || "0");
        if (now - previousTick >= 65) {
            element.dataset.jumbleTick = String(now);
            element.textContent = `${Math.floor(Math.random() * 10)},${Array.from(
                { length: 3 },
                () => Math.floor(Math.random() * 10)
            ).join("")}`;
        }
        statNumberAnimationFrames.set(element, window.requestAnimationFrame(update));
    };

    element.dataset.jumbleTick = "0";
    statNumberAnimationFrames.set(element, window.requestAnimationFrame(update));
}

function stopDashboardStatNumberJumble(element) {
    if (!element || !element.dataset.jumbleTick) return;

    const frame = statNumberAnimationFrames.get(element);
    if (frame !== undefined) {
        window.cancelAnimationFrame(frame);
        statNumberAnimationFrames.delete(element);
    }
    delete element.dataset.jumbleTick;
    element.removeAttribute("aria-label");
    element.textContent = "—";
}

function animateDashboardStatNumber(element, value, duration = 450) {
    const target = String(value);
    const previousFrame = statNumberAnimationFrames.get(element);
    if (previousFrame !== undefined) {
        window.cancelAnimationFrame(previousFrame);
        statNumberAnimationFrames.delete(element);
    }
    delete element.dataset.jumbleTick;

    if (shouldReduceDashboardMotion()) {
        element.textContent = target;
        element.removeAttribute("aria-label");
        return;
    }

    element.setAttribute("aria-label", target);
    const digitCount = (target.match(/\d/g) || []).length;
    const startedAt = performance.now();

    const update = now => {
        const progress = Math.min((now - startedAt) / duration, 1);
        let digitIndex = 0;
        element.textContent = target.replace(/\d/g, digit => {
            const lockAt = .58 + ((digitIndex + 1) / digitCount) * .4;
            digitIndex += 1;
            if (progress >= lockAt) return digit;

            const randomDigit = Math.floor(Math.random() * 10);
            return String(randomDigit === Number(digit) ? (randomDigit + 1) % 10 : randomDigit);
        });

        if (progress < 1) {
            statNumberAnimationFrames.set(element, window.requestAnimationFrame(update));
        } else {
            statNumberAnimationFrames.delete(element);
            element.textContent = target;
            element.removeAttribute("aria-label");
        }
    };

    statNumberAnimationFrames.set(element, window.requestAnimationFrame(update));
}

function updatePieTotal(value) {
    if (!pieTotal) {
        return;
    }

    const target = Number(value).toLocaleString();
    if (
        pieTotal.dataset.jumbleTarget === target &&
        statNumberAnimationFrames.has(pieTotal)
    ) {
        return;
    }

    pieTotal.dataset.jumbleTarget = target;
    if (pieTotal.textContent.trim() === target) return;
    animateDashboardStatNumber(pieTotal, target, 1900);
}

function updateParticipantFilterStatCards(animate = true, animateUnitChange = false) {
    const yearSelect = document.getElementById("participantYearSelect");
    const unitSelect = document.getElementById("participantUnitSelect");
    const selectedYear = yearSelect?.value || "";
    const unitValue = unitSelect?.value || selectedParticipantUnit;
    const selectedUnit = [...(unitSelect?.options || [])]
        .find(option => option.value === unitValue)?.textContent.trim()
        || currentUserUnit
        || "Semua";
    const participantCardLabel = document.getElementById("participantCardLabel");
    const participantCardUnit = document.getElementById("participantCardUnit");
    const previousUnitLabel = participantCardUnit?.textContent.trim();
    const participantCardUnitDisplay = participantCardUnit?.closest(".participant-card-unit");
    if (participantCardUnitDisplay) {
        participantCardUnitDisplay.hidden = false;
    }
    if (participantCardLabel) {
        participantCardLabel.textContent = selectedYear
            ? `JUMLAH PESERTA PROGRAM (${selectedYear})`
            : "JUMLAH PESERTA PROGRAM";
    }
    if (participantCardUnit) {
        participantCardUnit.textContent = selectedUnit;
    }
    if (!dashboardRowsLoaded) return;

    let participantCount = 0;
    let multiProgramCount = 0;
    participantRows.forEach(row => {
        const units = String(row[5] ?? "")
            .split(",")
            .map(unit => unit.trim())
            .filter(Boolean);
        const matchesUnit = !selectedParticipantUnit
            || (selectedParticipantUnit === "__NO_UNIT__"
                ? units.length === 0
                : units.includes(selectedParticipantUnit));
        if (!matchesUnit) return;

        const programs = [...new Set(
            String(row[4] ?? "")
                .split(",")
                .map(program => program.trim())
                .filter(program => program && (
                    !selectedParticipantYear ||
                    getProgramYear(program) === selectedParticipantYear
                ))
        )];
        if (selectedParticipantYear && !programs.length) return;

        participantCount += 1;
        if (programs.length > 1) multiProgramCount += 1;
    });

    if (participantCardUnitDisplay) {
        participantCardUnitDisplay.hidden = participantCount === 0;
    }
    if (
        animateUnitChange &&
        participantCount > 0 &&
        participantCardUnit &&
        previousUnitLabel !== selectedUnit
    ) {
        animateDashboardStatCardLabel(
            participantCardUnit,
            "participant-card-unit-enter"
        );
    }

    if (totalParticipants) {
        const value = participantCount.toLocaleString();
        if (animate) {
            animateDashboardStatNumber(totalParticipants, value);
        } else {
            const previousFrame = statNumberAnimationFrames.get(totalParticipants);
            if (previousFrame !== undefined) {
                window.cancelAnimationFrame(previousFrame);
                statNumberAnimationFrames.delete(totalParticipants);
            }
            totalParticipants.textContent = value;
            totalParticipants.removeAttribute("aria-label");
        }
    }
    if (multiProgramParticipants) {
        const value = multiProgramCount.toLocaleString();
        if (animate) {
            animateDashboardStatNumber(multiProgramParticipants, value);
        } else {
            const previousFrame = statNumberAnimationFrames.get(multiProgramParticipants);
            if (previousFrame !== undefined) {
                window.cancelAnimationFrame(previousFrame);
                statNumberAnimationFrames.delete(multiProgramParticipants);
            }
            multiProgramParticipants.textContent = value;
            multiProgramParticipants.removeAttribute("aria-label");
        }
    }
}

function animateDashboardStatCardLabel(element, className) {
    element.classList.remove(className);
    void element.offsetWidth;
    element.classList.add(className);
    element.addEventListener("animationend", event => {
        if (event.target === element) {
            element.classList.remove(className);
        }
    }, { once: true });
}

function updateRecipientCardPic() {
    const recipientCardPic = document.getElementById("recipientCardPic");
    if (!recipientCardPic) return;

    const selectedLabel = picSelect?.selectedOptions[0]?.textContent.trim() || "Semua";
    const nextLabel = selectedLabel === "Semua" ? "" : selectedLabel;
    if (recipientCardPic.textContent === nextLabel) return;

    recipientCardPic.textContent = nextLabel;
    if (nextLabel) {
        animateDashboardStatCardLabel(
            recipientCardPic,
            "recipient-card-pic-enter"
        );
    }
}

function arrangeDashboard() {
    const dashboardContent =
        document.querySelector(".dashboard-content");

    if (!dashboardContent || !statsSection) {
        return;
    }

    const dashboardTitle = dashboardContent.querySelector(".bpa-upp-dashboard-title");
    if (dashboardTitle) {
        dashboardTitle.after(statsSection);
    } else {
        dashboardContent.prepend(statsSection);
    }
}

function setupDashboardStatCards() {
    document.querySelectorAll(".stat-card[data-dashboard-mode]").forEach(card => {
        if (card.dataset.clickBound === "true") {
            return;
        }

        card.dataset.clickBound = "true";
        const activate = () => {
            const mode = card.dataset.dashboardMode;
            if (mode === "recipients" || mode === "participants") {
                setDashboardMode(mode, true);
            }
        };

        card.addEventListener("click", activate);
        card.addEventListener("keydown", event => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                activate();
            }
        });
    });
}

function animateUppChartCards() {
    const root = document.querySelector(".bpa-shell-page.dashboard-page");
    const cards = [...(root?.querySelectorAll("#chartsSection .chart-card") || [])]
        .filter(card => card.getClientRects().length > 0);

    cards.forEach((card, index) => {
        card.classList.remove("bpa-upp-dashboard-enter");
        const delay = index * 55;
        card.style.setProperty("--bpa-upp-enter-delay", `${delay}ms`);
        void card.offsetWidth;
        card.classList.add("bpa-upp-dashboard-enter");

        let timeoutId;
        const cleanup = () => {
            card.classList.remove("bpa-upp-dashboard-enter");
            card.style.removeProperty("--bpa-upp-enter-delay");
            card.removeEventListener("animationend", finishAnimation);
            window.clearTimeout(timeoutId);
        };
        const finishAnimation = event => {
            if (event.target === card && event.animationName === "bpa-upp-fade-in-up") {
                cleanup();
            }
        };

        card.addEventListener("animationend", finishAnimation);
        timeoutId = window.setTimeout(cleanup, delay + 700);
    });
}

function animateUppChartAreas() {
    const root = document.querySelector(".bpa-shell-page.dashboard-page");
    const areas = [...(root?.querySelectorAll(
        "#chartsSection .chart-wrapper, #chartsSection .pie-wrapper"
    ) || [])].filter(area => area.getClientRects().length > 0);

    areas.forEach(area => {
        area.classList.remove("bpa-upp-chart-area-enter");
        void area.offsetWidth;
        area.classList.add("bpa-upp-chart-area-enter");
        area.addEventListener("animationend", event => {
            if (event.target === area && event.animationName === "bpa-upp-fade-in-up") {
                area.classList.remove("bpa-upp-chart-area-enter");
            }
        }, { once: true });
    });
}

function animateUppModeHeaderAndControls(root) {
    const title = root.querySelector(".bpa-upp-dashboard-title");
    const controls = [...(root.querySelectorAll(".bpa-upp-dashboard-actions > .bpa-admin-action") || [])]
        .filter(control => control.getClientRects().length > 0);

    const targets = [
        ...(title ? [[title, "bpa-upp-mode-title-enter", 0]] : []),
        ...controls.map((control, index) => [
            control,
            "bpa-upp-mode-control-enter",
            index * 70
        ])
    ];
    targets.forEach(([element, className, delay]) => {
        element.classList.remove(className);
        element.style.setProperty("--bpa-upp-mode-enter-delay", `${delay}ms`);
        void element.offsetWidth;
        element.classList.add(className);

        let timeoutId;
        const cleanup = () => {
            element.classList.remove(className);
            element.style.removeProperty("--bpa-upp-mode-enter-delay");
            element.removeEventListener("animationend", finishAnimation);
            window.clearTimeout(timeoutId);
        };
        const finishAnimation = event => {
            if (event.target === element && event.animationName === "bpa-upp-fade-in-up") {
                cleanup();
            }
        };

        element.addEventListener("animationend", finishAnimation);
        timeoutId = window.setTimeout(cleanup, delay + 700);
    });
}

function setDashboardMode(mode, animateEntrance = true, animateParticipantStats = false) {
    const previousMode = dashboardMode;
    if (previousMode !== mode) {
        participantProgramDrilldown = null;
    }
    dashboardMode = mode;
    const isParticipants = mode === "participants";
    const recordsOverviewSection = document.getElementById("recordsOverviewSection");
    if (!dashboardRowsLoaded && recordsOverviewSection) {
        recordsOverviewSection.style.display = isParticipants ? "none" : "";
    }
    if (isParticipants) {
        updateParticipantFilterStatCards(animateParticipantStats);
    }
    if (animateEntrance && previousMode !== mode) {
        animateUppChartCards();
    }

    const dashboardContentTitle = document.getElementById("dashboardDataTitle");
    const dashboardContentDescription = document.getElementById("dashboardDataDescription");
    const analysisTitle = document.getElementById("datasetAnalysisTitle");
    const noDataTitle = document.getElementById("dashboardNoDataTitle");
    const noDataMessage = document.getElementById("dashboardNoDataMessage");
    const recordsTitle = document.getElementById("dashboardRecordsTitle");
    const recordsDescription = document.getElementById("dashboardRecordsDescription");
    const picControl = document.querySelector(".pic-control");
    const unitControl = document.querySelector(".bpa-upp-unit-action");
    const yearControl = document.querySelector(".bpa-upp-year-action");
    const pieCenterLabel = document.getElementById("pieCenterLabel");
    const dashboardLegendTitle = document.getElementById("dashboardLegendTitle");

    if (dashboardLegendTitle) {
        dashboardLegendTitle.textContent = isParticipants ? "PROGRAM" : "STATUS";
        if (
            previousMode !== mode &&
            !document.querySelector(".bpa-shell-page.dashboard-page.bpa-upp-dashboard-preloading")
        ) {
            dashboardLegendTitle.classList.remove("dashboard-legend-content-enter");
            void dashboardLegendTitle.offsetWidth;
            dashboardLegendTitle.classList.add("dashboard-legend-content-enter");
            dashboardLegendTitle.addEventListener("animationend", () => {
                dashboardLegendTitle.classList.remove("dashboard-legend-content-enter");
            }, { once: true });
        }
    }

    document.querySelectorAll(".stat-card[data-dashboard-mode]").forEach(card => {
        const selected = card.dataset.dashboardMode === mode;
        if (card.dataset.dashboardMode !== "unchanged") {
            card.classList.toggle("is-selected", selected);
            card.setAttribute("aria-pressed", String(selected));
        }
    });

    if (dashboardContentTitle) {
        dashboardContentTitle.textContent = isParticipants
            ? "Peserta Program"
            : "Penerima Bantuan";
    }
    if (dashboardContentDescription) {
        dashboardContentDescription.textContent = isParticipants
            ? "Data gabungan semua peserta program"
            : "Data gabungan semua penerima bantuan";
    }
    if (analysisTitle) {
        analysisTitle.textContent = isParticipants
            ? "Analisis Peserta Program"
            : "Analisis Penerima Bantuan";
    }
    if (noDataTitle) {
        noDataTitle.textContent = isParticipants
            ? "Tiada data peserta program"
            : "Tiada data penerima bantuan";
    }
    if (noDataMessage) {
        noDataMessage.textContent = isParticipants
            ? "Tiada data peserta program untuk dipaparkan."
            : "Tiada data penerima bantuan untuk dipaparkan.";
    }
    if (recordsTitle) {
        recordsTitle.textContent = isParticipants
            ? "Rekod Peserta Program"
            : "Rekod Penerima Bantuan";
    }
    if (recordsDescription) {
        recordsDescription.textContent = isParticipants
            ? "Lihat, cari dan susun rekod peserta program"
            : "Lihat, cari dan susun rekod penerima bantuan";
    }
    if (tableSearch) {
        tableSearch.placeholder = isParticipants
            ? "Cari peserta program..."
            : "Cari penerima bantuan...";
    }
    if (picControl) {
        picControl.style.display = isParticipants ? "none" : "";
        const picAction = picControl.closest(".bpa-upp-pic-action");
        if (picAction) {
            picAction.style.display = isParticipants ? "none" : "";
        }
    }
    if (unitControl) {
        unitControl.style.display = isParticipants ? "" : "none";
    }
    if (yearControl) {
        yearControl.style.display = isParticipants ? "" : "none";
    }
    const unitSelect = document.getElementById("participantUnitSelect");
    if (unitSelect) {
        unitSelect.value = selectedParticipantUnit;
    }
    const yearSelect = document.getElementById("participantYearSelect");
    if (yearSelect) {
        yearSelect.value = selectedParticipantYear;
    }
    if (animateEntrance && previousMode !== mode) {
        const root = document.querySelector(".bpa-shell-page.dashboard-page");
        if (root) animateUppModeHeaderAndControls(root);
    }
    if (pieCenterLabel) {
        pieCenterLabel.textContent = isParticipants
            ? "Penyertaan Program"
            : "Penerima Bantuan";
    }

    const pieChartTitle = document.getElementById("pieChartTitle");
    const pieChartDescription = document.getElementById("pieChartDescription");
    const barChartTitle = document.getElementById("barChartTitle");
    const barChartDescription = document.getElementById("barChartDescription");
    if (pieChartTitle) {
        pieChartTitle.textContent = isParticipants
            ? "Taburan Program Peserta"
            : "Taburan Status Penerima Bantuan";
    }
    if (pieChartDescription) {
        pieChartDescription.textContent = isParticipants
            ? "Peratus dan jumlah penyertaan bagi setiap program."
            : "Peratus dan jumlah penerima bagi setiap status.";
    }
    if (barChartTitle) {
        barChartTitle.textContent = isParticipants
            ? "Bilangan Peserta Mengikut Program"
            : "Bilangan Penerima Mengikut Status";
    }
    if (barChartDescription) {
        barChartDescription.textContent = isParticipants
            ? "Program dengan nama yang sama digabungkan. Pilih program untuk melihat pecahan mengikut tahun."
            : "Jumlah penerima bantuan dalam setiap kategori status.";
    }

    if (!dashboardRowsLoaded) {
        return;
    }

    currentHeaders = isParticipants
        ? ["NAMA", "KAD PENGENALAN", "KATEGORI", "JUMLAH PROGRAM", "PROGRAM"]
        : ["NAMA", "KAD PENGENALAN", "TELEFON", "EMAIL", "STATUS", "CATATAN", "PIC"];
    currentRows = isParticipants ? participantRows : recipientRows;
    currentDataset = {
        id: `combined-${mode}`,
        name: isParticipants ? "Peserta Program" : "Penerima Bantuan"
    };
    selectedPIC = "";
    currentPage = 1;
    sortColumn = -1;
    sortDirection = "asc";
    if (picSelect) {
        picSelect.value = "";
    }
    if (tableSearch) {
        tableSearch.value = "";
    }

    populatePICFilter();
    filteredRows = [...currentRows];
    renderTable();
    renderAnalysis();
    updateCharts(animateEntrance);
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

    return `/set-data?${detailParams.toString()}`;
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
                : normalizedColumn === "program"
                    ? "program"
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
    const destination = dashboardMode === "participants"
        ? "/peserta-program"
        : "/penerima-bantuan";
    const url = `${destination}${query ? `?${query}` : ""}`;

    window.dispatchEvent(
        new CustomEvent("app:navigate", {
            detail: {
                url
            }
        })
    );
}

function handleChartEntrySelection(entry, columnIndex) {
    const value = entry?.[0];
    if (value === undefined) {
        return;
    }

    if (dashboardMode === "participants") {
        if (!participantProgramDrilldown) {
            participantProgramDrilldown = {
                key: entry[2],
                label: value
            };
            window.requestAnimationFrame(() => updateCharts(true));
        } else {
            openChartFilter(columnIndex, entry[3]);
        }
    } else {
        openChartFilter(columnIndex, value);
    }
}

function populatePICFilter() {
    if (!picSelect) {
        return;
    }

    picSelect.innerHTML = "";

    const allOption =
        document.createElement("option");

    allOption.value = "";
    allOption.textContent = "Semua";

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
        updateRecipientCardPic();
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
    updateRecipientCardPic();
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
    updateRecipientCardPic();
    filteredRows =
        getSearchFilteredRows();

    currentPage = 1;

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

async function loadCombinedRecipientData(animateCharts = false) {
    try {
        const recipientRequest = fetch("/api/penerima-bantuan", { cache: "no-store" });
        const participantRequest = fetch("/api/peserta-program", { cache: "no-store" });
        updateParticipantFilterStatCards(false);
        const currentUserResponse = await fetch("/api/auth/me", { cache: "no-store" });

        if (!currentUserResponse.ok) {
            throw new Error("Gagal memuatkan maklumat pengguna dashboard.");
        }

        const currentUserPayload = await currentUserResponse.json();
        currentUserUnit = String(currentUserPayload.unit ?? "").trim().toUpperCase();
        if (!participantUnitDefaultInitialized && currentUserUnit) {
            selectedParticipantUnit = currentUserUnit;
        }
        updateParticipantFilterStatCards(false);

        const [recipientResponse, participantResponse] = await Promise.all([
            recipientRequest,
            participantRequest
        ]);
        if (!recipientResponse.ok || !participantResponse.ok) {
            throw new Error("Gagal memuatkan data dashboard.");
        }

        const recipientPayload = await recipientResponse.json();
        const participantPayload = await participantResponse.json();
        const recipients = recipientPayload.recipients || [];
        const participants = participantPayload.participants || [];
        const contactedRecipientTotal = recipients.filter(recipient =>
            String(recipient.status ?? "").trim()
        ).length;
        const uncontactedRecipientTotal = recipients.length - contactedRecipientTotal;

        recipientRows = recipients.map(recipient => [
            recipient.nama || "",
            recipient.kadPengenalan || "",
            recipient.telefon || "",
            recipient.email || "",
            recipient.status || "",
            recipient.catatan || "",
            recipient.pic || ""
        ]);
        participantRows = participants.map(participant => [
            participant.nama || "",
            participant.kadPengenalan || "",
            participant.ketegori || participant.kategori || "",
            Number(participant.jumlahProgram) || 0,
            Array.isArray(participant.programs)
                ? participant.programs.join(", ")
                : String(participant.programs || ""),
            participant.unit || ""
        ]);
        participantRowsVersion += 1;
        populateParticipantUnitOptions();
        populateParticipantYearOptions();
        dashboardRowsLoaded = true;
        sortColumn = -1;
        sortDirection = "asc";

        if (totalRecipients) {
            const value = recipients.length.toLocaleString();
            if (animateCharts) {
                animateDashboardStatNumber(totalRecipients, value);
            } else {
                totalRecipients.textContent = value;
            }
        }
        if (contactedRecipients) {
            const value = contactedRecipientTotal.toLocaleString();
            if (animateCharts) {
                animateDashboardStatNumber(contactedRecipients, value);
            } else {
                contactedRecipients.textContent = value;
            }
        }
        if (uncontactedRecipients) {
            const value = uncontactedRecipientTotal.toLocaleString();
            if (animateCharts) {
                animateDashboardStatNumber(uncontactedRecipients, value);
            } else {
                uncontactedRecipients.textContent = value;
            }
        }
        updateParticipantFilterStatCards(animateCharts);
        updateDashboardClock();

        document.querySelector(".dashboard-page")?.classList.remove(
            "dashboard-data-pending"
        );
        setDashboardMode(dashboardMode, animateCharts, animateCharts);
    } catch (error) {
        [
            totalRecipients,
            totalParticipants,
            contactedRecipients,
            uncontactedRecipients,
            multiProgramParticipants
        ].forEach(stopDashboardStatNumberJumble);
        console.error("Dashboard loading error:", error);
        document.querySelectorAll(".dashboard-data-pending .dashboard-loading-state").forEach(
            state => {
                state.textContent = "Gagal memuatkan data. Sila muat semula halaman untuk mencuba lagi.";
                state.classList.add("dashboard-loading-error");
            }
        );
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
        '<option value="">Semua</option>';

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

    const rows = dashboardMode === "participants"
        ? getParticipantUnitFilteredRows()
        : getPICFilteredRows();

    rows.forEach(row => {
        const rawValue =
            String(
                row[columnIndex] ?? ""
            ).trim();

        if (!rawValue) {
            return;
        }

        const categories = dashboardMode === "participants"
            ? rawValue
                .split(",")
                .map(value => value.trim())
                .filter(program => !selectedParticipantYear || getProgramYear(program) === selectedParticipantYear)
            : rawValue
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

function getParticipantUnitFilteredRows() {
    if (!selectedParticipantUnit || dashboardMode !== "participants") {
        return getPICFilteredRows();
    }
    return getPICFilteredRows().filter(row => {
        const unit = String(row[5] ?? "").trim();
        return selectedParticipantUnit === "__NO_UNIT__"
            ? !unit
            : unit.split(",").map(value => value.trim()).includes(selectedParticipantUnit);
    });
}

function getProgramYear(program) {
    const yearMatch = String(program).replace(/\s+/g, " ").trim().match(
        /^(.*?)(?:\s+|[-–—]\s*|\(\s*)((?:19|20)\d{2})\s*\)?$/
    );
    return yearMatch?.[2] || "";
}

function populateParticipantYearOptions() {
    const select = document.getElementById("participantYearSelect");
    if (!select) return;

    const selectedValue = selectedParticipantYear;
    const years = new Set();
    participantRows.forEach(row => {
        const rowUnits = String(row[5] ?? "")
            .split(",")
            .map(unit => unit.trim())
            .filter(Boolean);
        const matchesUnit = !selectedParticipantUnit
            || (selectedParticipantUnit === "__NO_UNIT__"
                ? rowUnits.length === 0
                : rowUnits.includes(selectedParticipantUnit));
        if (!matchesUnit) return;

        String(row[4] ?? "")
            .split(",")
            .map(program => getProgramYear(program))
            .filter(Boolean)
            .forEach(year => years.add(year));
    });

    select.replaceChildren();
    const options = [["", "Semua"]];
    [...years]
        .sort((a, b) => Number(b) - Number(a))
        .forEach(year => options.push([year, year]));
    options.forEach(([value, label]) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        select.appendChild(option);
    });
    const availableYears = [...years].sort((a, b) => Number(b) - Number(a));
    const selectedYearIsAvailable = availableYears.includes(selectedValue);
    if (selectedYearIsAvailable) {
        select.value = selectedValue;
    } else if (!participantYearDefaultInitialized || selectedValue) {
        const currentYear = new Date().getFullYear();
        const defaultYear = availableYears.find(year => Number(year) <= currentYear)
            || availableYears[0]
            || "";
        select.value = defaultYear;
    } else {
        select.value = "";
    }
    selectedParticipantYear = select.value;
    participantYearDefaultInitialized = true;
}

function populateParticipantUnitOptions() {
    const select = document.getElementById("participantUnitSelect");
    if (!select) return;

    const selectedValue = selectedParticipantUnit || (
        !participantUnitDefaultInitialized
            ? currentUserUnit
            : ""
    );
    const units = new Set();
    participantRows.forEach(row => {
        String(row[5] ?? "")
            .split(",")
            .map(unit => unit.trim())
            .filter(Boolean)
            .forEach(unit => units.add(unit));
    });

    select.replaceChildren();
    const options = [["", "Semua"]];
    [...units]
        .sort((a, b) => a.localeCompare(b))
        .forEach(unit => options.push([unit, unit]));
    const hasUnassignedParticipants = participantRows.some(row =>
        !String(row[5] ?? "").split(",").some(unit => unit.trim())
    );
    if (hasUnassignedParticipants) {
        options.push(["__NO_UNIT__", "Tiada"]);
    }
    options.forEach(([value, label]) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        select.appendChild(option);
    });
    select.value = [...select.options].some(option => option.value === selectedValue)
        ? selectedValue
        : "";
    selectedParticipantUnit = select.value;
    participantUnitDefaultInitialized = true;
}

function getParticipantProgramGroupName(program) {
    const displayName = String(program).replace(/\s+/g, " ").trim();
    const yearMatch = displayName.match(
        /^(.*?)(?:\s+|[-–—]\s*|\(\s*)((?:19|20)\d{2})\s*\)?$/
    );
    return (yearMatch ? yearMatch[1] : displayName)
        .replace(/\s+siri\s+\d+\s*$/i, "")
        .replace(/\s+\d+\.0\s*$/i, "")
        .replace(/[\s(–—-]+$/, "")
        .trim();
}

function getProgramNameSimilarity(left, right) {
    const first = left.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    const second = right.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    const longestLength = Math.max(first.length, second.length);
    if (!longestLength) return 1;
    if (Math.min(first.length, second.length) / longestLength < 0.7) return 0;

    let previousRow = Array.from({ length: second.length + 1 }, (_, index) => index);
    for (let firstIndex = 1; firstIndex <= first.length; firstIndex += 1) {
        const currentRow = [firstIndex];
        for (let secondIndex = 1; secondIndex <= second.length; secondIndex += 1) {
            const substitutionCost = first[firstIndex - 1] === second[secondIndex - 1] ? 0 : 1;
            currentRow[secondIndex] = Math.min(
                currentRow[secondIndex - 1] + 1,
                previousRow[secondIndex] + 1,
                previousRow[secondIndex - 1] + substitutionCost
            );
        }
        previousRow = currentRow;
    }

    return 1 - previousRow[second.length] / longestLength;
}

function getParticipantProgramChartEntries(columnIndex) {
    const cacheKey = [
        participantRowsVersion,
        columnIndex,
        selectedParticipantUnit,
        selectedParticipantYear,
        participantProgramDrilldown?.key || ""
    ].join(":");
    if (cacheKey === participantChartEntriesCacheKey) {
        return participantChartEntriesCache;
    }

    const programs = new Map();
    getParticipantUnitFilteredRows().forEach(row => {
        const categories = new Set(
            String(row[columnIndex] ?? "")
                .split(",")
                .map(value => value.trim())
                .filter(program => program && (
                    !selectedParticipantYear ||
                    getProgramYear(program) === selectedParticipantYear
                ))
        );
        const participant = String(row[1] ?? "");
        categories.forEach(program => {
            const displayProgram = program.replace(/\s+/g, " ").trim();
            const variantKey = displayProgram.toLocaleLowerCase();
            let variant = programs.get(variantKey);
            if (!variant) {
                const groupName = getParticipantProgramGroupName(displayProgram) || displayProgram;
                variant = {
                    label: displayProgram,
                    filterValue: program,
                    normalizedName: groupName.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim(),
                    participants: new Set()
                };
                programs.set(variantKey, variant);
            }
            variant.participants.add(participant);
        });
    });

    const groups = new Map();
    programs.forEach(variant => {
        let groupKey;
        let group;
        let bestSimilarity = 0.7;
        groups.forEach((candidate, key) => {
            const similarity = getProgramNameSimilarity(variant.normalizedName, candidate.normalizedName);
            if (similarity >= bestSimilarity) {
                bestSimilarity = similarity;
                groupKey = key;
                group = candidate;
            }
        });

        if (!group) {
            groupKey = variant.normalizedName || `program-${groups.size}`;
            group = {
                label: getParticipantProgramGroupName(variant.label) || variant.label,
                normalizedName: variant.normalizedName,
                participants: new Set(),
                variants: new Map()
            };
            groups.set(groupKey, group);
        }

        variant.participants.forEach(participant => group.participants.add(participant));
        group.variants.set(variant.label.toLocaleLowerCase(), variant);
    });

    let entries;
    if (participantProgramDrilldown) {
        const group = groups.get(participantProgramDrilldown.key);
        entries = !group ? [] : [...group.variants.values()]
            .map(variant => [
                variant.label,
                variant.participants.size,
                group.label,
                variant.filterValue
            ])
            .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
    } else {
        entries = [...groups.entries()]
            .map(([key, group]) => [
                group.variants.size === 1
                    ? group.variants.values().next().value.label
                    : group.label,
                group.participants.size,
                key
            ])
            .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
    }
    participantChartEntriesCacheKey = cacheKey;
    participantChartEntriesCache = entries;
    return entries;
}

function chartColors(labels) {
    let modeColorCache = chartColorCache.get(dashboardMode);
    if (!modeColorCache) {
        modeColorCache = new Map();
        chartColorCache.set(dashboardMode, modeColorCache);
    }

    return labels.map(label => {
        const key = String(label);
        if (!modeColorCache.has(key)) {
            modeColorCache.set(key, chartPalette[modeColorCache.size % chartPalette.length]);
        }
        return modeColorCache.get(key);
    });
}

function shouldHideBarXAxisLabels(labels, canvas) {
    if (labels.length < 2) {
        return false;
    }

    const context = canvas.getContext("2d");
    const font = Chart.defaults.font;
    context.save();
    context.font = `${font.size}px ${font.family}`;
    const maxLabelWidth = Math.max(
        ...labels.map(label => context.measureText(String(label)).width)
    );
    context.restore();

    const availableTickWidth = Math.max(
        0,
        (canvas.clientWidth - 60) / labels.length
    );

    return maxLabelWidth > availableTickWidth;
}

function createLegendItem(
    container,
    label,
    count,
    color
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
    dot.style.backgroundColor =
        color;

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
    showPercentages,
    onDashboardLegendSelect
) {
    container.innerHTML =
        "";

    const total =
        entries.reduce(
            (sum, [, count]) =>
                sum + count,
            0
        );

    const colors = chartColors(
        entries.map(([label]) => label)
    );

    entries.forEach(
        ([label, count], index) => {
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
                    : count,
                colors[index]
            );
        }
    );

    if (container === pieLegend && dashboardLegendList) {
        const signature = JSON.stringify({ mode: dashboardMode, entries, showPercentages });
        const shouldUpdate = dashboardLegendSignature !== signature
            || dashboardLegendList.children.length !== pieLegend.children.length;
        if (shouldUpdate) {
            dashboardLegendList.replaceChildren(
                ...[...pieLegend.children].map((item, index) => {
                    const listItem = document.createElement("div");
                    listItem.setAttribute("role", "listitem");

                    const button = document.createElement("button");
                    button.type = "button";
                    button.className = "legend-item dashboard-legend-item";
                    button.append(
                        ...[...item.childNodes].map(child => child.cloneNode(true))
                    );
                    if (onDashboardLegendSelect) {
                        button.addEventListener("click", () => {
                            onDashboardLegendSelect(entries[index]);
                        });
                    }

                    listItem.appendChild(button);
                    return listItem;
                })
            );
            dashboardLegendSignature = signature;
            animateDashboardLegendContent();
        }
    }
}

function animateDashboardLegendContent() {
    const items = dashboardLegendList ? [...dashboardLegendList.children] : [];

    items.forEach((item, index) => {
        item.classList.remove("dashboard-legend-content-enter");
        item.style.setProperty(
            "--dashboard-legend-enter-delay",
            `${Math.min(index, 8) * 35}ms`
        );
        void item.offsetWidth;
        item.classList.add("dashboard-legend-content-enter");
        item.addEventListener("animationend", () => {
            item.classList.remove("dashboard-legend-content-enter");
            item.style.removeProperty("--dashboard-legend-enter-delay");
        }, { once: true });
    });
}

function destroyCharts() {
    pieChartExitVersion += 1;
    pieChartExitInProgress = false;

    [lineChart, barChart, pieChart].forEach(chart => {
        if (chart) {
            chart.destroy();
        }
    });

    lineChart = null;
    barChart = null;
    barChartViewKey = null;
    pieChart = null;

    lineLegend.innerHTML =
        "";

    barLegend.innerHTML =
        "";

    pieLegend.innerHTML =
        "";
    if (dashboardLegendList) {
        dashboardLegendList.innerHTML = "";
    }

    updatePieTotal(0);
}

function updateCharts(animateEntrance = false) {
    if (animateEntrance) {
        animateUppChartAreas();
    }
    updateBarChart(animateEntrance);
    updatePieChart(animateEntrance);
}

function animatePieChartOut(chart) {
    if (pieChartExitInProgress) {
        return;
    }

    const chartCard = chart.canvas?.closest(".chart-card");
    if (chartCard?.classList.contains("bpa-upp-dashboard-enter")) {
        chart.destroy();
        if (pieChart === chart) {
            pieChart = null;
        }
        updatePieChart(true);
        return;
    }

    if (shouldReduceDashboardMotion()) {
        chart.destroy();
        if (pieChart === chart) {
            pieChart = null;
        }
        updatePieChart(true);
        return;
    }

    pieChartExitInProgress = true;
    const transitionVersion = ++pieChartExitVersion;
    const canvas = chart.canvas;
    chart.options.animation = {
        ...chart.options.animation,
        duration: 1100,
        animateRotate: true,
        animateScale: false,
        onComplete: () => {
            if (transitionVersion !== pieChartExitVersion) {
                return;
            }

            if (Chart.getChart(canvas) === chart) {
                chart.destroy();
            }
            if (pieChart === chart) {
                pieChart = null;
            }
            pieChartExitInProgress = false;

            if (canvas.isConnected) {
                updatePieChart(true);
            }
        }
    };
    chart.data.datasets[0].data = chart.data.labels.map(() => 0);
    chart.update();
}

function updateBarChart(animateEntrance = false) {
    barLegend.innerHTML =
        "";

    const section =
        document.getElementById(
            "barChartSection"
        );

    if (!section) {
        return;
    }

    const canvas = document.getElementById("barChart");
    if (!canvas) {
        return;
    }

    const registeredChart = Chart.getChart(canvas);
    if (barChart !== registeredChart) {
        barChart = registeredChart || null;
    }

    const wrapper =
        section.querySelector(
            ".chart-wrapper"
        );

    const legend =
        section.querySelector(
            ".chart-legend"
        );

    const chartCategory = dashboardMode === "participants" ? "program" : "status";
    const barTitle = document.getElementById("barChartTitle");
    const barDescription = document.getElementById("barChartDescription");
    const backButton = document.getElementById("programChartBackButton");
    const isProgramDrilldown = dashboardMode === "participants" && Boolean(participantProgramDrilldown);
    const shouldShowBackButton = isProgramDrilldown;
    const shouldAnimateBackButton = Boolean(backButton && backButton.hidden && shouldShowBackButton);
    if (dashboardMode === "participants") {
        updateDashboardChartHeader(
            barTitle,
            isProgramDrilldown
                ? participantProgramDrilldown.label
                : "Bilangan Peserta Mengikut Program",
            barDescription,
            isProgramDrilldown
                ? "Pilih program mengikut tahun untuk melihat peserta."
                : "Program dengan nama yang sama digabungkan. Pilih program untuk melihat pecahan mengikut tahun."
        );
        if (backButton) backButton.hidden = !shouldShowBackButton;
    } else if (backButton) {
        backButton.hidden = true;
    }
    if (shouldAnimateBackButton) {
        backButton.classList.remove("bpa-upp-back-button-enter");
        void backButton.offsetWidth;
        backButton.classList.add("bpa-upp-back-button-enter");
        backButton.addEventListener("animationend", event => {
            if (event.target === backButton && event.animationName === "bpa-upp-back-button-enter") {
                backButton.classList.remove("bpa-upp-back-button-enter");
            }
        }, { once: true });
    }
    const barIndex = getHeaders().findIndex(
        header => String(header).trim().toLowerCase() === chartCategory
    );

    if (!currentRows.length || barIndex < 0) {
        if (barChart) {
            finishDashboardBarChartEntrance(barChart.canvas);
            barChart.destroy();
            barChart = null;
        }

        wrapper.style.display =
            "none";

        legend.style.display =
            "none";
        barChartViewKey = null;

        return;
    }

    wrapper.style.display =
        "";

    legend.style.display =
        "";

    const columnIndex =
        Number(barIndex);

    const entries = dashboardMode === "participants"
        ? getParticipantProgramChartEntries(columnIndex)
        : getCategoryCounts(columnIndex);

    if (!entries.length) {
        if (barChart) {
            finishDashboardBarChartEntrance(barChart.canvas);
            barChart.destroy();
            barChart = null;
        }
        barChartViewKey = null;
        return;
    }

    const labels = entries.map(([label]) => label);
    const values = entries.map(([, count]) => count);
    const viewKey = `${dashboardMode}:${selectedPIC}:${selectedParticipantUnit}:${selectedParticipantYear}:${participantProgramDrilldown?.key || ""}`;
    const hasSameData = barChart &&
        barChartViewKey === viewKey &&
        barChart.data.labels.length === labels.length &&
        labels.every((label, index) => barChart.data.labels[index] === label) &&
        barChart.data.datasets[0]?.data.length === values.length &&
        values.every((value, index) => barChart.data.datasets[0].data[index] === value);

    if (hasSameData && !animateEntrance) {
        barChart.resize();
        barChart.options.scales.x.ticks.display =
            !shouldHideBarXAxisLabels(labels, canvas);
        barChart.update("none");
        renderCategoryLegend(
            barLegend,
            entries,
            false
        );
        barChartViewKey = viewKey;
        return;
    }

    if (barChart) {
        finishDashboardBarChartEntrance(barChart.canvas);
        barChart.destroy();
        barChart = null;
    }

    const shouldAnimate = !shouldReduceDashboardMotion();
    if (shouldAnimate) {
        canvas.classList.add("dashboard-chart-animating");
        barChartEntranceTimeout = window.setTimeout(
            () => finishDashboardBarChartEntrance(canvas),
            1400
        );
    } else {
        finishDashboardBarChartEntrance(canvas);
    }
    barChart = new Chart(
        canvas,
        {
            type: "bar",
            data: {
                labels,
                datasets: [{
                    label: "Kuantiti",
                    data: values,
                    backgroundColor: chartColors(labels),
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                onClick: (event, elements) => {
                    handleChartEntrySelection(
                        entries[elements[0]?.index],
                        columnIndex
                    );
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: "rgba(0,0,0,0)",
                        titleColor: "rgba(255,255,255,0)",
                        bodyColor: "rgba(255,255,255,0)",
                        borderColor: "rgba(0,0,0,0)",
                        borderWidth: 0,
                        caretSize: 0,
                        callbacks: {
                            label: context =>
                                `Bilangan: ${context.parsed.y.toLocaleString()}`
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: {
                            display: !shouldHideBarXAxisLabels(labels, canvas)
                        }
                    },
                    y: { beginAtZero: true, ticks: { precision: 0 } }
                },
                animation: {
                    duration: shouldAnimate ? 1300 : 0,
                    easing: "easeOutCubic"
                },
                transitions: {
                    attach: { animation: { duration: 0 } },
                    resize: { animation: { duration: 0 } }
                },
                animations: {
                    y: {
                        from: context => context.chart.scales.y.getPixelForValue(0)
                    }
                }
            },
            plugins: [barHoverLiftPlugin, dashboardChartTooltipPlugin]
        }
    );

    if (shouldAnimate) {
        barChart.reset();
        barChart.update();
    }

    barChartViewKey = viewKey;
    renderCategoryLegend(
        barLegend,
        entries,
        false
    );
}

function updateDashboardChartHeader(title, titleText, description, descriptionText) {
    let changed = false;
    [
        [title, titleText],
        [description, descriptionText]
    ].forEach(([element, text]) => {
        if (!element || element.textContent === text) return;
        element.textContent = text;
        changed = true;
    });

    if (!changed) return;

    [title, description].filter(Boolean).forEach(element => {
        element.classList.remove("bpa-upp-chart-header-text-enter");
        void element.offsetWidth;
        element.classList.add("bpa-upp-chart-header-text-enter");
        element.addEventListener("animationend", event => {
            if (
                event.target === element
                && event.animationName === "bpa-upp-chart-header-text-enter"
            ) {
                element.classList.remove("bpa-upp-chart-header-text-enter");
            }
        }, { once: true });
    });
}

function updatePieChart(animateEntrance = false) {
    pieLegend.innerHTML =
        "";

    const section =
        document.getElementById(
            "pieChartSection"
        );

    if (!section) {
        return;
    }

    const canvas = document.getElementById("pieChart");
    if (!canvas) {
        return;
    }

    const registeredChart = Chart.getChart(canvas);
    if (pieChart !== registeredChart) {
        if (pieChartExitInProgress) {
            pieChartExitVersion += 1;
            pieChartExitInProgress = false;
        }
        pieChart = registeredChart || null;
    }
    if (pieChartExitInProgress) {
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

    const chartCategory = dashboardMode === "participants" ? "program" : "status";
    const pieTitle = document.getElementById("pieChartTitle");
    const pieDescription = document.getElementById("pieChartDescription");
    updateDashboardChartHeader(
        pieTitle,
        dashboardMode === "participants" && participantProgramDrilldown
            ? participantProgramDrilldown.label
            : dashboardMode === "participants"
                ? "Taburan Program Peserta"
                : "Taburan Status Penerima Bantuan",
        pieDescription,
        dashboardMode === "participants" && participantProgramDrilldown
            ? "Pecahan penyertaan mengikut tahun bagi program dipilih."
            : dashboardMode === "participants"
                ? "Peratus dan jumlah peserta bagi setiap program."
                : "Peratus dan jumlah penerima bagi setiap status."
    );
    const pieIndex = getHeaders().findIndex(
        header => String(header).trim().toLowerCase() === chartCategory
    );

    if (!currentRows.length || pieIndex < 0) {
        updatePieTotal(0);
        if (pieChart) {
            animatePieChartOut(pieChart);
            return;
        }

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

    const entries = dashboardMode === "participants"
        ? getParticipantProgramChartEntries(columnIndex)
        : getCategoryCounts(columnIndex);

    if (!entries.length) {
        if (pieChart) {
            updatePieTotal(0);
            animatePieChartOut(pieChart);
            return;
        }
        updatePieTotal(0);
        wrapper.style.display = "none";
        legend.style.display = "none";
        return;
    }

    const total =
        entries.reduce(
            (sum, [, count]) =>
                sum + count,
            0
        );
    updatePieTotal(total);
    renderCategoryLegend(
        pieLegend,
        entries,
        true,
        entry => handleChartEntrySelection(entry, columnIndex)
    );

    const labels = entries.map(([label]) => label);
    const values = entries.map(([, count]) => count);
    const hasSameData = pieChart &&
        pieChart.data.labels.length === labels.length &&
        labels.every((label, index) => pieChart.data.labels[index] === label) &&
        pieChart.data.datasets[0]?.data.length === values.length &&
        values.every((value, index) => pieChart.data.datasets[0].data[index] === value);

    if (hasSameData && !animateEntrance) {
        pieChart.resize();
        pieChart.update("none");
        return;
    }

    if (pieChart) {
        animatePieChartOut(pieChart);
        return;
    }

    const shouldAnimate = !shouldReduceDashboardMotion();
    pieChart = new Chart(
        canvas,
        {
            type: "doughnut",
            data: {
                labels,
                datasets: [{
                    data: values,
                    backgroundColor: chartColors(labels),
                    borderWidth: 3,
                    clip: false,
                    hoverOffset: 12
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: {
                    padding: 14
                },
                cutout: "64%",
                animation: {
                    duration: shouldAnimate ? 1100 : 0,
                    animateRotate: true,
                    animateScale: false
                },
                transitions: {
                    resize: { animation: { duration: 0 } }
                },
                onClick: (event, elements) => {
                    handleChartEntrySelection(
                        entries[elements[0]?.index],
                        columnIndex
                    );
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: "rgba(0,0,0,0)",
                        titleColor: "rgba(255,255,255,0)",
                        bodyColor: "rgba(255,255,255,0)",
                        borderColor: "rgba(0,0,0,0)",
                        borderWidth: 0,
                        caretSize: 0,
                        callbacks: {
                            label: context => {
                                const percentage = total
                                    ? (context.parsed / total * 100).toFixed(1)
                                    : "0.0";
                                return `Peratusan: ${percentage}% (${context.parsed.toLocaleString()})`;
                            }
                        }
                    }
                }
            },
            plugins: [dashboardChartTooltipPlugin]
        }
    );

    if (shouldAnimate) {
        pieChart.reset();
        pieChart.update();
    }
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

const isBpaDashboardShell = /\/bpa\/dashboard\/?$/.test(window.location.pathname);
window.appInitialPageReady = isBpaDashboardShell
    ? Promise.resolve()
    : initializeDashboard(true);
})();