let datasets = [];
let filteredDatasets = [];
let deleteDatasetId = null;

let grid;
let emptyDatasets;
let noSearchResults;
let searchInput;

let deleteOverlay;
let deleteConfirmation;
let deleteConfirmationTitle;
let deleteConfirmationMessage;
let cancelDeleteButton;
let confirmDeleteButton;
let datasetTypeFilterMenu;
let selectedDatasetType = "";
let initializedDatasetGrid = null;
let datasetDeleteMode = false;

function getDatasetType(dataset) {
    const storedType = String(
        dataset.dataset_type ||
        dataset.datasetType ||
        ""
    ).toLowerCase();

    if (storedType === "peserta" || storedType === "penerima") {
        return storedType;
    }

    const searchableText = `${dataset.name || ""} ${dataset.filename || ""}`
        .toLowerCase();

    return searchableText.includes("peserta")
        ? "peserta"
        : "penerima";
}

function initializeDatasetListController() {
    if (new URLSearchParams(window.location.search).has("id")) {
        return;
    }

    grid = document.getElementById("datasetGrid");
    emptyDatasets = document.getElementById("emptyDatasets");
    noSearchResults = document.getElementById("noSearchResults");
    searchInput = document.getElementById("datasetSearch");
    deleteOverlay = document.getElementById("datasetListDeleteOverlay");
    deleteConfirmation = document.getElementById("datasetListDeleteConfirmation");
    deleteConfirmationTitle = document.getElementById("datasetListDeleteConfirmationTitle");
    deleteConfirmationMessage = document.getElementById("datasetListDeleteConfirmationMessage");
    cancelDeleteButton = document.getElementById("datasetListCancelDeleteButton");
    confirmDeleteButton = document.getElementById("datasetListConfirmDeleteButton");
    datasetTypeFilterMenu = document.getElementById("datasetTypeFilterMenu");

    if (!grid || initializedDatasetGrid === grid) {
        return;
    }

    initializedDatasetGrid = grid;
    setupDatasetEvents();
    return loadDatasetList();
}

document.addEventListener("DOMContentLoaded", () => {
    window.registerAppPageLoadTask(initializeDatasetListController());
});
document.addEventListener("app:page-loaded", () => {
    window.registerAppPageLoadTask(initializeDatasetListController());
});

function setupDatasetEvents() {
    searchInput?.addEventListener("input", () => {
        filterDatasets(searchInput.value);
    });

    cancelDeleteButton?.addEventListener("click", closeDeleteConfirmation);
    deleteOverlay?.addEventListener("click", closeDeleteConfirmation);
    confirmDeleteButton?.addEventListener("click", confirmDelete);

    document.getElementById("toggleDatasetFilterButton")?.addEventListener(
        "click",
        event => {
            event.stopPropagation();
            datasetTypeFilterMenu?.classList.toggle("show");
        }
    );
    datasetTypeFilterMenu?.querySelectorAll("[data-dataset-type]").forEach(
        option => {
            option.addEventListener("click", () => {
                selectedDatasetType =
                    option.dataset.datasetType || "";

                datasetTypeFilterMenu
                    .querySelectorAll("[data-dataset-type]")
                    .forEach(item => {
                        item.classList.toggle(
                            "active",
                            (item.dataset.datasetType || "") === selectedDatasetType
                        );
                    });

                datasetTypeFilterMenu.classList.remove("show");
                filterDatasets(searchInput?.value || "");
            });
        }
    );
    document.addEventListener("click", event => {
        if (
            datasetTypeFilterMenu &&
            !datasetTypeFilterMenu.contains(event.target) &&
            event.target !== document.getElementById("toggleDatasetFilterButton")
        ) {
            datasetTypeFilterMenu.classList.remove("show");
        }
    });
    document.getElementById("toggleDatasetDeleteButton")?.addEventListener(
        "click",
        event => {
            datasetDeleteMode = !datasetDeleteMode;
            event.currentTarget.classList.toggle("active", datasetDeleteMode);
            document.getElementById("datasetGrid")?.classList.toggle(
                "delete-mode",
                datasetDeleteMode
            );
        }
    );

    document.addEventListener("keydown", event => {
        if (event.key !== "Escape") return;

        if (deleteConfirmation?.classList.contains("show")) {
            closeDeleteConfirmation();
            return;
        }

        if (document.getElementById("uploadFloatingCard")?.classList.contains("show")) {
            window.closeUpload?.();
        }
    });
}

async function loadDatasetList() {
    try {
        const response = await fetch("/api/datasets");

        if (!response.ok) {
            throw new Error("Gagal mendapatkan set data.");
        }

        const data = await response.json();

        datasets = Array.isArray(data)
            ? data
            : Array.isArray(data.datasets)
                ? data.datasets
                : [];

        filterDatasets(searchInput?.value || "");
    } catch (error) {
        console.error("LOAD DATASETS ERROR:", error);

        datasets = [];
        filteredDatasets = [];

        renderDatasets();
    }
}

function filterDatasets(query = "") {
    const value = String(query).trim().toLowerCase();

    filteredDatasets = datasets.filter(dataset => {
        const name = String(dataset.name || "").toLowerCase();
        const filename = String(dataset.filename || "").toLowerCase();
        const datasetType = getDatasetType(dataset);

        const matchesQuery =
            !value ||
            name.includes(value) ||
            filename.includes(value);
        const matchesType =
            !selectedDatasetType ||
            datasetType === selectedDatasetType;

        return matchesQuery && matchesType;
    });

    renderDatasets();
}

function renderDatasets() {
    grid.innerHTML = "";

    if (!datasets.length) {
        grid.style.display = "none";
        emptyDatasets.style.display = "block";
        noSearchResults.style.display = "none";
        return;
    }

    emptyDatasets.style.display = "none";

    if (!filteredDatasets.length) {
        grid.style.display = "none";
        noSearchResults.style.display = "block";
        return;
    }

    noSearchResults.style.display = "none";
    grid.style.display = "grid";

    filteredDatasets.forEach(dataset => {
        const column = document.createElement("div");

        column.className = "col-12 col-md-6 col-xl-4";
        column.innerHTML = createDatasetCard(dataset);

        const card = column.querySelector(".dataset-card");
        const deleteButton = column.querySelector(".dataset-delete-button");

        card?.addEventListener("click", () => {
            const id = dataset.id;

            if (id === undefined || id === null || id === "") {
                return;
            }

            window.dispatchEvent(
                new CustomEvent("app:navigate", {
                    detail: {
                        url: `/set-data?id=${encodeURIComponent(id)}`
                    }
                })
            );
        });

        deleteButton?.addEventListener("click", event => {
            event.preventDefault();
            event.stopPropagation();
            openDeleteConfirmation(dataset);
        });

        grid.appendChild(column);
    });
}

function createDatasetCard(dataset) {
    const id = dataset.id ?? "";

    const name = escapeHtml(
        dataset.name ||
        dataset.filename ||
        "Tanpa Nama"
    );

    const filename = escapeHtml(
        dataset.filename || "-"
    );

    const rowCount = Number(
        dataset.row_count ??
        dataset.rowCount ??
        0
    );

    const fileSize = formatFileSize(
        dataset.file_size ??
        dataset.fileSize ??
        0
    );

    const date = formatDate(
        dataset.created_at ||
        dataset.createdAt ||
        dataset.updated_at ||
        dataset.updatedAt
    );

    return `
        <div class="dataset-card" data-id="${escapeHtml(String(id))}">

            <button
                type="button"
                class="dataset-delete-button"
                title="Padam set data"
                aria-label="Padam set data"
            >
                <i class="bi bi-x-lg" aria-hidden="true"></i>
            </button>

            <div class="dataset-icon">
                <i class="bi bi-file-earmark-spreadsheet" aria-hidden="true"></i>
            </div>

            <div class="dataset-name">
                ${name}
            </div>

            <div class="dataset-filename">
                ${filename}
            </div>

            <div class="dataset-info">

                <div class="dataset-stat">
                    <span class="dataset-stat-value">
                        ${rowCount.toLocaleString()}
                    </span>

                    <span class="dataset-stat-label">
                        Baris
                    </span>
                </div>

                <div class="dataset-stat">
                    <span class="dataset-stat-value">
                        ${fileSize}
                    </span>

                    <span class="dataset-stat-label">
                        Saiz
                    </span>
                </div>

            </div>

            <div class="dataset-date">
                ${date}
            </div>

        </div>
    `;
}

function openDeleteConfirmation(dataset) {
    deleteDatasetId = dataset.id;

    const name = dataset.name || dataset.filename || "set data ini";

    deleteConfirmationTitle.textContent = "Padam set data?";

    deleteConfirmationMessage.textContent =
        `Adakah anda pasti mahu memadam "${name}"? Tindakan ini tidak boleh dibuat asal.`;

    deleteOverlay?.classList.add("show");
    deleteConfirmation?.classList.add("show");

    deleteOverlay?.setAttribute("aria-hidden", "false");
    deleteConfirmation?.setAttribute("aria-hidden", "false");
}

function closeDeleteConfirmation() {
    deleteDatasetId = null;

    deleteOverlay?.classList.remove("show");
    deleteConfirmation?.classList.remove("show");

    deleteOverlay?.setAttribute("aria-hidden", "true");
    deleteConfirmation?.setAttribute("aria-hidden", "true");
}

async function confirmDelete() {
    if (
        deleteDatasetId === null ||
        deleteDatasetId === undefined
    ) {
        return;
    }

    const id = deleteDatasetId;

    confirmDeleteButton.disabled = true;
    confirmDeleteButton.textContent = "Memadam...";

    try {
        const currentPath = typeof window.appPathname === "function"
            ? window.appPathname(window.location.pathname)
            : window.location.pathname;
        const deleteEndpoint = currentPath === "/muat-naik"
            ? `/api/upload/datasets/${encodeURIComponent(id)}`
            : `/api/datasets/${encodeURIComponent(id)}`;
        const response = await fetch(
            deleteEndpoint,
            {
                method: "DELETE"
            }
        );

        const contentType =
            response.headers.get("content-type") || "";

        let result = null;

        if (contentType.includes("application/json")) {
            result = await response.json();
        }

        if (!response.ok) {
            throw new Error(
                result?.message ||
                result?.error ||
                "Gagal memadam set data."
            );
        }

        closeDeleteConfirmation();

        await loadDatasetList();

    } catch (error) {
        console.error("DELETE ERROR:", error);

        deleteConfirmationMessage.textContent =
            error.message ||
            "Gagal memadam set data.";

    } finally {
        confirmDeleteButton.disabled = false;
        confirmDeleteButton.textContent = "Padam";
    }
}

function formatFileSize(bytes) {
    const value = Number(bytes) || 0;

    if (value < 1024) {
        return `${value} B`;
    }

    if (value < 1024 * 1024) {
        return `${(value / 1024).toFixed(1)} KB`;
    }

    if (value < 1024 * 1024 * 1024) {
        return `${(value / 1024 / 1024).toFixed(1)} MB`;
    }

    return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function formatDate(value) {
    if (!value) {
        return "-";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return String(value);
    }

    return date.toLocaleString("en-US", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true
    });
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

window.loadDatasetList = loadDatasetList;

(() => {
let dataset = null;
let headers = [];
let rows = [];
let originalRows = [];
let sourceHeaders = [];
let sourceRows = [];
let filteredRows = [];
let visibleColumns = [];
let columnWidths = [];
let currentPage = 1;
const pageSize = 100;

let hasUnsavedChanges = false;
let schemaNeedsSave = false;
let savingChanges = false;
let saveBadgeTimer = null;
let selectedRows = new Set();
let selectedCell = null;
let selectionAnchor = null;
let selectionRange = null;
let editingCell = null;
let cellSuggestionState = null;

let undoStack = [];
let redoStack = [];
let isRestoringHistory = false;

let currentSortColumn = null;
let currentSortDirection = "asc";

let deleteMode = false;
let newRows = new Set();
let mouseSelecting = false;

let chartFilterColumn = "";
let chartFilterValue = "";
let datasetColumnFilters = {};

function getDatasetId() {
    const queryId = new URLSearchParams(
        window.location.search
    ).get("id");

    if (queryId) {
        return queryId;
    }

    const pathname = typeof window.appPathname === "function"
        ? window.appPathname(window.location.pathname)
        : window.location.pathname;
    const parts = pathname.split("/").filter(Boolean);
    return parts[parts.length - 1];
}

function findColumnIndex(column) {
    const value = normalizeDatasetHeader(column);
    const employmentAliases = ["statuspekerjaan", "pekerjaan"];

    return headers.findIndex(header => {
        const candidate = normalizeDatasetHeader(header);
        return candidate === value ||
            (employmentAliases.includes(candidate) && employmentAliases.includes(value));
    });
}

function normalizeRows(data) {
    return data.map(row => {
        const fixed = [...row];

        while (fixed.length < headers.length) {
            fixed.push("");
        }

        return fixed.slice(0, headers.length);
    });
}

function normalizeDatasetHeader(value) {
    return String(value ?? "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
}

function normalizeDatasetHeaders() {
    if (getDatasetType(dataset || {}) === "peserta") {
        const categoryIndex = headers.findIndex(header =>
            ["kategori", "ketegori"].includes(normalizeDatasetHeader(header))
        );
        if (categoryIndex === -1) return false;
        const changed = headers[categoryIndex] !== "KATEGORI";
        headers[categoryIndex] = "KATEGORI";
        return changed;
    }

    let employmentIndex = headers.findIndex(header =>
        ["statuspekerjaan", "pekerjaan"].includes(normalizeDatasetHeader(header))
    );
    const statusIndex = headers.findIndex(header =>
        normalizeDatasetHeader(header) === "status"
    );

    if (employmentIndex === -1) return false;

    let changed = headers[employmentIndex] !== "PEKERJAAN";
    headers[employmentIndex] = "PEKERJAAN";

    const targetEmploymentIndex = statusIndex === -1
        ? employmentIndex
        : employmentIndex > statusIndex
            ? statusIndex
            : statusIndex - 1;

    if (employmentIndex !== targetEmploymentIndex) {
        const [employmentHeader] = headers.splice(employmentIndex, 1);
        headers.splice(targetEmploymentIndex, 0, employmentHeader);
        rows.forEach(row => {
            const [employmentValue] = row.splice(employmentIndex, 1);
            row.splice(targetEmploymentIndex, 0, employmentValue);
        });

        changed = true;
    }

    return changed;
}

function addRecordFieldsForDataset() {
    if (getDatasetType(dataset || {}) === "peserta") {
        return [
            { id: "addNama", label: "Nama", headers: ["nama"] },
            { id: "addKP", label: "KP", headers: ["kp", "kadpengenalan"] },
            { id: "addCategory", label: "Kategori", headers: ["kategori", "ketegori"] },
            { id: "addProgram", label: "Program", headers: ["program"], full: true }
        ];
    }

    return [
        { id: "addNama", label: "Nama", headers: ["nama"] },
        { id: "addKP", label: "KP", headers: ["kp", "kadpengenalan"] },
        { id: "addTelefon", label: "Telefon", headers: ["telefon"] },
        { id: "addEmail", label: "Email", headers: ["email"] },
        { id: "addStatus", label: "Status", headers: ["status"], status: true },
        { id: "addStatusPekerjaan", label: "Pekerjaan", headers: ["statuspekerjaan", "pekerjaan"] },
        { id: "addPIC", label: "PIC", headers: ["pic"] },
        { id: "addCatatan", label: "Catatan", headers: ["catatan"], textarea: true, full: true }
    ];
}

function initializeAddRecordForm() {
    const source = document.getElementById("addSourceDataset");
    const fieldsContainer = document.getElementById("addRecordFields");
    const description = document.getElementById("addRecordDescription");
    if (!source || !fieldsContainer || !dataset) return;

    const sourceId = String(dataset.id || getDatasetId());
    const sourceName = dataset.filename || dataset.name || "Set Data";
    source.replaceChildren(new Option(sourceName, sourceId, true, true));
    source.disabled = true;

    const isParticipant = getDatasetType(dataset) === "peserta";
    if (description) {
        description.textContent = isParticipant
            ? "Masukkan maklumat peserta program baharu."
            : "Masukkan maklumat penerima bantuan baharu.";
    }

    const fields = addRecordFieldsForDataset();
    fieldsContainer.replaceChildren();

    fields.forEach(field => {
        const wrapper = document.createElement("div");
        wrapper.className = `form-field${field.full ? " full" : ""}`;

        const label = document.createElement("label");
        label.htmlFor = field.id;
        label.textContent = field.label;
        wrapper.appendChild(label);

        let input;
        if (field.status) {
            input = document.createElement("select");
            input.appendChild(new Option("", ""));
            const statusIndex = headers.findIndex(
                header => normalizeDatasetHeader(header) === "status"
            );
            const statuses = new Set(
                statusIndex < 0
                    ? []
                    : rows.map(row => String(row[statusIndex] ?? "").trim()).filter(Boolean)
            );
            [...statuses].sort((a, b) => a.localeCompare(b, undefined, {
                sensitivity: "base"
            })).forEach(status => input.appendChild(new Option(status, status)));
            input.appendChild(new Option("Tambah status baharu...", "__add_new_status__"));
        } else if (field.textarea) {
            input = document.createElement("textarea");
        } else {
            input = document.createElement("input");
            input.type = "text";
        }

        input.id = field.id;
        input.autocomplete = "off";
        wrapper.appendChild(input);

        if (field.status) {
            const customStatus = document.createElement("input");
            customStatus.id = "addStatusCustom";
            customStatus.type = "text";
            customStatus.autocomplete = "off";
            customStatus.placeholder = "Masukkan status baharu";
            customStatus.style.display = "none";
            wrapper.appendChild(customStatus);
            input.addEventListener("change", () => {
                customStatus.style.display = input.value === "__add_new_status__" ? "" : "none";
                if (customStatus.style.display !== "none") customStatus.focus();
                else customStatus.value = "";
            });
        }

        fieldsContainer.appendChild(wrapper);
    });

    window.initializeCustomSelects?.();
}

function createDataSnapshot() {
    return JSON.stringify({
        headers: headers.map(value => String(value ?? "")),
        rows: rows.map(row =>
            headers.map((_, index) => String(row[index] ?? ""))
        )
    });
}

function createOriginalSnapshot() {
    return JSON.stringify({
        headers: headers.map(value => String(value ?? "")),
        rows: originalRows.map(row =>
            headers.map((_, index) => String(row[index] ?? ""))
        )
    });
}

function checkForChanges() {
    hasUnsavedChanges =
        schemaNeedsSave ||
        createDataSnapshot() !== createOriginalSnapshot();

    updateSaveButton();
}

function showDatasetSaveConfirmation(message = "Disimpan", type = "success") {
    const topbar = document.querySelector(".topbar");
    if (!topbar) return;

    let badge = document.querySelector(".save-success-badge");
    if (!badge) {
        badge = document.createElement("div");
        badge.className = "save-success-badge";
        document.body.appendChild(badge);
    }

    badge.textContent = message;
    badge.classList.toggle("is-error", type === "error");
    badge.setAttribute("role", type === "error" ? "alert" : "status");
    badge.setAttribute("aria-live", type === "error" ? "assertive" : "polite");
    badge.style.top = `${topbar.getBoundingClientRect().bottom}px`;
    clearTimeout(saveBadgeTimer);
    badge.classList.remove("is-visible");
    requestAnimationFrame(() => badge.classList.add("is-visible"));
    saveBadgeTimer = setTimeout(() => badge.classList.remove("is-visible"), 1800);
}

window.showDatasetSaveConfirmation = showDatasetSaveConfirmation;

function discardDatasetTableChanges() {
    closeDatasetCellSuggestions();
    editingCell = null;

    if (schemaNeedsSave) {
        headers = [...sourceHeaders];
        rows = sourceRows.map(row => [...row]);
        originalRows = rows.map(row => [...row]);
        schemaNeedsSave = false;
        visibleColumns = headers.map(
            header => String(header).trim().toLowerCase() !== "pic"
        );
        columnWidths = headers.map(() => 160);
        const columnCount = document.getElementById("columnCount");
        if (columnCount) {
            columnCount.textContent = headers.length.toLocaleString();
        }
        initializeAddRecordForm();
        createColumnChecklist();
        createFilterOptions();
    } else {
        rows = originalRows.map(row => [...row]);
    }

    newRows.clear();
    selectedRows.clear();
    selectedCell = null;
    selectionAnchor = null;
    selectionRange = null;
    undoStack = [];
    redoStack = [];
    hasUnsavedChanges = false;

    applyFilters();
    renderTable();
    updateSaveButton();
}

function registerDatasetTableNavigationGuard() {
    window.hasUnsavedTableChanges = () => {
        finishEditingCell();
        checkForChanges();
        return hasUnsavedChanges;
    };
    window.isSavingTableChanges = () => savingChanges;
    window.resetTableState = discardDatasetTableChanges;
}

async function loadDataset() {
    const id = getDatasetId();

    if (!id || isNaN(Number(id))) {
        showError("ID dataset tidak sah.");
        return;
    }

    getChartFilter();

    try {
        const response = await fetch(`/api/datasets/${id}`);
        const text = await response.text();

        let result;

        try {
            result = JSON.parse(text);
        } catch {
            throw new Error("Server tidak mengembalikan JSON yang sah.");
        }

        if (!response.ok || !result.success) {
            throw new Error(
                result.error || "Gagal memuatkan dataset."
            );
        }

        dataset = result;
        initializeDataset();
    } catch (error) {
        console.error(error);
        showError(error.message);
    }
}

function initializeDataset() {
    const loading = document.getElementById("loading");
    const content = document.getElementById("datasetContent");

    if (loading) loading.style.display = "none";
    if (content) content.style.display = "block";

    const parsed = parseCSV(dataset.csv || "");

    headers = parsed.length ? [...parsed[0]] : [];
    sourceHeaders = [...headers];
    sourceRows = parsed.length
        ? parsed.slice(1).map(row => [...row])
        : [];
    sourceRows = normalizeRows(sourceRows);
    rows = sourceRows.map(row => [...row]);
    schemaNeedsSave = normalizeDatasetHeaders();
    originalRows = rows.map(row => [...row]);
    filteredRows = [...rows];
    initializeAddRecordForm();

    visibleColumns = headers.map(
        header => String(header).trim().toLowerCase() !== "pic"
    );

    columnWidths = headers.map(() => 160);

    selectedRows.clear();
    selectedCell = null;
    selectionAnchor = null;
    selectionRange = null;
    closeDatasetCellSuggestions();
    editingCell = null;

    undoStack = [];
    redoStack = [];
    newRows.clear();

    currentSortColumn = null;
    currentSortDirection = "asc";
    datasetColumnFilters = {};
    currentPage = 1;
    deleteMode = false;
    hasUnsavedChanges = schemaNeedsSave;

    updateDatasetHeader();

    const columnCount = document.getElementById("columnCount");

    if (columnCount) {
        columnCount.textContent = headers.length.toLocaleString();
    }

    updateDeleteMode();
    updateDeleteButton();
    createColumnChecklist();
    createFilterOptions();
    applyChartFilter();
    applyURLFilters();

    updateSaveButton();
    updateUndoRedoButtons();
    renderTable();
}

function updateDatasetHeader() {
    const name = document.getElementById("datasetName");
    const filename = document.getElementById("datasetFilename");
    const rowCount = document.getElementById("rowCount");
    const fileSize = document.getElementById("fileSize");

    if (name) name.textContent = dataset?.name || "";
    if (filename) {
        const rowCount = Number(dataset?.row_count || rows.length || 0);
        filename.textContent = `Jumlah baris: ${rowCount.toLocaleString()}`;
    }

    if (rowCount) {
        rowCount.textContent =
            Number(dataset?.row_count || rows.length || 0).toLocaleString();
    }

    if (fileSize) {
        fileSize.textContent = formatFileSize(dataset?.file_size);
    }
}

function parseCSV(csv) {
    const result = [];
    let row = [];
    let value = "";
    let insideQuotes = false;

    for (let i = 0; i < csv.length; i++) {
        const char = csv[i];
        const nextChar = csv[i + 1];

        if (char === '"') {
            if (insideQuotes && nextChar === '"') {
                value += '"';
                i++;
            } else {
                insideQuotes = !insideQuotes;
            }

            continue;
        }

        if (char === "," && !insideQuotes) {
            row.push(value);
            value = "";
            continue;
        }

        if ((char === "\n" || char === "\r") && !insideQuotes) {
            if (char === "\r" && nextChar === "\n") {
                i++;
            }

            row.push(value);
            value = "";

            if (row.some(cell => String(cell).trim() !== "")) {
                result.push(row);
            }

            row = [];
            continue;
        }

        value += char;
    }

    if (value.length > 0 || row.length > 0) {
        row.push(value);

        if (row.some(cell => String(cell).trim() !== "")) {
            result.push(row);
        }
    }

    return result;
}

function createColumnChecklist() {
    const checklist = document.getElementById("columnChecklist");

    if (!checklist) return;

    checklist.innerHTML = "";

    headers.forEach((header, index) => {
        const label = document.createElement("label");
        label.className = "column-checkbox";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = visibleColumns[index] !== false;

        checkbox.addEventListener("change", () => {
            visibleColumns[index] = checkbox.checked;
            updateSelectAllColumnsButton();
            renderTable();
        });

        const text = document.createElement("span");
        text.textContent = header || `Lajur ${index + 1}`;

        label.append(checkbox, text);
        checklist.appendChild(label);
    });

    updateSelectAllColumnsButton();
}

function toggleAllColumns() {
    const allSelected =
        visibleColumns.length > 0 &&
        visibleColumns.every(Boolean);

    visibleColumns = headers.map(() => !allSelected);

    updateColumnCheckboxes();
    updateSelectAllColumnsButton();
    renderTable();
}

function updateSelectAllColumnsButton() {
    const button = document.getElementById("selectAllColumnsButton");

    if (!button) return;

    const allSelected =
        visibleColumns.length > 0 &&
        visibleColumns.every(Boolean);

    button.textContent = allSelected
        ? "Nyahpilih Semua"
        : "Pilih Semua";
}

function updateColumnCheckboxes() {
    document
        .querySelectorAll("#columnChecklist input")
        .forEach((checkbox, index) => {
            checkbox.checked = visibleColumns[index] !== false;
        });
}

function createFilterOptions() {
    const fields = document.getElementById("datasetFilterFields");
    if (!fields) return;
    fields.replaceChildren();
    const isParticipantDataset = getDatasetType(dataset || {}) === "peserta";

    headers.forEach((header, columnIndex) => {
        const counts = new Map();
        let hasEmpty = false;
        const isParticipantProgramColumn =
            isParticipantDataset &&
            normalizeDatasetHeader(header) === "program";
        rows.forEach(row => {
            const values = isParticipantProgramColumn
                ? String(row[columnIndex] ?? "").split(",").map(value => value.trim()).filter(Boolean)
                : [String(row[columnIndex] ?? "").trim()].filter(Boolean);
            if (!values.length) {
                hasEmpty = true;
                return;
            }
            values.forEach(value => counts.set(value, (counts.get(value) || 0) + 1));
        });

        const repeatedValues = [...counts]
            .filter(([, count]) => count > 1)
            .map(([value]) => value)
            .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
        if (!hasEmpty && !repeatedValues.length) return;

        const field = document.createElement("div");
        field.className = "filter-field";
        const label = document.createElement("label");
        label.textContent = header || `Lajur ${columnIndex + 1}`;
        const select = document.createElement("select");
        select.dataset.columnIndex = String(columnIndex);
        select.appendChild(new Option("Semua", ""));
        if (hasEmpty) select.appendChild(new Option("Kosong", "__EMPTY__"));
        repeatedValues.forEach(value => select.appendChild(new Option(value, value)));
        select.value = datasetColumnFilters[columnIndex] || "";
        field.append(label, select);
        fields.appendChild(field);
    });

    applyChartFilterToSelects();
}

function applyURLFilters() {
    const params = new URLSearchParams(window.location.search);
    [["PIC", "PIC"], ["Status", "Status"]].forEach(([parameter, header]) => {
        const requested = params.get(parameter);
        if (requested !== null) setDatasetColumnFilter(header, requested);
    });

    currentPage = 1;
    applyFilters();
}

function setDatasetColumnFilter(header, requestedValue) {
    const columnIndex = findColumnIndex(header);
    if (columnIndex === -1) return;

    const requested = requestedValue.trim();
    const requestedOption = requested.toLowerCase() === "__empty__"
        ? "__EMPTY__"
        : requested;
    const select = document.querySelector(
        `#datasetFilterFields select[data-column-index="${columnIndex}"]`
    );
    const option = select && [...select.options].find(item =>
        item.value.toLowerCase() === requestedOption.toLowerCase()
    );
    const filterValue = option ? option.value : requestedOption;
    datasetColumnFilters[columnIndex] = filterValue;
    if (select) select.value = filterValue;
}

function applyFilters() {
    const searchInput = document.getElementById("searchInput");
    const search =
        String(searchInput?.value || "")
            .trim()
            .toLowerCase();
    const selectedFilters = Object.entries(datasetColumnFilters)
        .filter(([, value]) => value)
        .map(([index, value]) => [Number(index), value]);
    const isParticipantDataset = getDatasetType(dataset || {}) === "peserta";

    filteredRows = rows.filter(row => {
        if (search) {
            const matchesSearch = row.some(value =>
                String(value ?? "")
                    .toLowerCase()
                    .includes(search)
            );

            if (!matchesSearch) return false;
        }

        for (const [columnIndex, filterValue] of selectedFilters) {
            const value = String(row[columnIndex] ?? "").trim();
            const isParticipantProgramColumn =
                isParticipantDataset &&
                normalizeDatasetHeader(headers[columnIndex]) === "program";
            const values = isParticipantProgramColumn
                ? value.split(",").map(item => item.trim()).filter(Boolean)
                : [value];
            const matchesFilter = filterValue === "__EMPTY__"
                ? values.length === 0
                : values.includes(filterValue);
            if (!matchesFilter) {
                return false;
            }
        }

        return rowMatchesChartFilter(row);
    });

    const totalPages =
        Math.max(
            Math.ceil(filteredRows.length / pageSize),
            1
        );

    currentPage =
        Math.max(
            1,
            Math.min(currentPage, totalPages)
        );
}

function getChartFilter() {
    const params = new URLSearchParams(window.location.search);

    chartFilterColumn =
        String(
            params.get("filterColumn") ||
            params.get("column") ||
            ""
        ).trim();

    chartFilterValue =
        String(
            params.get("filterValue") ||
            params.get("value") ||
            ""
        ).trim();
}

function rowMatchesChartFilter(row) {
    if (!chartFilterColumn) return true;

    const columnIndex = findColumnIndex(chartFilterColumn);

    if (columnIndex === -1) return true;

    const rowValue =
        String(row[columnIndex] ?? "").trim();

    const filterValue =
        String(chartFilterValue ?? "").trim();

    if (!filterValue) return true;

    if (filterValue.toUpperCase() === "__EMPTY__") {
        return rowValue === "";
    }

    return rowValue.toLowerCase() === filterValue.toLowerCase();
}

function applyChartFilter() {
    applyChartFilterToSelects();
    applyFilters();
}

function applyChartFilterToSelects() {
    if (!chartFilterColumn) return;

    const value = String(chartFilterValue ?? "").trim();

    if (!value) return;

    const column =
        String(chartFilterColumn)
            .trim()
            .toLowerCase();

    let select = null;

    const columnIndex = findColumnIndex(column);
    if (columnIndex >= 0) {
        select = document.querySelector(
            `#datasetFilterFields select[data-column-index="${columnIndex}"]`
        );
    }

    if (!select) return;

    const option = [...select.options].find(item =>
        item.value.toLowerCase() === value.toLowerCase()
    );

    if (option) {
        select.value = option.value;
    }
}

function renderTable() {
    if (editingCell) {
        finishEditingCell();
    }

    const tableHead = document.getElementById("tableHead");
    const tableBody = document.getElementById("tableBody");
    const emptyTable = document.getElementById("emptyTable");

    if (!tableHead || !tableBody || !emptyTable) return;

    const table = document.getElementById("datasetTable");
    table.style.width = "100%";
    table.style.minWidth = "100%";
    table.style.tableLayout = "fixed";

    tableHead.innerHTML = "";
    tableBody.innerHTML = "";
    emptyTable.style.display = "none";

    const headerRow = document.createElement("tr");
    const selectHeader = document.createElement("th");

    selectHeader.className = "row-select-cell";

    if (deleteMode) {
        selectHeader.classList.add("selection-enabled");
    }

    headerRow.appendChild(selectHeader);

    headers.forEach((header, columnIndex) => {
        if (!visibleColumns[columnIndex]) return;

        const th = document.createElement("th");

        th.dataset.columnIndex = columnIndex;

        applyColumnWidth(
            th,
            columnWidths[columnIndex] || 160
        );

        if (currentSortColumn === columnIndex) {
            th.classList.add(
                currentSortDirection === "asc"
                    ? "sort-asc"
                    : "sort-desc"
            );
        }

        th.classList.add("sortable");
        th.setAttribute(
            "aria-sort",
            currentSortColumn === columnIndex
                ? currentSortDirection
                : "none"
        );

        const content = document.createElement("span");
        content.className = "header-content";
        const title = document.createElement("span");
        title.className = "header-label";
        title.textContent =
            header || `Lajur ${columnIndex + 1}`;

        const sortIcon = document.createElement("span");
        sortIcon.className = "sort-icon";
        sortIcon.textContent =
            currentSortColumn === columnIndex
                ? currentSortDirection === "asc"
                    ? "▲"
                    : "▼"
                : "";

        content.append(title, sortIcon);
        th.appendChild(content);

        const resizeHandle = document.createElement("span");
        resizeHandle.className = "column-resize-handle";

        resizeHandle.addEventListener("mousedown", event =>
            beginColumnResize(event, columnIndex)
        );

        th.appendChild(resizeHandle);

        th.addEventListener("click", event => {
            if (event.target === resizeHandle) return;
            sortDataset(columnIndex);
        });

        headerRow.appendChild(th);
    });

    tableHead.appendChild(headerRow);

    if (!visibleColumns.some(Boolean)) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");

        cell.colSpan = 1;
        cell.className = "text-center p-4 text-muted";
        cell.textContent = "Pilih sekurang-kurangnya satu lajur.";

        row.appendChild(cell);
        tableBody.appendChild(row);

        updatePaginationInfo();
        return;
    }

    const startIndex = (currentPage - 1) * pageSize;
    const endIndex =
        Math.min(
            startIndex + pageSize,
            filteredRows.length
        );

    const pageRows = filteredRows.slice(startIndex, endIndex);

    if (!pageRows.length) {
        emptyTable.style.display = "block";
        updatePaginationInfo();
        updateDeleteButton();
        return;
    }

    pageRows.forEach(row => {
        const actualRowIndex = rows.indexOf(row);

        if (actualRowIndex === -1) return;

        const tr = document.createElement("tr");

        if (newRows.has(actualRowIndex)) {
            tr.classList.add("new-row");
        }

        if (deleteMode && selectedRows.has(actualRowIndex)) {
            tr.classList.add("delete-selected-row");
        }

        const selectCell = document.createElement("td");
        selectCell.className = "row-select-cell";

        if (deleteMode) {
            selectCell.classList.add("selection-enabled");

            const rowNumber = document.createElement("span");

            rowNumber.className = "row-number";
            rowNumber.textContent = actualRowIndex + 1;

            selectCell.appendChild(rowNumber);

            selectCell.addEventListener("mousedown", event => {
                if (event.button !== 0) return;

                event.preventDefault();
                event.stopPropagation();

                toggleDeleteRow(actualRowIndex);
            });
        } else {
            const rowNumber = document.createElement("span");

            rowNumber.className = "row-number";
            rowNumber.textContent = actualRowIndex + 1;

            selectCell.appendChild(rowNumber);
        }

        tr.appendChild(selectCell);

        headers.forEach((header, columnIndex) => {
            if (!visibleColumns[columnIndex]) return;

            const td = document.createElement("td");

            td.className = "excel-cell";
            td.tabIndex = 0;

            td.textContent = row[columnIndex] ?? "";
            td.title = row[columnIndex] ?? "";

            td.dataset.rowIndex = actualRowIndex;
            td.dataset.columnIndex = columnIndex;

            applyColumnWidth(
                td,
                columnWidths[columnIndex] || 160
            );

            if (deleteMode && selectedRows.has(actualRowIndex)) {
                td.classList.add("delete-selected-cell");
                td.style.backgroundColor = "#fee2e2";
                td.style.color = "#991b1b";
            }

            td.addEventListener("mousedown", event =>
                handleCellMouseDown(event, td)
            );

            td.addEventListener("mouseenter", () => {
                if (mouseSelecting && !deleteMode) {
                    extendSelectionTo(
                        Number(td.dataset.rowIndex),
                        Number(td.dataset.columnIndex)
                    );
                }
            });

            td.addEventListener("dblclick", event => {
                if (deleteMode) return;

                event.preventDefault();
                startCellEditing(td, false);
            });

            td.addEventListener("keydown", event =>
                handleCellKeydown(event, td)
            );

            tr.appendChild(td);
        });

        if (deleteMode && selectedRows.has(actualRowIndex)) {
            selectCell.style.backgroundColor = "#fecaca";
            selectCell.style.color = "#991b1b";
        }

        tableBody.appendChild(tr);
    });

    updatePaginationInfo();
    updateCellSelection();
    updateSelectionInfo();
    updateDeleteButton();
}

function toggleDeleteRow(rowIndex) {
    if (!deleteMode) return;

    if (
        rowIndex < 0 ||
        rowIndex >= rows.length
    ) {
        return;
    }

    finishEditingCell();

    if (selectedRows.has(rowIndex)) {
        selectedRows.delete(rowIndex);
    } else {
        selectedRows.add(rowIndex);
    }

    selectedCell = null;
    selectionAnchor = null;
    selectionRange = null;
    mouseSelecting = false;

    renderTable();
    updateDeleteButton();
}

function handleCellMouseDown(event, td) {
    if (event.button !== 0) return;

    const rowIndex = Number(td.dataset.rowIndex);

    if (deleteMode) {
        event.preventDefault();
        event.stopPropagation();

        toggleDeleteRow(rowIndex);
        return;
    }

    if (editingCell && editingCell !== td) {
        finishEditingCell();
    }

    const columnIndex = Number(td.dataset.columnIndex);

    if (event.shiftKey && selectionAnchor) {
        selectedCell = {
            rowIndex,
            columnIndex
        };

        selectionRange = {
            startRow: selectionAnchor.rowIndex,
            startColumn: selectionAnchor.columnIndex,
            endRow: rowIndex,
            endColumn: columnIndex
        };
    } else {
        selectedCell = {
            rowIndex,
            columnIndex
        };

        selectionAnchor = {
            rowIndex,
            columnIndex
        };

        selectionRange = {
            startRow: rowIndex,
            startColumn: columnIndex,
            endRow: rowIndex,
            endColumn: columnIndex
        };

        mouseSelecting = true;
    }

    updateCellSelection();
    updateSelectionInfo();
    td.focus();
}

function extendSelectionTo(rowIndex, columnIndex) {
    if (
        deleteMode ||
        !mouseSelecting ||
        !selectionAnchor
    ) {
        return;
    }

    selectedCell = {
        rowIndex,
        columnIndex
    };

    selectionRange = {
        startRow: selectionAnchor.rowIndex,
        startColumn: selectionAnchor.columnIndex,
        endRow: rowIndex,
        endColumn: columnIndex
    };

    updateCellSelection();
}

document.addEventListener("mouseup", () => {
    mouseSelecting = false;
});

function isCellInSelection(rowIndex, columnIndex) {
    if (!selectionRange) return false;

    const startFilteredIndex =
        getFilteredRowIndex(selectionRange.startRow);

    const endFilteredIndex =
        getFilteredRowIndex(selectionRange.endRow);

    if (
        startFilteredIndex === -1 ||
        endFilteredIndex === -1
    ) {
        return false;
    }

    const minFilteredRow =
        Math.min(
            startFilteredIndex,
            endFilteredIndex
        );

    const maxFilteredRow =
        Math.max(
            startFilteredIndex,
            endFilteredIndex
        );

    const currentFilteredIndex =
        getFilteredRowIndex(rowIndex);

    if (currentFilteredIndex === -1) {
        return false;
    }

    const minColumn =
        Math.min(
            selectionRange.startColumn,
            selectionRange.endColumn
        );

    const maxColumn =
        Math.max(
            selectionRange.startColumn,
            selectionRange.endColumn
        );

    return (
        currentFilteredIndex >= minFilteredRow &&
        currentFilteredIndex <= maxFilteredRow &&
        columnIndex >= minColumn &&
        columnIndex <= maxColumn
    );
}

function updateCellSelection() {
    document
        .querySelectorAll(
            ".excel-cell.selected-cell,.excel-cell.active-cell"
        )
        .forEach(cell => {
            cell.classList.remove(
                "selected-cell",
                "active-cell"
            );
        });

    if (deleteMode) return;

    document
        .querySelectorAll(".excel-cell")
        .forEach(td => {
            const rowIndex = Number(td.dataset.rowIndex);
            const columnIndex = Number(td.dataset.columnIndex);

            if (isCellInSelection(rowIndex, columnIndex)) {
                td.classList.add("selected-cell");
            }

            if (
                selectedCell &&
                rowIndex === selectedCell.rowIndex &&
                columnIndex === selectedCell.columnIndex
            ) {
                td.classList.add("active-cell");
            }
        });
}

function updateSelectionInfo() {
    const info = document.getElementById("selectionInfo");
    if (!info) return;

    const selected = [...document.querySelectorAll("#tableBody td.excel-cell.selected-cell")];
    const rowCount = new Set(selected.map(cell => cell.dataset.rowIndex)).size;
    const columnCount = new Set(selected.map(cell => cell.dataset.columnIndex)).size;
    info.textContent = `${rowCount} baris, ${columnCount} lajur, ${selected.length} sel dipilih`;
}

function getCellElement(rowIndex, columnIndex) {
    return document.querySelector(
        `td.excel-cell[data-row-index="${rowIndex}"][data-column-index="${columnIndex}"]`
    );
}

function startCellEditing(td, replaceValue = false) {
    if (!td || deleteMode) return;

    if (editingCell && editingCell !== td) {
        finishEditingCell();
    }

    if (td.classList.contains("editing-cell")) return;

    const rowIndex = Number(td.dataset.rowIndex);
    const columnIndex = Number(td.dataset.columnIndex);

    selectedCell = {
        rowIndex,
        columnIndex
    };

    selectionAnchor = {
        rowIndex,
        columnIndex
    };

    selectionRange = {
        startRow: rowIndex,
        startColumn: columnIndex,
        endRow: rowIndex,
        endColumn: columnIndex
    };

    const oldValue =
        String(rows[rowIndex]?.[columnIndex] ?? "");

    td.dataset.editOldValue = oldValue;
    td.contentEditable = "true";
    td.classList.add("editing-cell");

    editingCell = td;

    td.focus();

    td.textContent = replaceValue ? "" : oldValue;

    const selection = window.getSelection();
    const range = document.createRange();

    range.selectNodeContents(td);

    if (replaceValue) {
        range.collapse(false);
    }

    selection.removeAllRanges();
    selection.addRange(range);
    openDatasetCellSuggestions(td);
}

function openDatasetCellSuggestions(td) {
    if (
        !(
            getDatasetType(dataset || {}) === "peserta" &&
            normalizeDatasetHeader(headers[Number(td.dataset.columnIndex)]) === "kategori"
        ) &&
        !(
            getDatasetType(dataset || {}) === "penerima" &&
            ["pekerjaan", "statuspekerjaan", "status", "catatan"].includes(
            normalizeDatasetHeader(headers[Number(td.dataset.columnIndex)])
            )
        )
    ) return;

    const popup = document.createElement("div");
    popup.className = "recipient-cell-suggestions";
    popup.setAttribute("role", "listbox");
    const cellStyle = window.getComputedStyle(td);
    popup.style.fontFamily = cellStyle.fontFamily;
    popup.style.fontSize = cellStyle.fontSize;
    popup.style.fontWeight = cellStyle.fontWeight;
    popup.style.lineHeight = cellStyle.lineHeight;
    popup.style.letterSpacing = cellStyle.letterSpacing;
    document.body.appendChild(popup);

    const tableWrapper = document.getElementById("tableWrapper");
    const hideOnScroll = () => {
        popup.style.display = "none";
    };
    tableWrapper?.addEventListener("scroll", hideOnScroll, { passive: true });
    cellSuggestionState = {
        td,
        popup,
        options: [],
        activeIndex: -1,
        hideOnScroll,
        tableWrapper
    };
    td.addEventListener("input", updateDatasetCellSuggestions);
    updateDatasetCellSuggestions();
}

function updateDatasetCellSuggestions() {
    const state = cellSuggestionState;
    if (!state || !state.td.isConnected) return;

    const columnIndex = Number(state.td.dataset.columnIndex);
    const currentValue = state.td.textContent.trim();
    const query = currentValue.toLocaleLowerCase();
    const values = new Set(
        rows.map(row => String(row[columnIndex] ?? "").trim()).filter(Boolean)
    );
    if (currentValue) values.add(currentValue);

    state.options = [
        ...(query ? [] : [""]),
        ...[...values]
            .filter(value => value.toLocaleLowerCase().includes(query))
            .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }))
    ];
    state.activeIndex = state.options.findIndex(value =>
        value.toLocaleLowerCase() === currentValue.toLocaleLowerCase()
    );
    state.popup.replaceChildren();
    state.options.forEach((value, index) => {
        const option = document.createElement("button");
        option.type = "button";
        option.className = "recipient-cell-suggestion";
        option.setAttribute("role", "option");
        option.setAttribute("aria-selected", String(index === state.activeIndex));
        if (index === state.activeIndex) option.classList.add("active");
        option.textContent = value;
        option.addEventListener("mousedown", event => event.preventDefault());
        option.addEventListener("click", () => {
            state.td.textContent = value;
            finishEditingCell();
        });
        state.popup.appendChild(option);
    });

    const rect = state.td.getBoundingClientRect();
    state.popup.style.display = state.options.length ? "block" : "none";
    state.popup.style.left = `${Math.max(0, Math.min(rect.left, window.innerWidth - rect.width))}px`;
    state.popup.style.top = `${rect.bottom}px`;
    state.popup.style.width = `${rect.width}px`;
}

function closeDatasetCellSuggestions() {
    if (!cellSuggestionState) return;
    const { td, popup, tableWrapper, hideOnScroll } = cellSuggestionState;
    td.removeEventListener("input", updateDatasetCellSuggestions);
    tableWrapper?.removeEventListener("scroll", hideOnScroll);
    popup.remove();
    cellSuggestionState = null;
}

function finishEditingCell() {
    if (!editingCell) return;

    const td = editingCell;
    closeDatasetCellSuggestions();

    const rowIndex = Number(td.dataset.rowIndex);
    const columnIndex = Number(td.dataset.columnIndex);

    const oldValue =
        td.dataset.editOldValue ??
        rows[rowIndex]?.[columnIndex] ??
        "";

    const newValue = td.textContent;

    if (rows[rowIndex]) {
        rows[rowIndex][columnIndex] = newValue;
    }

    td.contentEditable = "false";
    td.classList.remove("editing-cell");
    editingCell = null;

    if (oldValue !== newValue) {
        addHistory({
            type: "edit",
            rowIndex,
            columnIndex,
            oldValue,
            newValue
        });
    }

    td.title = newValue;

    checkForChanges();
}

function exportDatasetToExcel() {
    try {
        finishEditingCell();
        applyFilters();
        if (!window.XLSX) throw new Error("Pustaka eksport Excel tidak tersedia.");

        const exportHeaders = headers.filter((_, index) => visibleColumns[index]);
        const worksheetData = [
            exportHeaders,
            ...filteredRows.map(row =>
                headers.flatMap((_, index) =>
                    visibleColumns[index] ? [row[index] ?? ""] : []
                )
            )
        ];
        const worksheet = window.XLSX.utils.aoa_to_sheet(worksheetData);
        const workbook = window.XLSX.utils.book_new();
        window.XLSX.utils.book_append_sheet(workbook, worksheet, "Data");
        window.XLSX.writeFile(
            workbook,
            `dataset-${getDatasetId()}-${new Date().toISOString().slice(0, 10)}.xlsx`
        );
    } catch (error) {
        console.error(error);
        showError(error.message || "Eksport Excel gagal.");
    }
}

function handleCellKeydown(event, td) {
    if (!td.classList.contains("editing-cell")) return;

    if (cellSuggestionState?.td === td) {
        const state = cellSuggestionState;
        if (["ArrowDown", "ArrowUp"].includes(event.key) && state.options.length) {
            event.preventDefault();
            event.stopPropagation();
            const direction = event.key === "ArrowDown" ? 1 : -1;
            state.activeIndex = state.activeIndex < 0
                ? (direction > 0 ? 0 : state.options.length - 1)
                : (state.activeIndex + direction + state.options.length) % state.options.length;
            state.popup.querySelectorAll(".recipient-cell-suggestion").forEach((option, index) => {
                const active = index === state.activeIndex;
                option.classList.toggle("active", active);
                option.setAttribute("aria-selected", String(active));
                if (active) option.scrollIntoView({ block: "nearest" });
            });
            return;
        }
        if (event.key === "Enter" && state.activeIndex >= 0) {
            event.preventDefault();
            event.stopPropagation();
            td.textContent = state.options[state.activeIndex];
            finishEditingCell();
            return;
        }
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        event.stopPropagation();
        finishEditingCell();
        saveDataset();
        return;
    }

    const rowIndex = Number(td.dataset.rowIndex);
    const columnIndex = Number(td.dataset.columnIndex);

    if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();

        const oldValue =
            td.dataset.editOldValue ?? "";

        if (rows[rowIndex]) {
            rows[rowIndex][columnIndex] = oldValue;
        }

        td.textContent = oldValue;
        td.contentEditable = "false";
        td.classList.remove("editing-cell");

        closeDatasetCellSuggestions();
        editingCell = null;

        updateCellSelection();
        checkForChanges();

        return;
    }

    if (event.key === "Tab") {
        event.preventDefault();
        event.stopPropagation();

        finishEditingCell();

        moveToNextCell(
            rowIndex,
            columnIndex,
            event.shiftKey
        );

        return;
    }

    if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();

        finishEditingCell();

        moveToVerticalCell(
            rowIndex,
            columnIndex,
            event.shiftKey ? -1 : 1
        );
    }
}

function getFilteredRowIndex(rowIndex) {
    const row = rows[rowIndex];

    if (!row) return -1;

    return filteredRows.indexOf(row);
}

function moveToFilteredCell(filteredIndex, columnIndex) {
    if (
        filteredIndex < 0 ||
        filteredIndex >= filteredRows.length
    ) {
        return;
    }

    const targetRow =
        rows.indexOf(filteredRows[filteredIndex]);

    if (targetRow === -1) return;

    const targetPage =
        Math.floor(filteredIndex / pageSize) + 1;

    if (targetPage !== currentPage) {
        currentPage = targetPage;
        renderTable();
    }

    selectedCell = {
        rowIndex: targetRow,
        columnIndex
    };

    selectionAnchor = {
        rowIndex: targetRow,
        columnIndex
    };

    selectionRange = {
        startRow: targetRow,
        startColumn: columnIndex,
        endRow: targetRow,
        endColumn: columnIndex
    };

    updateCellSelection();

    const td =
        getCellElement(
            targetRow,
            columnIndex
        );

    if (td) {
        td.scrollIntoView({
            block: "nearest",
            inline: "nearest"
        });
    }
}

function moveToNextCell(rowIndex, columnIndex, reverse = false) {
    const visibleIndexes = getVisibleColumnIndexes();

    if (!visibleIndexes.length) return;

    const columnPosition =
        visibleIndexes.indexOf(columnIndex);

    if (columnPosition === -1) return;

    let nextColumnPosition =
        columnPosition + (reverse ? -1 : 1);

    let targetFilteredIndex =
        getFilteredRowIndex(rowIndex);

    if (targetFilteredIndex === -1) return;

    if (
        nextColumnPosition >= 0 &&
        nextColumnPosition < visibleIndexes.length
    ) {
        moveToFilteredCell(
            targetFilteredIndex,
            visibleIndexes[nextColumnPosition]
        );

        return;
    }

    if (reverse) {
        targetFilteredIndex--;

        if (targetFilteredIndex < 0) return;

        nextColumnPosition =
            visibleIndexes.length - 1;
    } else {
        targetFilteredIndex++;

        if (
            targetFilteredIndex >=
            filteredRows.length
        ) {
            return;
        }

        nextColumnPosition = 0;
    }

    moveToFilteredCell(
        targetFilteredIndex,
        visibleIndexes[nextColumnPosition]
    );
}

function moveToVerticalCell(
    rowIndex,
    columnIndex,
    direction
) {
    const currentFilteredIndex =
        getFilteredRowIndex(rowIndex);

    if (currentFilteredIndex === -1) return;

    const targetFilteredIndex =
        currentFilteredIndex + direction;

    if (
        targetFilteredIndex < 0 ||
        targetFilteredIndex >= filteredRows.length
    ) {
        return;
    }

    moveToFilteredCell(
        targetFilteredIndex,
        columnIndex
    );
}

function beginTypingEdit(character) {
    if (!selectedCell || deleteMode) return;

    const td =
        getCellElement(
            selectedCell.rowIndex,
            selectedCell.columnIndex
        );

    if (!td) return;

    startCellEditing(td, true);

    td.textContent = character;
    updateDatasetCellSuggestions();

    const selection = window.getSelection();
    const range = document.createRange();

    range.selectNodeContents(td);
    range.collapse(false);

    selection.removeAllRanges();
    selection.addRange(range);
}

function getVisibleColumnIndexes() {
    return headers
        .map((_, index) => index)
        .filter(index => visibleColumns[index] !== false);
}

function getNextArrowCell(
    rowIndex,
    columnIndex,
    rowDelta,
    columnDelta
) {
    const visibleIndexes = getVisibleColumnIndexes();

    if (columnDelta !== 0) {
        const position = visibleIndexes.indexOf(columnIndex);

        if (position === -1) {
            return {
                rowIndex,
                columnIndex
            };
        }

        const nextPosition = position + columnDelta;

        if (
            nextPosition < 0 ||
            nextPosition >= visibleIndexes.length
        ) {
            return {
                rowIndex,
                columnIndex
            };
        }

        return {
            rowIndex,
            columnIndex: visibleIndexes[nextPosition]
        };
    }

    const currentFilteredIndex =
        getFilteredRowIndex(rowIndex);

    if (currentFilteredIndex === -1) {
        return {
            rowIndex,
            columnIndex
        };
    }

    const targetFilteredIndex =
        Math.max(
            0,
            Math.min(
                filteredRows.length - 1,
                currentFilteredIndex + rowDelta
            )
        );

    return {
        rowIndex:
            rows.indexOf(
                filteredRows[targetFilteredIndex]
            ),
        columnIndex
    };
}

function findCtrlArrowTarget(
    rowIndex,
    columnIndex,
    rowDelta,
    columnDelta
) {
    const visibleIndexes = getVisibleColumnIndexes();

    if (rowDelta !== 0) {
        const currentFilteredIndex =
            getFilteredRowIndex(rowIndex);

        if (currentFilteredIndex === -1) {
            return {
                rowIndex,
                columnIndex
            };
        }

        const currentValue =
            String(
                rows[rowIndex]?.[columnIndex] ?? ""
            ).trim();

        let targetFilteredIndex =
            currentFilteredIndex;

        if (rowDelta > 0) {
            if (currentValue === "") {
                while (
                    targetFilteredIndex + 1 < filteredRows.length &&
                    String(
                        filteredRows[targetFilteredIndex + 1]?.[columnIndex] ?? ""
                    ).trim() === ""
                ) {
                    targetFilteredIndex++;
                }
            }

            while (
                targetFilteredIndex + 1 < filteredRows.length &&
                String(
                    filteredRows[targetFilteredIndex + 1]?.[columnIndex] ?? ""
                ).trim() !== ""
            ) {
                targetFilteredIndex++;
            }
        } else {
            if (currentValue === "") {
                while (
                    targetFilteredIndex - 1 >= 0 &&
                    String(
                        filteredRows[targetFilteredIndex - 1]?.[columnIndex] ?? ""
                    ).trim() === ""
                ) {
                    targetFilteredIndex--;
                }
            }

            while (
                targetFilteredIndex - 1 >= 0 &&
                String(
                    filteredRows[targetFilteredIndex - 1]?.[columnIndex] ?? ""
                ).trim() !== ""
            ) {
                targetFilteredIndex--;
            }
        }

        return {
            rowIndex:
                rows.indexOf(
                    filteredRows[targetFilteredIndex]
                ),
            columnIndex
        };
    }

    const position = visibleIndexes.indexOf(columnIndex);

    if (position === -1) {
        return {
            rowIndex,
            columnIndex
        };
    }

    const currentValue =
        String(
            rows[rowIndex]?.[columnIndex] ?? ""
        ).trim();

    let targetPosition = position;

    if (columnDelta > 0) {
        if (currentValue === "") {
            while (
                targetPosition + 1 < visibleIndexes.length &&
                String(
                    rows[rowIndex]?.[
                    visibleIndexes[targetPosition + 1]
                    ] ?? ""
                ).trim() === ""
            ) {
                targetPosition++;
            }
        }

        while (
            targetPosition + 1 < visibleIndexes.length &&
            String(
                rows[rowIndex]?.[
                visibleIndexes[targetPosition + 1]
                ] ?? ""
            ).trim() !== ""
        ) {
            targetPosition++;
        }
    } else {
        if (currentValue === "") {
            while (
                targetPosition - 1 >= 0 &&
                String(
                    rows[rowIndex]?.[
                    visibleIndexes[targetPosition - 1]
                    ] ?? ""
                ).trim() === ""
            ) {
                targetPosition--;
            }
        }

        while (
            targetPosition - 1 >= 0 &&
            String(
                rows[rowIndex]?.[
                visibleIndexes[targetPosition - 1]
                ] ?? ""
            ).trim() !== ""
        ) {
            targetPosition--;
        }
    }

    return {
        rowIndex,
        columnIndex: visibleIndexes[targetPosition]
    };
}

function handleKeyboardSelection(event) {
    if (!selectedCell || deleteMode) return false;

    if (
        ![
            "ArrowUp",
            "ArrowDown",
            "ArrowLeft",
            "ArrowRight"
        ].includes(event.key)
    ) {
        return false;
    }

    const rowDelta =
        event.key === "ArrowUp"
            ? -1
            : event.key === "ArrowDown"
                ? 1
                : 0;

    const columnDelta =
        event.key === "ArrowLeft"
            ? -1
            : event.key === "ArrowRight"
                ? 1
                : 0;

    const target =
        event.ctrlKey
            ? findCtrlArrowTarget(
                selectedCell.rowIndex,
                selectedCell.columnIndex,
                rowDelta,
                columnDelta
            )
            : getNextArrowCell(
                selectedCell.rowIndex,
                selectedCell.columnIndex,
                rowDelta,
                columnDelta
            );

    if (event.shiftKey) {
        if (!selectionAnchor) {
            selectionAnchor = {
                rowIndex: selectedCell.rowIndex,
                columnIndex: selectedCell.columnIndex
            };
        }

        selectedCell = target;

        selectionRange = {
            startRow: selectionAnchor.rowIndex,
            startColumn: selectionAnchor.columnIndex,
            endRow: target.rowIndex,
            endColumn: target.columnIndex
        };
    } else {
        selectedCell = target;

        selectionAnchor = {
            rowIndex: target.rowIndex,
            columnIndex: target.columnIndex
        };

        selectionRange = {
            startRow: target.rowIndex,
            startColumn: target.columnIndex,
            endRow: target.rowIndex,
            endColumn: target.columnIndex
        };
    }

    const filteredIndex =
        getFilteredRowIndex(target.rowIndex);

    if (filteredIndex !== -1) {
        const page =
            Math.floor(filteredIndex / pageSize) + 1;

        if (page !== currentPage) {
            currentPage = page;
            renderTable();
        }
    }

    updateCellSelection();

    const td =
        getCellElement(
            target.rowIndex,
            target.columnIndex
        );

    if (td) {
        td.scrollIntoView({
            block: "nearest",
            inline: "nearest"
        });
    }

    return true;
}

function moveToCell(
    rowIndex,
    columnIndex,
    extendSelection = false,
    preserveAnchor = false
) {
    if (!rows.length || !headers.length || deleteMode) return;

    rowIndex =
        Math.max(
            0,
            Math.min(rows.length - 1, rowIndex)
        );

    columnIndex =
        Math.max(
            0,
            Math.min(headers.length - 1, columnIndex)
        );

    if (extendSelection) {
        if (!selectionAnchor) {
            selectionAnchor = {
                rowIndex:
                    selectedCell?.rowIndex ?? rowIndex,
                columnIndex:
                    selectedCell?.columnIndex ?? columnIndex
            };
        }

        selectedCell = {
            rowIndex,
            columnIndex
        };

        selectionRange = {
            startRow: selectionAnchor.rowIndex,
            startColumn: selectionAnchor.columnIndex,
            endRow: rowIndex,
            endColumn: columnIndex
        };
    } else {
        selectedCell = {
            rowIndex,
            columnIndex
        };

        if (!preserveAnchor) {
            selectionAnchor = {
                rowIndex,
                columnIndex
            };

            selectionRange = {
                startRow: rowIndex,
                startColumn: columnIndex,
                endRow: rowIndex,
                endColumn: columnIndex
            };
        }
    }

    const filteredIndex =
        getFilteredRowIndex(rowIndex);

    if (filteredIndex !== -1) {
        const page =
            Math.floor(filteredIndex / pageSize) + 1;

        if (page !== currentPage) {
            currentPage = page;
            renderTable();
        }
    }

    updateCellSelection();

    const td =
        getCellElement(
            rowIndex,
            columnIndex
        );

    if (td) {
        td.scrollIntoView({
            block: "nearest",
            inline: "nearest"
        });
    }
}

function getSelectedCellCoordinates() {
    if (!selectionRange) {
        return selectedCell
            ? [{
                rowIndex: selectedCell.rowIndex,
                columnIndex: selectedCell.columnIndex
            }]
            : [];
    }

    const startFilteredIndex =
        getFilteredRowIndex(selectionRange.startRow);

    const endFilteredIndex =
        getFilteredRowIndex(selectionRange.endRow);

    if (
        startFilteredIndex === -1 ||
        endFilteredIndex === -1
    ) {
        return selectedCell
            ? [{
                rowIndex: selectedCell.rowIndex,
                columnIndex: selectedCell.columnIndex
            }]
            : [];
    }

    const minFilteredIndex =
        Math.min(
            startFilteredIndex,
            endFilteredIndex
        );

    const maxFilteredIndex =
        Math.max(
            startFilteredIndex,
            endFilteredIndex
        );

    const minColumn =
        Math.min(
            selectionRange.startColumn,
            selectionRange.endColumn
        );

    const maxColumn =
        Math.max(
            selectionRange.startColumn,
            selectionRange.endColumn
        );

    const cells = [];

    for (
        let filteredIndex = minFilteredIndex;
        filteredIndex <= maxFilteredIndex;
        filteredIndex++
    ) {
        const rowIndex =
            rows.indexOf(
                filteredRows[filteredIndex]
            );

        if (rowIndex === -1) continue;

        for (
            let columnIndex = minColumn;
            columnIndex <= maxColumn;
            columnIndex++
        ) {
            cells.push({
                rowIndex,
                columnIndex
            });
        }
    }

    return cells;
}

function getSelectionBounds() {
    if (!selectedCell) return null;

    if (!selectionRange) {
        return {
            minRow: selectedCell.rowIndex,
            maxRow: selectedCell.rowIndex,
            minColumn: selectedCell.columnIndex,
            maxColumn: selectedCell.columnIndex
        };
    }

    return {
        minRow:
            Math.min(
                selectionRange.startRow,
                selectionRange.endRow
            ),
        maxRow:
            Math.max(
                selectionRange.startRow,
                selectionRange.endRow
            ),
        minColumn:
            Math.min(
                selectionRange.startColumn,
                selectionRange.endColumn
            ),
        maxColumn:
            Math.max(
                selectionRange.startColumn,
                selectionRange.endColumn
            )
    };
}

function buildClipboardText() {
    if (!selectionRange && !selectedCell) return "";

    const cells = getSelectedCellCoordinates();

    if (!cells.length) return "";

    const minColumn =
        Math.min(
            ...cells.map(cell => cell.columnIndex)
        );

    const maxColumn =
        Math.max(
            ...cells.map(cell => cell.columnIndex)
        );

    const grouped = new Map();

    cells.forEach(cell => {
        if (!grouped.has(cell.rowIndex)) {
            grouped.set(cell.rowIndex, []);
        }

        grouped.get(cell.rowIndex).push(cell.columnIndex);
    });

    const rowIndexes = [...grouped.keys()];

    rowIndexes.sort((a, b) => {
        const aIndex = getFilteredRowIndex(a);
        const bIndex = getFilteredRowIndex(b);

        return aIndex - bIndex;
    });

    const output = [];

    rowIndexes.forEach(rowIndex => {
        const values = [];

        for (
            let columnIndex = minColumn;
            columnIndex <= maxColumn;
            columnIndex++
        ) {
            values.push(
                String(
                    rows[rowIndex]?.[columnIndex] ?? ""
                )
            );
        }

        output.push(values.join("\t"));
    });

    return output.join("\r\n");
}

function handleTableCopy(event) {
    if (
        !isDatasetViewActive() ||
        !selectedCell ||
        editingCell ||
        deleteMode ||
        isFormField(event.target)
    ) return;

    const text = buildClipboardText();
    if (!text || !event.clipboardData) return;

    event.clipboardData.setData("text/plain", text);
    event.preventDefault();
}

function handleTableCut(event) {
    handleTableCopy(event);
    if (event.defaultPrevented) clearSelectedCells();
}

function parseClipboardText(text) {
    const lines =
        text
            .replace(/\r\n/g, "\n")
            .replace(/\r/g, "\n")
            .split("\n");

    while (
        lines.length &&
        lines[lines.length - 1] === ""
    ) {
        lines.pop();
    }

    return lines.map(line => line.split("\t"));
}

function handleTablePaste(event) {
    if (
        !isDatasetViewActive() ||
        !selectedCell ||
        editingCell ||
        deleteMode ||
        isFormField(event.target)
    ) return;

    const text = event.clipboardData?.getData("text/plain");
    if (!text) return;

    event.preventDefault();
    pasteText(text);
}

function pasteText(text) {
    if (deleteMode) return;

    const matrix = parseClipboardText(text);

    if (!matrix.length || !headers.length) return;

    const startRow = selectedCell.rowIndex;
    const startColumn = selectedCell.columnIndex;

    const changes = [];
    const addedRows = [];

    const startFilteredIndex =
        getFilteredRowIndex(startRow);

    if (startFilteredIndex === -1) return;

    const targetRows = [];

    for (
        let rowOffset = 0;
        rowOffset < matrix.length;
        rowOffset++
    ) {
        const filteredIndex =
            startFilteredIndex + rowOffset;

        if (filteredIndex < filteredRows.length) {
            const targetRow =
                rows.indexOf(
                    filteredRows[filteredIndex]
                );

            if (targetRow !== -1) {
                targetRows.push(targetRow);
                continue;
            }
        }

        const index = rows.length;
        const newRow = headers.map(() => "");

        rows.push(newRow);
        newRows.add(index);

        addedRows.push({
            index,
            row: [...newRow]
        });

        targetRows.push(index);
    }

    matrix.forEach((pasteRow, rowOffset) => {
        const targetRow = targetRows[rowOffset];

        if (targetRow === undefined) return;

        pasteRow.forEach((value, columnOffset) => {
            const targetColumn =
                startColumn + columnOffset;

            if (targetColumn >= headers.length) return;

            const oldValue =
                rows[targetRow][targetColumn] ?? "";

            const newValue = value ?? "";

            if (oldValue === newValue) return;

            rows[targetRow][targetColumn] = newValue;

            changes.push({
                rowIndex: targetRow,
                columnIndex: targetColumn,
                oldValue,
                newValue
            });
        });
    });

    if (!changes.length && !addedRows.length) return;

    addHistory({
        type: "paste",
        changes,
        addedRows
    });

    selectedCell = {
        rowIndex: startRow,
        columnIndex: startColumn
    };

    selectionAnchor = {
        rowIndex: startRow,
        columnIndex: startColumn
    };

    const maxPasteColumns =
        matrix.reduce(
            (max, row) => Math.max(max, row.length),
            0
        );

    const endRow =
        targetRows.length
            ? targetRows[targetRows.length - 1]
            : startRow;

    const endColumn =
        Math.min(
            headers.length - 1,
            startColumn + maxPasteColumns - 1
        );

    selectionRange = {
        startRow,
        startColumn,
        endRow,
        endColumn
    };

    createFilterOptions();
    applyFilters();

    const filteredIndex =
        getFilteredRowIndex(startRow);

    currentPage =
        filteredIndex === -1
            ? 1
            : Math.floor(filteredIndex / pageSize) + 1;

    checkForChanges();
    renderTable();
}

function clearSelectedCells() {
    if (deleteMode) return;

    const cells = getSelectedCellCoordinates();

    if (!cells.length) return;

    const changes = [];

    cells.forEach(({ rowIndex, columnIndex }) => {
        const oldValue =
            rows[rowIndex]?.[columnIndex] ?? "";

        if (oldValue !== "") {
            rows[rowIndex][columnIndex] = "";

            changes.push({
                rowIndex,
                columnIndex,
                oldValue,
                newValue: ""
            });
        }
    });

    if (!changes.length) return;

    addHistory({
        type: "multiEdit",
        changes
    });

    checkForChanges();
    renderTable();
}

function sortDataset(columnIndex) {
    if (deleteMode) return;

    if (currentSortColumn === columnIndex) {
        currentSortDirection =
            currentSortDirection === "asc"
                ? "desc"
                : "asc";
    } else {
        currentSortColumn = columnIndex;
        currentSortDirection = "asc";
    }

    const direction = currentSortDirection;

    rows.sort((a, b) => {
        const valueA =
            String(a[columnIndex] ?? "").trim();

        const valueB =
            String(b[columnIndex] ?? "").trim();

        const numberA =
            Number(valueA.replace(/,/g, ""));

        const numberB =
            Number(valueB.replace(/,/g, ""));

        let comparison;

        if (
            valueA !== "" &&
            valueB !== "" &&
            !isNaN(numberA) &&
            !isNaN(numberB)
        ) {
            comparison = numberA - numberB;
        } else {
            comparison =
                valueA.localeCompare(
                    valueB,
                    undefined,
                    {
                        numeric: true,
                        sensitivity: "base"
                    }
                );
        }

        return direction === "asc"
            ? comparison
            : -comparison;
    });

    selectedCell = null;
    selectionAnchor = null;
    selectionRange = null;
    selectedRows.clear();

    applyFilters();
    currentPage = 1;

    renderTable();
    updateDeleteButton();
}

function setColumnWidth(columnIndex, width) {
    const nextWidth =
        Math.max(
            80,
            Math.min(600, Math.round(width))
        );

    columnWidths[columnIndex] = nextWidth;

    document
        .querySelectorAll(
            `th[data-column-index="${columnIndex}"],td[data-column-index="${columnIndex}"]`
        )
        .forEach(cell =>
            applyColumnWidth(cell, nextWidth)
        );
}

function applyColumnWidth(cell, width) {
    cell.style.width = `${width}px`;
    cell.style.minWidth = `${width}px`;
    cell.style.maxWidth = "none";
}

function beginColumnResize(event, columnIndex) {
    event.preventDefault();
    event.stopPropagation();

    const startX = event.clientX;
    const startWidth =
        columnWidths[columnIndex] || 160;

    const onMouseMove = moveEvent => {
        setColumnWidth(
            columnIndex,
            startWidth +
            moveEvent.clientX -
            startX
        );
    };

    const onMouseUp = () => {
        document.body.classList.remove("resizing-column");

        document.removeEventListener(
            "mousemove",
            onMouseMove
        );

        document.removeEventListener(
            "mouseup",
            onMouseUp
        );
    };

    document.body.classList.add("resizing-column");

    document.addEventListener(
        "mousemove",
        onMouseMove
    );

    document.addEventListener(
        "mouseup",
        onMouseUp
    );
}

function addRow() {
    if (deleteMode) return;

    const form = document.getElementById("addForm");
    const card = document.getElementById("addRecordCard");

    if (!form || !card) return;

    form.classList.add("show");
    form.setAttribute("aria-hidden", "false");
    card.classList.add("show");
    card.setAttribute("aria-hidden", "false");
    document.getElementById("addNama")?.focus();
}

function closeAddForm() {
    const form = document.getElementById("addForm");
    const card = document.getElementById("addRecordCard");

    form?.classList.remove("show");
    form?.setAttribute("aria-hidden", "true");
    card?.classList.remove("show");
    card?.setAttribute("aria-hidden", "true");

    document.querySelectorAll(
        "#addRecordFields input, #addRecordFields select, #addRecordFields textarea"
    ).forEach(element => {
        element.value = "";
        if (element.id === "addStatusCustom") element.style.display = "none";
    });
}

function confirmAddRow() {
    if (deleteMode) return;

    const fields = addRecordFieldsForDataset();
    const values = new Map(fields.map(field => {
        const input = document.getElementById(field.id);
        if (field.status && input?.value === "__add_new_status__") {
            return [field.id, document.getElementById("addStatusCustom")?.value || ""];
        }
        return [field.id, input?.value || ""];
    }));

    const newRow =
        headers.map(header => {
            const key = normalizeDatasetHeader(header);
            const field = fields.find(item => item.headers.includes(key));
            return field ? values.get(field.id) || "" : "";
        });

    const insertIndex = rows.length;

    rows.push(newRow);
    newRows.add(insertIndex);

    addHistory({
        type: "add",
        rowIndex: insertIndex,
        row: [...newRow]
    });

    selectedRows.clear();

    selectedCell = {
        rowIndex: insertIndex,
        columnIndex: 0
    };

    selectionAnchor = {
        rowIndex: insertIndex,
        columnIndex: 0
    };

    selectionRange = {
        startRow: insertIndex,
        startColumn: 0,
        endRow: insertIndex,
        endColumn: 0
    };

    closeAddForm();

    createFilterOptions();
    applyFilters();

    currentPage =
        Math.max(
            1,
            Math.ceil(
                filteredRows.length /
                pageSize
            )
        );

    checkForChanges();
    updateDeleteButton();
    renderTable();
}

function toggleDeleteMode() {
    deleteMode = !deleteMode;

    finishEditingCell();

    selectedCell = null;
    selectionAnchor = null;
    selectionRange = null;
    mouseSelecting = false;

    if (!deleteMode) {
        selectedRows.clear();
    }

    updateDeleteMode();
    updateDeleteButton();
    renderTable();
}

function updateDeleteMode() {
    const button =
        document.getElementById("deleteRowButton");

    if (!button) return;

    button.classList.toggle("active", deleteMode);

    button.title =
        deleteMode
            ? "Tutup Pilihan Rekod"
            : "Pilih Rekod";

    const icon = button.querySelector("i");

    if (icon) {
        icon.className = "bi bi-trash3";
    }
}

function updateDeleteButton() {
    const button =
        document.getElementById("bulkDeleteButton");

    if (!button) return;

    const count = selectedRows.size;

    if (!deleteMode || count === 0) {
        button.style.display = "none";
        button.setAttribute("aria-hidden", "true");
        return;
    }

    button.style.display = "flex";
    button.setAttribute("aria-hidden", "false");

    button.innerHTML = `
        <div class="floating-delete-icon">
            <i class="bi bi-trash3"></i>
        </div>

        <div class="floating-delete-content">
            <strong>${count} rekod dipilih</strong>
            <span>Klik untuk membuang rekod yang dipilih</span>
        </div>

        <div class="floating-delete-arrow">
            <i class="bi bi-chevron-right"></i>
        </div>
    `;
}

function openDeleteConfirmation() {
    if (!deleteMode || !selectedRows.size) return;

    const text =
        document.getElementById("deleteConfirmText");

    if (text) {
        text.textContent =
            `Adakah anda pasti mahu membuang ${selectedRows.size} rekod yang dipilih?`;
    }

    const modal =
        document.getElementById("deleteConfirm");

    if (modal) {
        modal.style.display = "flex";
        modal.setAttribute("aria-hidden", "false");
    }
}

function closeDeleteConfirmation() {
    const modal =
        document.getElementById("deleteConfirm");

    if (modal) {
        modal.style.display = "none";
        modal.setAttribute("aria-hidden", "true");
    }
}

function deleteSelectedRows() {
    if (!deleteMode || !selectedRows.size) return;

    const indexes =
        [...selectedRows]
            .filter(index => index >= 0 && index < rows.length)
            .sort((a, b) => b - a);

    if (!indexes.length) {
        selectedRows.clear();
        updateDeleteButton();
        return;
    }

    const deletedRows =
        indexes.map(index => ({
            index,
            row: [...rows[index]]
        }));

    indexes.forEach(index => {
        rows.splice(index, 1);
    });

    addHistory({
        type: "delete",
        rows: deletedRows
    });

    newRows = new Set(
        [...newRows]
            .filter(index => !selectedRows.has(index))
            .map(index => {
                const shift =
                    indexes.filter(
                        deletedIndex =>
                            deletedIndex < index
                    ).length;

                return index - shift;
            })
    );

    selectedRows.clear();

    selectedCell = null;
    selectionAnchor = null;
    selectionRange = null;

    closeDeleteConfirmation();

    createFilterOptions();
    applyFilters();

    const totalPages =
        Math.max(
            Math.ceil(filteredRows.length / pageSize),
            1
        );

    currentPage =
        Math.min(currentPage, totalPages);

    updateDeleteButton();
    checkForChanges();
    renderTable();
}

function addHistory(action) {
    if (isRestoringHistory) return;

    undoStack.push(action);
    redoStack = [];

    updateUndoRedoButtons();
}

function restoreDeletedRows(rowsToRestore) {
    [...rowsToRestore]
        .sort((a, b) => a.index - b.index)
        .forEach(item => {
            rows.splice(
                Math.max(
                    0,
                    Math.min(item.index, rows.length)
                ),
                0,
                [...item.row]
            );
        });
}

function undo() {
    if (!undoStack.length) return;

    finishEditingCell();

    const action = undoStack.pop();

    const previousDeleteMode = deleteMode;
    const previousSelectedRows = new Set(selectedRows);

    isRestoringHistory = true;

    try {
        if (action.type === "edit") {
            if (rows[action.rowIndex]) {
                rows[action.rowIndex][action.columnIndex] =
                    action.oldValue;
            }
        }

        if (action.type === "multiEdit") {
            action.changes.forEach(change => {
                if (rows[change.rowIndex]) {
                    rows[change.rowIndex][change.columnIndex] =
                        change.oldValue;
                }
            });
        }

        if (action.type === "paste") {
            action.changes.forEach(change => {
                if (rows[change.rowIndex]) {
                    rows[change.rowIndex][change.columnIndex] =
                        change.oldValue;
                }
            });

            [...action.addedRows]
                .sort((a, b) => b.index - a.index)
                .forEach(item => {
                    if (item.index < rows.length) {
                        rows.splice(item.index, 1);
                    }

                    newRows.delete(item.index);
                });
        }

        if (action.type === "add") {
            if (
                action.rowIndex >= 0 &&
                action.rowIndex < rows.length
            ) {
                rows.splice(action.rowIndex, 1);
            }

            newRows.delete(action.rowIndex);
        }

        if (action.type === "delete") {
            restoreDeletedRows(action.rows);
        }

        redoStack.push(action);

        deleteMode = previousDeleteMode;
        selectedRows.clear();

        if (previousDeleteMode) {
            previousSelectedRows.forEach(index => {
                if (
                    index >= 0 &&
                    index < rows.length
                ) {
                    selectedRows.add(index);
                }
            });
        }

        applyFilters();
        createFilterOptions();
        updateDeleteMode();
        renderTable();
        updateDeleteButton();
    } finally {
        isRestoringHistory = false;
    }

    checkForChanges();
    updateUndoRedoButtons();
}

function redo() {
    if (!redoStack.length) return;

    finishEditingCell();

    const action = redoStack.pop();

    const previousDeleteMode = deleteMode;
    const previousSelectedRows = new Set(selectedRows);

    isRestoringHistory = true;

    try {
        if (action.type === "edit") {
            if (rows[action.rowIndex]) {
                rows[action.rowIndex][action.columnIndex] =
                    action.newValue;
            }
        }

        if (action.type === "multiEdit") {
            action.changes.forEach(change => {
                if (rows[change.rowIndex]) {
                    rows[change.rowIndex][change.columnIndex] =
                        change.newValue;
                }
            });
        }

        if (action.type === "paste") {
            action.addedRows
                .sort((a, b) => a.index - b.index)
                .forEach(item => {
                    if (!rows[item.index]) {
                        rows.splice(
                            item.index,
                            0,
                            [...item.row]
                        );

                        newRows.add(item.index);
                    }
                });

            action.changes.forEach(change => {
                if (rows[change.rowIndex]) {
                    rows[change.rowIndex][change.columnIndex] =
                        change.newValue;
                }
            });
        }

        if (action.type === "add") {
            if (!rows[action.rowIndex]) {
                rows.splice(
                    action.rowIndex,
                    0,
                    [...action.row]
                );
            }

            newRows.add(action.rowIndex);
        }

        if (action.type === "delete") {
            action.rows
                .map(item => item.index)
                .sort((a, b) => b - a)
                .forEach(index => {
                    if (
                        index >= 0 &&
                        index < rows.length
                    ) {
                        rows.splice(index, 1);
                    }
                });
        }

        undoStack.push(action);

        deleteMode = previousDeleteMode;
        selectedRows.clear();

        if (previousDeleteMode) {
            previousSelectedRows.forEach(index => {
                if (
                    index >= 0 &&
                    index < rows.length
                ) {
                    selectedRows.add(index);
                }
            });
        }

        applyFilters();
        createFilterOptions();
        updateDeleteMode();
        renderTable();
        updateDeleteButton();
    } finally {
        isRestoringHistory = false;
    }

    checkForChanges();
    updateUndoRedoButtons();
}

function updateUndoRedoButtons() {
    const undoButton =
        document.getElementById("undoButton");

    const redoButton =
        document.getElementById("redoButton");

    if (undoButton) {
        undoButton.disabled =
            undoStack.length === 0;
    }

    if (redoButton) {
        redoButton.disabled =
            redoStack.length === 0;
    }
}

function updatePaginationInfo() {
    const total = filteredRows.length;

    const totalPages =
        Math.max(
            Math.ceil(total / pageSize),
            1
        );

    if (currentPage > totalPages) {
        currentPage = totalPages;
    }

    const start =
        total
            ? (currentPage - 1) * pageSize + 1
            : 0;

    const end =
        Math.min(
            currentPage * pageSize,
            total
        );

    const info =
        document.getElementById("paginationInfo");

    if (info) {
        info.textContent =
            total
                ? `${start.toLocaleString()}–${end.toLocaleString()} daripada ${total.toLocaleString()} baris`
                : "0 baris";
    }

    renderPageNumbers(totalPages);

    const first =
        document.getElementById("firstPage");

    const previous =
        document.getElementById("previousPage");

    const next =
        document.getElementById("nextPage");

    const last =
        document.getElementById("lastPage");

    if (first) first.disabled = currentPage <= 1;
    if (previous) previous.disabled = currentPage <= 1;
    if (next) next.disabled = currentPage >= totalPages;
    if (last) last.disabled = currentPage >= totalPages;
}

function renderPageNumbers(totalPages) {
    const container =
        document.getElementById("pageNumbers");

    if (!container) return;

    container.innerHTML = "";

    let startPage =
        Math.max(currentPage - 2, 1);

    let endPage =
        Math.min(startPage + 4, totalPages);

    if (endPage - startPage < 4) {
        startPage =
            Math.max(endPage - 4, 1);
    }

    for (
        let page = startPage;
        page <= endPage;
        page++
    ) {
        const button =
            document.createElement("button");

        button.className = "page-button";

        if (page === currentPage) {
            button.classList.add("active");
        }

        button.textContent = page;
        button.onclick = () => goToPage(page);

        container.appendChild(button);
    }
}

function goToPage(page) {
    const totalPages =
        Math.max(
            Math.ceil(filteredRows.length / pageSize),
            1
        );

    currentPage =
        Math.max(
            1,
            Math.min(page, totalPages)
        );

    renderTable();
}

function previousPage() {
    goToPage(currentPage - 1);
}

function nextPage() {
    goToPage(currentPage + 1);
}

function goToLastPage() {
    goToPage(
        Math.max(
            Math.ceil(filteredRows.length / pageSize),
            1
        )
    );
}

function escapeCSVValue(value) {
    value = String(value ?? "");

    if (
        value.includes(",") ||
        value.includes('"') ||
        value.includes("\n") ||
        value.includes("\r")
    ) {
        return `"${value.replace(/"/g, '""')}"`;
    }

    return value;
}

function createCSV() {
    finishEditingCell();

    const csvRows = [];

    csvRows.push(
        headers.map(escapeCSVValue).join(",")
    );

    rows.forEach(row => {
        csvRows.push(
            headers
                .map((_, index) =>
                    escapeCSVValue(
                        row[index] ?? ""
                    )
                )
                .join(",")
        );
    });

    return csvRows.join("\r\n");
}

function updateSaveButton() {
    const button =
        document.getElementById("saveChangesButton");

    if (!button) return;

    if (hasUnsavedChanges) {
        button.disabled = false;
        button.innerHTML = '<i class="bi bi-floppy"></i>';
        button.title = "Simpan perubahan";
        button.setAttribute("aria-label", "Simpan perubahan");
        button.classList.add("has-changes");
        button.classList.remove("saved");
    } else {
        button.disabled = true;
        button.innerHTML = '<i class="bi bi-floppy"></i>';
        button.title = "Disimpan";
        button.setAttribute("aria-label", "Disimpan");
        button.classList.remove("has-changes");
        button.classList.add("saved");
    }
}

async function refreshDatasetHeader() {
    const id = getDatasetId();

    if (!id) return;

    try {
        const response =
            await fetch(`/api/datasets/${id}`);

        const text = await response.text();

        let result;

        try {
            result = JSON.parse(text);
        } catch {
            return;
        }

        if (!response.ok || !result.success) return;

        dataset = result;
        updateDatasetHeader();
    } catch (error) {
        console.error(
            "Gagal refresh header dataset:",
            error
        );
    }
}

async function saveDataset() {
    finishEditingCell();
    checkForChanges();

    if (!hasUnsavedChanges) return;

    const button =
        document.getElementById("saveChangesButton");

    if (!button) return;

    button.disabled = true;
    button.classList.add("is-saving");
    button.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>';
    button.title = "Menyimpan...";
    button.setAttribute("aria-label", "Menyimpan...");
    savingChanges = true;

    try {
        const csv = createCSV();
        const id = getDatasetId();

        const response =
            await fetch(
                `/api/datasets/${id}`,
                {
                    method: "PUT",
                    headers: {
                        "Content-Type": "application/json",
                        "Accept": "application/json"
                    },
                    body: JSON.stringify({ csv })
                }
            );

        const responseText =
            await response.text();

        let result;

        try {
            result = JSON.parse(responseText);
        } catch {
            throw new Error(
                `Server mengembalikan HTTP ${response.status}.`
            );
        }

        if (
            !response.ok ||
            result.success === false
        ) {
            throw new Error(
                result.error ||
                result.message ||
                `Server mengembalikan HTTP ${response.status}.`
            );
        }

        originalRows =
            rows.map(row => [...row]);
        sourceHeaders = [...headers];
        sourceRows = rows.map(row => [...row]);

        newRows.clear();
        hasUnsavedChanges = false;
        schemaNeedsSave = false;

        await refreshDatasetHeader();

        createFilterOptions();
        applyFilters();
        renderTable();

        updateSaveButton();
        showDatasetSaveConfirmation();
    } catch (error) {
        console.error(error);

        alert(
            error.message ||
            "Gagal menyimpan dataset."
        );

        hasUnsavedChanges = true;
    } finally {
        savingChanges = false;
        button.classList.remove("is-saving");
        updateSaveButton();
    }
}

function formatFileSize(bytes) {
    bytes = Number(bytes || 0);

    if (bytes < 1024) {
        return `${bytes} B`;
    }

    if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(1)} KB`;
    }

    if (bytes < 1024 * 1024 * 1024) {
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
    ).toFixed(1)} GB`;
}

function showError(message) {
    const loading =
        document.getElementById("loading");

    if (loading) {
        loading.style.display = "none";
    }

    const error =
        document.getElementById("errorMessage");

    if (error) {
        error.textContent = message;
        error.style.display = "block";
    }
}

function isFormField(target) {
    return [
        "INPUT",
        "TEXTAREA",
        "SELECT",
        "BUTTON"
    ].includes(target?.tagName);
}

function isDatasetViewActive() {
    return document.getElementById("datasetDetailView")?.style.display === "block";
}

document.addEventListener("keydown", event => {
    const key = event.key.toLowerCase();

    const modifier =
        event.ctrlKey ||
        event.metaKey;

    if (modifier && key === "s") {
        if (!isDatasetViewActive()) {
            return;
        }
        event.preventDefault();
        if (editingCell) finishEditingCell();
        saveDataset();
        return;
    }

    if (!isDatasetViewActive()) return;

    if (
        modifier &&
        key === "z" &&
        !event.shiftKey &&
        !editingCell &&
        !isFormField(event.target)
    ) {
        event.preventDefault();
        undo();
        return;
    }

    if (
        modifier &&
        (key === "y" || (event.shiftKey && key === "z")) &&
        !editingCell &&
        !isFormField(event.target)
    ) {
        event.preventDefault();
        redo();
        return;
    }

    if (
        editingCell ||
        isFormField(event.target)
    ) {
        return;
    }

    if (deleteMode) {
        if (
            event.key === "Escape" &&
            selectedRows.size
        ) {
            selectedRows.clear();
            renderTable();
            updateDeleteButton();
        }

        return;
    }

    if (!selectedCell) return;

    if (
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        event.key.length === 1
    ) {
        event.preventDefault();

        beginTypingEdit(event.key);

        return;
    }

    if (
        [
            "ArrowUp",
            "ArrowDown",
            "ArrowLeft",
            "ArrowRight"
        ].includes(event.key)
    ) {
        event.preventDefault();
        handleKeyboardSelection(event);
        return;
    }

    if (event.key === "Tab") {
        event.preventDefault();

        moveToNextCell(
            selectedCell.rowIndex,
            selectedCell.columnIndex,
            event.shiftKey
        );

        return;
    }

    if (event.key === "Enter") {
        event.preventDefault();

        moveToVerticalCell(
            selectedCell.rowIndex,
            selectedCell.columnIndex,
            event.shiftKey ? -1 : 1
        );

        return;
    }

    if (event.key === "F2") {
        event.preventDefault();

        const td =
            getCellElement(
                selectedCell.rowIndex,
                selectedCell.columnIndex
            );

        if (td) {
            startCellEditing(td, false);
        }

        return;
    }

    if (event.key === "Delete") {
        event.preventDefault();
        clearSelectedCells();
        return;
    }

});

document.addEventListener("copy", handleTableCopy);
document.addEventListener("cut", handleTableCut);
document.addEventListener("paste", handleTablePaste);

document.addEventListener("mousedown", event => {
    const td =
        event.target.closest("td.editing-cell");

    if (
        editingCell &&
        !td &&
        !event.target.closest(".dataset-table")
    ) {
        finishEditingCell();
    }
});

const columnButton =
    document.getElementById("columnButton");

if (columnButton) {
    columnButton.addEventListener("click", event => {
        event.stopPropagation();

        document
            .getElementById("filterMenu")
            ?.classList.remove("show");

        document
            .getElementById("columnMenu")
            ?.classList.toggle("show");
    });
}

const filterButton =
    document.getElementById("filterButton");

if (filterButton) {
    filterButton.addEventListener("click", event => {
        event.stopPropagation();

        document
            .getElementById("columnMenu")
            ?.classList.remove("show");

        document
            .getElementById("filterMenu")
            ?.classList.toggle("show");
    });
}

document.addEventListener("click", event => {
    const columnWrapper =
        document.querySelector(".column-menu-wrapper");

    const filterWrapper =
        document.querySelector(".filter-menu-wrapper");

    if (
        columnWrapper &&
        !columnWrapper.contains(event.target)
    ) {
        document
            .getElementById("columnMenu")
            ?.classList.remove("show");
    }

    if (
        filterWrapper &&
        !filterWrapper.contains(event.target)
    ) {
        document
            .getElementById("filterMenu")
            ?.classList.remove("show");
    }
});

document
    .getElementById("selectAllColumnsButton")
    ?.addEventListener(
        "click",
        toggleAllColumns
    );

document
    .getElementById("searchInput")
    ?.addEventListener("input", () => {
        currentPage = 1;
        applyFilters();
        renderTable();
    });

document
    .getElementById("addRowButton")
    ?.addEventListener("click", addRow);

document
    .getElementById("cancelAddButton")
    ?.addEventListener("click", closeAddForm);

document
    .getElementById("closeAddFormButton")
    ?.addEventListener("click", closeAddForm);

document
    .getElementById("confirmAddButton")
    ?.addEventListener("click", confirmAddRow);

document
    .getElementById("deleteRowButton")
    ?.addEventListener("click", toggleDeleteMode);

document
    .getElementById("bulkDeleteButton")
    ?.addEventListener(
        "click",
        openDeleteConfirmation
    );

document
    .getElementById("cancelDeleteButton")
    ?.addEventListener(
        "click",
        closeDeleteConfirmation
    );

document
    .getElementById("confirmDeleteButton")
    ?.addEventListener(
        "click",
        deleteSelectedRows
    );

document
    .getElementById("saveChangesButton")
    ?.addEventListener(
        "click",
        saveDataset
    );

document
    .getElementById("undoButton")
    ?.addEventListener(
        "click",
        undo
    );

document
    .getElementById("redoButton")
    ?.addEventListener(
        "click",
        redo
    );

document
    .getElementById("firstPage")
    ?.addEventListener(
        "click",
        () => goToPage(1)
    );

document
    .getElementById("previousPage")
    ?.addEventListener(
        "click",
        previousPage
    );

document
    .getElementById("nextPage")
    ?.addEventListener(
        "click",
        nextPage
    );

document
    .getElementById("lastPage")
    ?.addEventListener(
        "click",
        goToLastPage
    );

document
    .getElementById("addForm")
    ?.addEventListener("mousedown", event => {
        if (event.target.id === "addForm") {
            closeAddForm();
        }
    });

document
    .getElementById("deleteConfirm")
    ?.addEventListener("mousedown", event => {
        if (event.target.id === "deleteConfirm") {
            closeDeleteConfirmation();
        }
    });

function getURLFilters() {
    const params =
        new URLSearchParams(window.location.search);

    const filters = {};

    params.forEach((value, key) => {
        if (value.trim()) {
            filters[key] = value.trim();
        }
    });

    return filters;
}

function initializeDatasetViewController() {
    const hasId = new URLSearchParams(window.location.search).has("id");
    const listView = document.getElementById("datasetListView");
    const detailView = document.getElementById("datasetDetailView");

    if (!listView || !detailView) {
        return;
    }

    const addForm = document.getElementById("addForm");
    if (hasId && addForm && addForm.parentElement !== document.body) {
        document.body.appendChild(addForm);
    }

    listView.style.display = hasId ? "none" : "block";
    detailView.style.display = hasId ? "block" : "none";

    if (hasId) {
        registerDatasetTableNavigationGuard();
        bindDatasetViewEvents(detailView);

        if (detailView.dataset.loaded !== "true") {
            detailView.dataset.loaded = "true";
            return loadDataset();
        }
    }

    return Promise.resolve();
}

function bindDatasetViewEvents(detailView) {
    if (detailView.dataset.eventsBound === "true") {
        return;
    }

    detailView.dataset.eventsBound = "true";

    detailView.addEventListener("click", event => {
        const button = event.target.closest("#columnButton, #filterButton");
        if (!button) return;
        event.stopPropagation();

        const isFilterButton = button.id === "filterButton";
        document.getElementById("filterMenu")?.classList.toggle(
            "show",
            isFilterButton && !document.getElementById("filterMenu")?.classList.contains("show")
        );
        document.getElementById("columnMenu")?.classList.toggle(
            "show",
            !isFilterButton && !document.getElementById("columnMenu")?.classList.contains("show")
        );
    });

    document.getElementById("selectAllColumnsButton")
        ?.addEventListener("click", toggleAllColumns);

    document.getElementById("searchInput")
        ?.addEventListener("input", () => {
            currentPage = 1;
            applyFilters();
            renderTable();
        });

    document.getElementById("datasetFilterFields")
        ?.addEventListener("change", event => {
            const select = event.target.closest("select[data-column-index]");
            if (!select) return;
            datasetColumnFilters[select.dataset.columnIndex] = select.value;
            currentPage = 1;
            applyFilters();
            renderTable();
        });

    document.getElementById("addRowButton")
        ?.addEventListener("click", addRow);

    document.getElementById("cancelAddButton")
        ?.addEventListener("click", closeAddForm);

    document.getElementById("closeAddFormButton")
        ?.addEventListener("click", closeAddForm);

    document.getElementById("confirmAddButton")
        ?.addEventListener("click", confirmAddRow);

    document.getElementById("deleteRowButton")
        ?.addEventListener("click", toggleDeleteMode);

    document.getElementById("bulkDeleteButton")
        ?.addEventListener("click", openDeleteConfirmation);

    document.getElementById("cancelDeleteButton")
        ?.addEventListener("click", closeDeleteConfirmation);

    document.getElementById("confirmDeleteButton")
        ?.addEventListener("click", deleteSelectedRows);

    document.getElementById("saveChangesButton")
        ?.addEventListener("click", saveDataset);

    document.getElementById("exportDatasetButton")
        ?.addEventListener("click", exportDatasetToExcel);

    document.getElementById("undoButton")
        ?.addEventListener("click", undo);

    document.getElementById("redoButton")
        ?.addEventListener("click", redo);

    document.getElementById("firstPage")
        ?.addEventListener("click", () => goToPage(1));

    document.getElementById("previousPage")
        ?.addEventListener("click", previousPage);

    document.getElementById("nextPage")
        ?.addEventListener("click", nextPage);

    document.getElementById("lastPage")
        ?.addEventListener("click", goToLastPage);

    document.getElementById("addForm")
        ?.addEventListener("mousedown", event => {
            if (event.target.id === "addForm") {
                closeAddForm();
            }
        });

    document.addEventListener("keydown", event => {
        if (
            event.key === "Escape" &&
            document.getElementById("addForm")?.classList.contains("show")
        ) {
            closeAddForm();
        }
    });

    document.getElementById("deleteConfirm")
        ?.addEventListener("mousedown", event => {
            if (event.target.id === "deleteConfirm") {
                closeDeleteConfirmation();
            }
        });
}

document.addEventListener("DOMContentLoaded", () => {
    window.registerAppPageLoadTask(initializeDatasetViewController());
});
document.addEventListener("app:page-loaded", () => {
    const pathname = typeof window.appPathname === "function"
        ? window.appPathname(window.location.pathname)
        : window.location.pathname;
    const isDatasetDetail = pathname === "/set-data" &&
        new URLSearchParams(window.location.search).has("id");
    if (isDatasetDetail) {
        window.registerAppPageLoadTask(initializeDatasetViewController());
        return;
    }
    closeAddForm();
    const addForm = document.getElementById("addForm");
    if (addForm?.parentElement === document.body) addForm.remove();
    window.registerAppPageLoadTask(initializeDatasetViewController());
});

})();
