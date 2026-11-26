(() => {
    const views = {
        recipients: {
            path: "/penerima-bantuan",
            panelId: "recipientParticipantRecipients",
            label: "penerima",
            title: "Penerima Bantuan",
            titleDescription: "Senarai penerima bantuan.",
            heading: "Carian Penerima Bantuan",
            description: "Cari rekod penerima dan tapis mengikut maklumat.",
            addButtonId: "recipientAddButton",
            exportButtonId: "recipientExportButton",
            uploadButtonId: "recipientUploadButton"
        },
        participants: {
            path: "/peserta-program",
            panelId: "recipientParticipantParticipants",
            label: "peserta",
            title: "Peserta Program",
            titleDescription: "Senarai peserta dan program yang disertai.",
            heading: "Carian Peserta Program",
            description: "Cari rekod peserta dan tapis mengikut program.",
            addButtonId: "participantAddButton",
            exportButtonId: "participantExportButton",
            uploadButtonId: "participantUploadButton"
        },
        usahawan10k: {
            panelId: "recipientParticipantUsahawan10k",
            label: "Usahawan 10K",
            title: "Usahawan 10K",
            titleDescription: "Senarai usahawan 10K."
        }
    };
    const titleActionsByView = {};
    const entranceTimers = new WeakMap();
    const usahawan10kPageSize = 100;
    const usahawan10kColumnWidths = [45, ...Array(8).fill(160), 52.5];
    const usahawan10kColumns = [
        ["nama", "Nama"],
        ["kadPengenalan", "Kad Pengenalan"],
        ["telefon", "Telefon"],
        ["lokasi", "Lokasi"],
        ["produk", "Produk"],
        ["tarikhSesi", "Tarikh Sesi"],
        ["status", "Status"],
        ["catatan", "Catatan"]
    ];
    let usahawan10kRecords = [];
    let usahawan10kDatasets = [];
    let usahawan10kPage = 1;
    let usahawan10kVisibleColumns = usahawan10kColumns.map(() => true);
    let usahawan10kFilters = {};
    let usahawan10kFilteredRecords = [];
    let usahawan10kSortColumn = -1;
    let usahawan10kSortDirection = "asc";
    let usahawan10kPendingChanges = new Map();
    let usahawan10kEditing = null;
    let usahawan10kSuggestionState = null;
    let usahawan10kSelectedCell = null;
    let usahawan10kSelectionAnchor = null;
    let usahawan10kSelectionRange = null;
    let usahawan10kMouseSelecting = false;
    let usahawan10kPendingDeleteRecord = null;
    let usahawan10kUndoStack = [];
    let usahawan10kRedoStack = [];
    let usahawan10kSavingChanges = false;
    let usahawan10kSaveBadgeTimer = null;
    let usahawan10kSavedValues = new WeakMap();
    let usahawan10kPreviousHooks = null;
    let usahawan10kUnsavedHook = null;
    let usahawan10kSavingHook = null;
    let usahawan10kResetHook = null;

    function activateUsahawan10kUnsavedHooks() {
        if (window.hasUnsavedTableChanges === usahawan10kUnsavedHook) return;
        usahawan10kPreviousHooks = {
            hasUnsaved: window.hasUnsavedTableChanges,
            isSaving: window.isSavingTableChanges,
            reset: window.resetTableState
        };
        usahawan10kUnsavedHook = () =>
            Boolean(usahawan10kPreviousHooks.hasUnsaved?.()) ||
            usahawan10kPendingChanges.size > 0 ||
            Boolean(usahawan10kEditing &&
                usahawan10kEditing.cell.querySelector(".inline-edit-input")?.value !== usahawan10kEditing.oldValue);
        usahawan10kSavingHook = () =>
            Boolean(usahawan10kPreviousHooks.isSaving?.()) || usahawan10kSavingChanges;
        usahawan10kResetHook = () => {
            usahawan10kPreviousHooks.reset?.();
            usahawan10kPendingChanges.clear();
            clearUsahawan10kSelection();
        };
        window.hasUnsavedTableChanges = usahawan10kUnsavedHook;
        window.isSavingTableChanges = usahawan10kSavingHook;
        window.resetTableState = usahawan10kResetHook;
    }

    function deactivateUsahawan10kUnsavedHooks() {
        if (window.hasUnsavedTableChanges === usahawan10kUnsavedHook && usahawan10kPreviousHooks) {
            window.hasUnsavedTableChanges = usahawan10kPreviousHooks.hasUnsaved;
            window.isSavingTableChanges = usahawan10kPreviousHooks.isSaving;
            window.resetTableState = usahawan10kPreviousHooks.reset;
        }
        usahawan10kPreviousHooks = null;
        usahawan10kUnsavedHook = null;
        usahawan10kSavingHook = null;
        usahawan10kResetHook = null;
    }

    function animateBpaElement(element, className, delay = 0, duration = 750) {
        const previousAnimation = entranceTimers.get(element);
        if (previousAnimation) {
            window.clearTimeout(previousAnimation.timer);
            element.removeEventListener("animationend", previousAnimation.finish);
        }

        element.classList.remove(className);
        if (delay) {
            element.style.setProperty("--bpa-dashboard-toolbar-enter-delay", `${delay}ms`);
        }
        void element.offsetWidth;
        element.classList.add(className);

        const cleanup = () => {
            element.classList.remove(className);
            element.style.removeProperty("--bpa-dashboard-toolbar-enter-delay");
            window.clearTimeout(animation.timer);
            element.removeEventListener("animationend", animation.finish);
            entranceTimers.delete(element);
        };
        const animation = {
            timer: window.setTimeout(cleanup, delay + duration + 100),
            finish: event => {
                if (event.target === element && event.animationName === "recipient-participant-bpa-fade-in-up") {
                    cleanup();
                }
            }
        };
        entranceTimers.set(element, animation);

        element.addEventListener("animationend", animation.finish);
    }

    function animateViewTransition(key) {
        const panel = document.getElementById(views[key].panelId);
        const root = document.querySelector(".recipient-participant-shell");
        if (!panel || !root) return;

        const title = root.querySelector(".recipient-participant-title-copy");
        const searchText = panel.querySelector(".dataset-page-header > div:first-child");
        const searchInput = panel.querySelector(".search-toolbar-group .search-box input");
        const tableCard = panel.querySelector(".recipient-table-card, .participant-table-card");

        if (title?.getClientRects().length) {
            animateBpaElement(title, "bpa-dashboard-title-enter", 0, 450);
        }
        [searchText, searchInput].forEach(element => {
            if (element?.getClientRects().length) {
                animateBpaElement(element, "bpa-dashboard-content-enter", 70);
            }
        });
        if (tableCard?.getClientRects().length) {
            animateBpaElement(tableCard, "bpa-dashboard-content-enter", 140);
        }
    }

    function isViewSelected(key) {
        return Boolean(document.querySelector(
            `[data-recipient-participant-view="${key}"][aria-pressed="true"]`
        ));
    }

    function preloadViewAfterPageReady(key) {
        const preload = () => window.requestAnimationFrame(() => {
            void loadView(key);
        });
        if (!document.body.classList.contains("app-page-loading")) {
            preload();
            return;
        }

        const observer = new MutationObserver(() => {
            if (document.body.classList.contains("app-page-loading")) return;
            observer.disconnect();
            preload();
        });
        observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    }

    function styleTitleAction(button, label, icon, variant, text) {
        button.className = `recipient-participant-title-action recipient-participant-title-action--${variant}`;
        button.title = label;
        button.setAttribute("aria-label", label);
        button.innerHTML = `
            <span class="recipient-participant-title-action-icon" aria-hidden="true">
                <i class="bi ${icon}"></i>
            </span>
            <span>${text}</span>
        `;
    }

    function updateTitle(key) {
        const view = views[key];
        document.getElementById("recipientParticipantPageTitle").textContent = view.title;
        document.getElementById("recipientParticipantPageDescription").textContent = view.titleDescription;
    }

    function showTitleActions(key) {
        const selectedView = document.querySelector(
            `[data-recipient-participant-view="${key}"][aria-pressed="true"]`
        );
        if (!selectedView) return;
        const actions = document.getElementById("recipientParticipantTitleActions");
        actions.replaceChildren(...(titleActionsByView[key] || []));
    }

    async function loadView(key) {
        if (key === "usahawan10k") {
            return loadUsahawan10k();
        }
        const view = views[key];
        const panel = document.getElementById(view.panelId);
        if (!panel || panel.dataset.loaded === "true" || panel.dataset.loading === "true") return;

        panel.dataset.loading = "true";
        const status = panel.querySelector("[data-view-status]");
        if (status) {
            status.classList.remove("recipient-participant-load-error");
            status.textContent = `Memuatkan senarai ${view.label}...`;
        }

        try {
            const response = await fetch(view.path, {
                headers: { "X-App-Fragment": "true" }
            });
            if (!response.ok) throw new Error(`Halaman ${view.label} gagal dimuatkan (HTTP ${response.status}).`);

            const documentPage = new DOMParser().parseFromString(await response.text(), "text/html");
            const main = documentPage.querySelector("main.main-content");
            if (!main) throw new Error(`Kandungan halaman ${view.label} tidak ditemui.`);
            const heading = main.querySelector(".dataset-page-header > div:first-child h4");
            const description = main.querySelector(".dataset-page-header > div:first-child p");
            if (!heading || !description) throw new Error(`Tajuk carian halaman ${view.label} tidak ditemui.`);
            heading.textContent = view.heading;
            description.textContent = view.description;

            panel.innerHTML = main.innerHTML;
            const addButton = panel.querySelector(`#${view.addButtonId}`);
            const exportButton = panel.querySelector(`#${view.exportButtonId}`);
            const uploadButton = panel.querySelector(`#${view.uploadButtonId}`);
            if (!addButton || !exportButton || !uploadButton) {
                throw new Error(`Tindakan halaman ${view.label} tidak ditemui.`);
            }
            styleTitleAction(exportButton, "Muat turun Excel", "bi-file-earmark-spreadsheet", "excel", "Excel");
            styleTitleAction(uploadButton, "Muat Naik & Set Data", "bi-cloud-arrow-up", "upload", "Muat Naik");
            styleTitleAction(addButton, "Tambah Rekod", "bi-plus-lg", "add", "Tambah");
            titleActionsByView[key] = [addButton, exportButton, uploadButton];
            showTitleActions(key);
            panel.dataset.loaded = "true";
            delete panel.dataset.loading;
            document.dispatchEvent(new Event("app:page-loaded"));
            const root = document.querySelector(".recipient-participant-shell");
            if (isViewSelected(key) && root?.dataset.transitionTo === key) {
                animateViewTransition(key);
                delete root.dataset.transitionTo;
            }
        } catch (error) {
            delete panel.dataset.loading;
            console.error("Combined recipient/participant page load error:", error);
            const message = panel.querySelector("[data-view-status]");
            if (message) {
                message.textContent = `Gagal memuatkan senarai ${view.label}. Pilih kad ini untuk cuba semula.`;
                message.classList.add("recipient-participant-load-error");
            }
        }
    }

    async function loadUsahawan10k() {
        const panel = document.getElementById(views.usahawan10k.panelId);
        if (!panel || panel.dataset.loaded === "true" || panel.dataset.loading === "true") return;

        panel.dataset.loading = "true";
        usahawan10kPage = 1;
        usahawan10kVisibleColumns = usahawan10kColumns.map(() => true);
        usahawan10kFilters = {};
        usahawan10kSortColumn = -1;
        usahawan10kSortDirection = "asc";
        usahawan10kPendingChanges.clear();
        usahawan10kEditing = null;
        usahawan10kSelectedCell = null;
        usahawan10kSelectionAnchor = null;
        usahawan10kSelectionRange = null;
        usahawan10kUndoStack = [];
        usahawan10kRedoStack = [];
        const loading = document.getElementById("usahawan10kLoading");
        const error = document.getElementById("usahawan10kError");
        const empty = document.getElementById("usahawan10kEmpty");
        const table = document.getElementById("usahawan10kTableWrapper");
        if (loading) loading.hidden = false;
        if (error) error.hidden = true;
        if (empty) empty.hidden = true;
        if (table) table.hidden = true;

        try {
            const actionContainer = panel.querySelector(".usahawan10k-title-actions");
            const addButton = actionContainer?.querySelector("#usahawan10kAddButton");
            const exportButton = actionContainer?.querySelector("#usahawan10kExportButton");
            const uploadButton = actionContainer?.querySelector("#usahawan10kUploadButton");
            if (!addButton || !exportButton || !uploadButton) {
                throw new Error("Tindakan halaman Usahawan 10K tidak ditemui.");
            }
            styleTitleAction(addButton, "Tambah Rekod", "bi-plus-lg", "add", "Tambah");
            styleTitleAction(exportButton, "Muat turun Excel", "bi-file-earmark-spreadsheet", "excel", "Excel");
            styleTitleAction(uploadButton, "Muat Naik & Set Data", "bi-cloud-arrow-up", "upload", "Muat Naik");
            titleActionsByView.usahawan10k = [addButton, exportButton, uploadButton];
            actionContainer.remove();
            showTitleActions("usahawan10k");

            await refreshUsahawan10kRecords();
            await loadUsahawan10kDatasets();
            panel.dataset.loaded = "true";
            delete panel.dataset.loading;
            if (loading) loading.hidden = true;
            buildUsahawan10kColumnMenu();
            buildUsahawan10kFilterMenu();
            applyUsahawan10kFilters();
            if (isViewSelected("usahawan10k")) activateUsahawan10kUnsavedHooks();
            const root = document.querySelector(".recipient-participant-shell");
            if (isViewSelected("usahawan10k") && root?.dataset.transitionTo === "usahawan10k") {
                animateViewTransition("usahawan10k");
                delete root.dataset.transitionTo;
            }
        } catch (loadError) {
            delete panel.dataset.loading;
            console.error("Usahawan 10K page load error:", loadError);
            if (loading) loading.hidden = true;
            if (error) error.hidden = false;
        }
    }

    async function refreshUsahawan10kRecords() {
        const response = await fetch("/api/usahawan-10k");
        const result = await response.json();
        if (!response.ok || result.success === false) {
            throw new Error(result.error || `Senarai Usahawan 10K gagal dimuatkan (HTTP ${response.status}).`);
        }
        usahawan10kRecords = Array.isArray(result.records) ? result.records : [];
        usahawan10kDatasets = Array.isArray(result.datasets) ? result.datasets : [];
        usahawan10kSavedValues = new WeakMap();
        usahawan10kRecords.forEach(record => usahawan10kSavedValues.set(record, { ...record }));
    }

    async function loadUsahawan10kDatasets() {
        const select = document.getElementById("usahawan10kAddDataset");
        if (!select) return;
        select.replaceChildren();
        usahawan10kDatasets.forEach(dataset => {
            const option = document.createElement("option");
            option.value = dataset.id;
            option.textContent = dataset.name || dataset.filename;
            select.appendChild(option);
        });
        if (!select.options.length) {
            const option = document.createElement("option");
            option.value = "";
            option.textContent = "Tiada fail Usahawan 10K";
            select.appendChild(option);
        }
    }

    function buildUsahawan10kColumnMenu() {
        const checklist = document.getElementById("usahawan10kColumnChecklist");
        if (!checklist) return;
        checklist.replaceChildren();
        usahawan10kColumns.forEach(([key, label], index) => {
            const item = document.createElement("label");
            item.className = "column-checkbox";
            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.checked = usahawan10kVisibleColumns[index];
            checkbox.addEventListener("change", () => {
                usahawan10kVisibleColumns[index] = checkbox.checked;
                renderUsahawan10kTable();
            });
            const text = document.createElement("span");
            text.textContent = label;
            item.append(checkbox, text);
            checklist.appendChild(item);
        });
    }

    function buildUsahawan10kFilterMenu() {
        const menu = document.getElementById("usahawan10kFilterMenu");
        if (!menu) return;
        menu.replaceChildren();
        const title = document.createElement("div");
        title.className = "filter-title";
        title.textContent = "Tapis";
        menu.appendChild(title);
        usahawan10kColumns.forEach(([key, label]) => {
            const values = new Map();
            let hasEmpty = false;
            usahawan10kRecords.forEach(record => {
                const value = String(record[key] ?? "").trim();
                if (!value) hasEmpty = true;
                else values.set(value, (values.get(value) || 0) + 1);
            });
            const options = [...values].filter(([, count]) => count > 1)
                .map(([value]) => value).sort((left, right) => left.localeCompare(right));
            if (!hasEmpty && !options.length) return;
            const field = document.createElement("div");
            field.className = "filter-field";
            const fieldLabel = document.createElement("label");
            fieldLabel.textContent = label;
            const select = document.createElement("select");
            const all = document.createElement("option");
            all.value = "";
            all.textContent = "Semua";
            select.appendChild(all);
            if (hasEmpty) {
                const empty = document.createElement("option");
                empty.value = "__EMPTY__";
                empty.textContent = "Kosong";
                select.appendChild(empty);
            }
            options.forEach(value => {
                const option = document.createElement("option");
                option.value = value;
                option.textContent = value;
                select.appendChild(option);
            });
            select.value = usahawan10kFilters[key] || "";
            select.addEventListener("change", () => {
                usahawan10kFilters[key] = select.value;
                usahawan10kPage = 1;
                clearUsahawan10kSelection();
                applyUsahawan10kFilters();
            });
            field.append(fieldLabel, select);
            menu.appendChild(field);
        });
    }

    function getFilteredUsahawan10kRecords() {
        const query = String(document.getElementById("usahawan10kSearch")?.value || "")
            .trim()
            .toLocaleLowerCase();
        const filtered = usahawan10kRecords.filter(record =>
            usahawan10kColumns.every(([key]) => {
                const filter = usahawan10kFilters[key] || "";
                const value = String(record[key] ?? "").trim();
                return !filter || (filter === "__EMPTY__" ? !value : value === filter);
            }) &&
            (!query || usahawan10kColumns.some(([key]) =>
                String(record[key] ?? "").toLocaleLowerCase().includes(query)
            ))
        );
        if (usahawan10kSortColumn >= 0) {
            const key = usahawan10kColumns[usahawan10kSortColumn][0];
            filtered.sort((left, right) => {
                const result = String(left[key] ?? "").localeCompare(String(right[key] ?? ""), undefined, {
                    numeric: true,
                    sensitivity: "base"
                });
                return usahawan10kSortDirection === "asc" ? result : -result;
            });
        }
        return filtered;
    }

    function applyUsahawan10kFilters() {
        usahawan10kFilteredRecords = getFilteredUsahawan10kRecords();
        usahawan10kPage = Math.min(usahawan10kPage,
            Math.max(1, Math.ceil(usahawan10kFilteredRecords.length / usahawan10kPageSize)));
        renderUsahawan10kTable();
    }

    function clearUsahawan10kSelection() {
        usahawan10kSelectedCell = null;
        usahawan10kSelectionAnchor = null;
        usahawan10kSelectionRange = null;
        updateUsahawan10kSelection();
    }

    function beginUsahawan10kCellSelection(event, cell) {
        if (event.button !== 0 || event.target.closest(".inline-edit-input")) return;
        event.preventDefault();
        const position = {
            displayIndex: Number(cell.dataset.displayIndex),
            columnIndex: Number(cell.dataset.columnIndex)
        };
        if (!event.shiftKey || !usahawan10kSelectionAnchor) {
            usahawan10kSelectionAnchor = position;
        }
        usahawan10kSelectedCell = position;
        usahawan10kSelectionRange = {
            ...usahawan10kSelectionAnchor,
            endDisplayIndex: position.displayIndex,
            endColumnIndex: position.columnIndex
        };
        usahawan10kMouseSelecting = true;
        cell.focus();
        updateUsahawan10kSelection();
    }

    function selectUsahawan10kRange(displayIndex, columnIndex) {
        if (!usahawan10kSelectionAnchor) return;
        usahawan10kSelectedCell = { displayIndex, columnIndex };
        usahawan10kSelectionRange = {
            ...usahawan10kSelectionAnchor,
            endDisplayIndex: displayIndex,
            endColumnIndex: columnIndex
        };
        updateUsahawan10kSelection();
    }

    function updateUsahawan10kSelection() {
        const body = document.getElementById("usahawan10kTableBody");
        if (!body) return;
        body.querySelectorAll(".selected-cell, .active-cell")
            .forEach(cell => cell.classList.remove("selected-cell", "active-cell"));
        const range = usahawan10kSelectionRange;
        if (range) {
            const minRow = Math.min(range.displayIndex, range.endDisplayIndex);
            const maxRow = Math.max(range.displayIndex, range.endDisplayIndex);
            const minColumn = Math.min(range.columnIndex, range.endColumnIndex);
            const maxColumn = Math.max(range.columnIndex, range.endColumnIndex);
            body.querySelectorAll(".excel-cell").forEach(cell => {
                const row = Number(cell.dataset.displayIndex);
                const column = Number(cell.dataset.columnIndex);
                if (row >= minRow && row <= maxRow && column >= minColumn && column <= maxColumn) {
                    cell.classList.add("selected-cell");
                }
                if (usahawan10kSelectedCell
                    && row === usahawan10kSelectedCell.displayIndex
                    && column === usahawan10kSelectedCell.columnIndex) {
                    cell.classList.add("active-cell");
                }
            });
        }
        const selected = [...body.querySelectorAll(".selected-cell")];
        const rowCount = new Set(selected.map(cell => cell.dataset.displayIndex)).size;
        const columnCount = new Set(selected.map(cell => cell.dataset.columnIndex)).size;
        const info = document.getElementById("usahawan10kSelectionInfo");
        if (info) info.textContent = `${rowCount} baris, ${columnCount} lajur, ${selected.length} sel dipilih`;
    }

    function clearUsahawan10kSelectionOnOutsideClick(event) {
        const body = document.getElementById("usahawan10kTableBody");
        if (body?.closest("table")?.contains(event.target)) return;
        clearUsahawan10kSelection();
    }

    function selectedUsahawan10kCells() {
        const range = usahawan10kSelectionRange;
        if (!range) return [];
        const minRow = Math.min(range.displayIndex, range.endDisplayIndex);
        const maxRow = Math.max(range.displayIndex, range.endDisplayIndex);
        const minColumn = Math.min(range.columnIndex, range.endColumnIndex);
        const maxColumn = Math.max(range.columnIndex, range.endColumnIndex);
        const selected = [];
        for (let displayIndex = minRow; displayIndex <= maxRow; displayIndex++) {
            const record = usahawan10kFilteredRecords[displayIndex];
            if (!record) continue;
            for (let columnIndex = minColumn; columnIndex <= maxColumn; columnIndex++) {
                const field = usahawan10kColumns[columnIndex]?.[0];
                if (field) selected.push({ record, field, oldValue: String(record[field] ?? "") });
            }
        }
        return selected;
    }

    function updateUsahawan10kPendingChange(record, field, value) {
        if (isViewSelected("usahawan10k")) activateUsahawan10kUnsavedHooks();
        const baseline = usahawan10kSavedValues.get(record) || { ...record };
        const key = `${record.datasetId}:${record.rowIndex}`;
        let pending = usahawan10kPendingChanges.get(key);
        record[field] = value;
        if (String(value) === String(baseline[field] ?? "")) {
            if (pending) {
                delete pending.changes[field];
                delete pending.oldValues[field];
                if (!Object.keys(pending.changes).length) usahawan10kPendingChanges.delete(key);
            }
            return;
        }
        if (!pending) {
            pending = { record, changes: {}, oldValues: {} };
            usahawan10kPendingChanges.set(key, pending);
        }
        pending.changes[field] = String(value);
        pending.oldValues[field] = String(baseline[field] ?? "");
    }

    function pushUsahawan10kHistory(action) {
        usahawan10kUndoStack.push(action);
        usahawan10kRedoStack = [];
    }

    function replayUsahawan10kHistory(redo) {
        const source = redo ? usahawan10kRedoStack : usahawan10kUndoStack;
        const destination = redo ? usahawan10kUndoStack : usahawan10kRedoStack;
        const action = source.pop();
        if (!action) return;
        action.changes.forEach(change => {
            updateUsahawan10kPendingChange(
                change.record,
                change.field,
                redo ? change.newValue : change.oldValue
            );
        });
        destination.push(action);
        if (usahawan10kSortColumn >= 0) applyUsahawan10kFilters();
        else renderUsahawan10kTable();
    }

    function handleUsahawan10kCellKey(event, cell, record, field, columnIndex) {
        if (event.target !== cell && event.target.closest?.(".inline-edit-input")) {
            event.stopPropagation();
            return;
        }
        if (event.key === "F2") {
            event.preventDefault();
            startUsahawan10kEditing(cell, record, field);
        } else if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
            event.preventDefault();
            moveUsahawan10kCell(cell, event.key);
        } else if (event.key === "Tab") {
            event.preventDefault();
            moveUsahawan10kCell(cell, "ArrowRight", event.shiftKey);
        } else if (event.key === "Enter") {
            event.preventDefault();
            moveUsahawan10kCell(cell, event.shiftKey ? "ArrowUp" : "ArrowDown");
        } else if (event.key === "Delete" || event.key === "Backspace") {
            event.preventDefault();
            clearUsahawan10kSelection();
            usahawan10kSelectedCell = {
                displayIndex: Number(cell.dataset.displayIndex),
                columnIndex
            };
            usahawan10kSelectionAnchor = usahawan10kSelectedCell;
            usahawan10kSelectionRange = {
                ...usahawan10kSelectedCell,
                endDisplayIndex: usahawan10kSelectedCell.displayIndex,
                endColumnIndex: columnIndex
            };
            clearUsahawan10kSelectionValues();
        } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
            event.preventDefault();
            startUsahawan10kEditing(cell, record, field, event.key);
        }
    }

    function moveUsahawan10kCell(cell, direction, reverse = false) {
        const displayIndex = Number(cell.dataset.displayIndex);
        const columnIndex = Number(cell.dataset.columnIndex);
        const visible = usahawan10kColumns
            .map((_, index) => index)
            .filter(index => usahawan10kVisibleColumns[index]);
        let targetRow = displayIndex;
        let targetColumnPosition = visible.indexOf(columnIndex);
        if (direction === "ArrowUp" || direction === "ArrowDown") {
            targetRow += direction === "ArrowUp" ? -1 : 1;
        } else {
            targetColumnPosition += reverse ? -1 : 1;
            if (targetColumnPosition < 0) {
                targetRow--;
                targetColumnPosition = visible.length - 1;
            } else if (targetColumnPosition >= visible.length) {
                targetRow++;
                targetColumnPosition = 0;
            }
        }
        if (targetRow < 0 || targetRow >= usahawan10kFilteredRecords.length || targetColumnPosition < 0) return;
        usahawan10kPage = Math.floor(targetRow / usahawan10kPageSize) + 1;
        const targetColumn = visible[targetColumnPosition];
        usahawan10kSelectedCell = { displayIndex: targetRow, columnIndex: targetColumn };
        usahawan10kSelectionAnchor = usahawan10kSelectedCell;
        usahawan10kSelectionRange = {
            ...usahawan10kSelectedCell,
            endDisplayIndex: targetRow,
            endColumnIndex: targetColumn
        };
        renderUsahawan10kTable();
        document.querySelector(
            `#usahawan10kTableBody .excel-cell[data-display-index="${targetRow}"][data-column-index="${targetColumn}"]`
        )?.focus();
    }

    function clearUsahawan10kSelectionValues() {
        const changes = selectedUsahawan10kCells()
            .filter(change => change.oldValue !== "")
            .map(change => ({ ...change, newValue: "" }));
        if (!changes.length) return;
        changes.forEach(change =>
            updateUsahawan10kPendingChange(change.record, change.field, change.newValue));
        pushUsahawan10kHistory({ type: "changes", changes });
        if (usahawan10kSortColumn >= 0) applyUsahawan10kFilters();
        else renderUsahawan10kTable();
    }

    function copyUsahawan10kSelection(event) {
        if (!isViewSelected("usahawan10k")) return;
        if (event.target.matches?.("input, textarea, select, [contenteditable='true']")) return;
        const range = usahawan10kSelectionRange;
        if (!range) return;
        const minRow = Math.min(range.displayIndex, range.endDisplayIndex);
        const maxRow = Math.max(range.displayIndex, range.endDisplayIndex);
        const minColumn = Math.min(range.columnIndex, range.endColumnIndex);
        const maxColumn = Math.max(range.columnIndex, range.endColumnIndex);
        const text = [];
        for (let rowIndex = minRow; rowIndex <= maxRow; rowIndex++) {
            const record = usahawan10kFilteredRecords[rowIndex];
            const line = [];
            for (let columnIndex = minColumn; columnIndex <= maxColumn; columnIndex++) {
                const field = usahawan10kColumns[columnIndex]?.[0];
                line.push(record && field ? String(record[field] ?? "") : "");
            }
            text.push(line.join("\t"));
        }
        event.clipboardData.setData("text/plain", text.join("\r\n"));
        event.preventDefault();
        event.stopImmediatePropagation();
    }

    function cutUsahawan10kSelection(event) {
        copyUsahawan10kSelection(event);
        if (event.defaultPrevented) clearUsahawan10kSelectionValues();
    }

    function pasteUsahawan10kSelection(event) {
        if (!isViewSelected("usahawan10k")) return;
        if (event.target.matches?.("input, textarea, select, [contenteditable='true']")) return;
        const text = event.clipboardData?.getData("text/plain");
        if (!text || !usahawan10kSelectionAnchor) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        const matrix = text.replace(/\r/g, "").split("\n").filter(Boolean).map(line => line.split("\t"));
        const changes = [];
        matrix.forEach((line, rowOffset) => line.forEach((value, columnOffset) => {
            const record = usahawan10kFilteredRecords[usahawan10kSelectionAnchor.displayIndex + rowOffset];
            const field = usahawan10kColumns[usahawan10kSelectionAnchor.columnIndex + columnOffset]?.[0];
            if (!record || !field) return;
            const oldValue = String(record[field] ?? "");
            if (oldValue !== value) changes.push({ record, field, oldValue, newValue: value });
        }));
        if (!changes.length) return;
        changes.forEach(change =>
            updateUsahawan10kPendingChange(change.record, change.field, change.newValue));
        pushUsahawan10kHistory({ type: "changes", changes });
        if (usahawan10kSortColumn >= 0) applyUsahawan10kFilters();
        else renderUsahawan10kTable();
    }

    function handleUsahawan10kKeyboard(event) {
        if (!isViewSelected("usahawan10k")) return;
        const form = document.getElementById("usahawan10kAddForm");
        const confirmation = document.getElementById("usahawan10kDeleteConfirmation");
        if (event.key === "Escape" && form?.open) {
            event.preventDefault();
            event.stopImmediatePropagation();
            closeUsahawan10kAddForm();
            return;
        }
        if (event.key === "Escape" && confirmation?.classList.contains("show")) {
            event.preventDefault();
            event.stopImmediatePropagation();
            closeUsahawan10kDeleteConfirmation();
            return;
        }
        if (usahawan10kEditing) return;
        const typing = event.target.matches?.("input, textarea, select, button, [contenteditable='true']");
        const modifier = event.ctrlKey || event.metaKey;
        if (modifier && event.key.toLowerCase() === "s") {
            event.preventDefault();
            event.stopImmediatePropagation();
            saveUsahawan10kChanges();
        } else if (!typing && modifier && event.key.toLowerCase() === "z") {
            event.preventDefault();
            event.stopImmediatePropagation();
            replayUsahawan10kHistory(event.shiftKey);
        } else if (!typing && modifier && event.key.toLowerCase() === "y") {
            event.preventDefault();
            event.stopImmediatePropagation();
            replayUsahawan10kHistory(true);
        } else if (!typing && (event.key === "Delete" || event.key === "Backspace")) {
            event.preventDefault();
            event.stopImmediatePropagation();
            clearUsahawan10kSelectionValues();
        }
    }

    function applyUsahawan10kWidth(element, index) {
        if (index === 0) {
            element.style.width = "45px";
            element.style.minWidth = "45px";
            element.style.maxWidth = "45px";
            return;
        }
        const width = `${usahawan10kColumnWidths[index] || 160}px`;
        element.style.width = width;
        element.style.minWidth = width;
        element.style.maxWidth = "none";
    }

    function beginUsahawan10kResize(event, columnIndex) {
        event.preventDefault();
        event.stopPropagation();
        const widthIndex = columnIndex + 1;
        const startX = event.clientX;
        const initialWidth = usahawan10kColumnWidths[widthIndex];
        const move = moveEvent => {
            const width = Math.max(80, Math.min(600, initialWidth + moveEvent.clientX - startX));
            usahawan10kColumnWidths[widthIndex] = width;
            document.querySelectorAll(`#usahawan10kTableWrapper [data-resize-column="${columnIndex}"]`)
                .forEach(element => applyUsahawan10kWidth(element, widthIndex));
        };
        const stop = () => {
            document.body.classList.remove("resizing-column");
            document.removeEventListener("mousemove", move);
            document.removeEventListener("mouseup", stop);
        };
        document.body.classList.add("resizing-column");
        document.addEventListener("mousemove", move);
        document.addEventListener("mouseup", stop);
    }

    function renderUsahawan10kTable() {
        const filteredRecords = usahawan10kFilteredRecords;
        const pageCount = Math.max(1, Math.ceil(filteredRecords.length / usahawan10kPageSize));
        usahawan10kPage = Math.min(usahawan10kPage, pageCount);
        const firstRecordIndex = filteredRecords.length
            ? (usahawan10kPage - 1) * usahawan10kPageSize
            : 0;
        const pageRecords = filteredRecords.slice(
            firstRecordIndex,
            firstRecordIndex + usahawan10kPageSize
        );
        const body = document.getElementById("usahawan10kTableBody");
        const wrapper = document.getElementById("usahawan10kTableWrapper");
        const empty = document.getElementById("usahawan10kEmpty");
        const noResults = document.getElementById("usahawan10kNoResults");
        const count = document.getElementById("usahawan10kRecordCount");
        const pagination = document.getElementById("usahawan10kPagination");
        const hasRecords = usahawan10kRecords.length > 0;

        if (!body) return;
        const header = document.getElementById("usahawan10kTableHeader");
        if (header) {
            header.replaceChildren();
            const actionHeader = document.createElement("th");
            const actionContent = document.createElement("span");
            actionContent.className = "header-content";
            const actionLabel = document.createElement("span");
            actionLabel.className = "header-label";
            actionContent.appendChild(actionLabel);
            actionHeader.appendChild(actionContent);
            applyUsahawan10kWidth(actionHeader, 0);
            header.appendChild(actionHeader);
            usahawan10kColumns.forEach(([, label], columnIndex) => {
                if (!usahawan10kVisibleColumns[columnIndex]) return;
                const cell = document.createElement("th");
                cell.dataset.columnIndex = String(columnIndex);
                cell.dataset.resizeColumn = String(columnIndex);
                cell.classList.add("sortable");
                cell.setAttribute("aria-sort", usahawan10kSortColumn === columnIndex ? usahawan10kSortDirection : "none");
                const content = document.createElement("span");
                content.className = "header-content";
                const heading = document.createElement("span");
                heading.className = "header-label";
                heading.textContent = label.toLocaleUpperCase();
                const sortIcon = document.createElement("span");
                sortIcon.className = "sort-icon";
                sortIcon.textContent = usahawan10kSortColumn === columnIndex
                    ? (usahawan10kSortDirection === "asc" ? "▲" : "▼")
                    : "";
                content.append(heading, sortIcon);
                cell.appendChild(content);
                cell.addEventListener("click", event => {
                    if (event.target.closest(".column-resize-handle")) return;
                    usahawan10kSortDirection = usahawan10kSortColumn === columnIndex && usahawan10kSortDirection === "asc"
                        ? "desc"
                        : "asc";
                    usahawan10kSortColumn = columnIndex;
                    usahawan10kSelectedCell = null;
                    usahawan10kSelectionAnchor = null;
                    usahawan10kSelectionRange = null;
                    applyUsahawan10kFilters();
                });
                const resizeHandle = document.createElement("span");
                resizeHandle.className = "column-resize-handle";
                resizeHandle.addEventListener("mousedown", event => beginUsahawan10kResize(event, columnIndex));
                cell.appendChild(resizeHandle);
                applyUsahawan10kWidth(cell, columnIndex + 1);
                header.appendChild(cell);
            });
            const deleteHeader = document.createElement("th");
            deleteHeader.className = "row-action-column";
            deleteHeader.setAttribute("aria-label", "Tindakan");
            applyUsahawan10kWidth(deleteHeader, usahawan10kColumns.length + 1);
            header.appendChild(deleteHeader);
        }
        body.replaceChildren(...pageRecords.map((record, index) => {
            const row = document.createElement("tr");
            const numberCell = document.createElement("td");
            numberCell.className = "row-select-cell";
            const recordIndex = usahawan10kRecords.indexOf(record);
            const displayIndex = firstRecordIndex + index;
            row.dataset.datasetId = String(record.datasetId ?? "");
            row.dataset.rowIndex = String(record.rowIndex ?? "");
            const rowNumber = document.createElement("span");
            rowNumber.className = "row-number";
            rowNumber.textContent = String(displayIndex + 1);
            numberCell.appendChild(rowNumber);
            applyUsahawan10kWidth(numberCell, 0);
            row.appendChild(numberCell);
            usahawan10kColumns.forEach(([field], columnIndex) => {
                if (!usahawan10kVisibleColumns[columnIndex]) return;
                const cell = document.createElement("td");
                cell.className = "excel-cell";
                cell.dataset.field = field;
                cell.dataset.rowIndex = String(recordIndex);
                cell.dataset.columnIndex = String(columnIndex);
                cell.dataset.displayIndex = String(displayIndex);
                cell.dataset.resizeColumn = String(columnIndex);
                cell.textContent = String(record[field] ?? "");
                cell.title = cell.textContent;
                cell.tabIndex = 0;
                cell.addEventListener("mousedown", event => beginUsahawan10kCellSelection(event, cell));
                cell.addEventListener("mouseenter", () => {
                    if (usahawan10kMouseSelecting) {
                        selectUsahawan10kRange(Number(cell.dataset.displayIndex), columnIndex);
                    }
                });
                cell.addEventListener("dblclick", () => startUsahawan10kEditing(cell, record, field));
                cell.addEventListener("keydown", event =>
                    handleUsahawan10kCellKey(event, cell, record, field, columnIndex));
                applyUsahawan10kWidth(cell, columnIndex + 1);
                row.appendChild(cell);
            });
            const actionCell = document.createElement("td");
            actionCell.className = "row-action-cell";
            applyUsahawan10kWidth(actionCell, usahawan10kColumns.length + 1);
            if (typeof window.canEditAppPage === "function" && window.canEditAppPage("participants")) {
                const deleteButton = document.createElement("button");
                deleteButton.type = "button";
                deleteButton.className = "row-delete-button";
                deleteButton.dataset.action = "delete";
                deleteButton.setAttribute("aria-label", `Padam rekod ${record.nama || ""}`);
                deleteButton.title = "Padam rekod";
                deleteButton.innerHTML = '<i class="bi bi-trash3" aria-hidden="true"></i>';
                deleteButton.addEventListener("mousedown", event => event.stopPropagation());
                deleteButton.addEventListener("dblclick", event => event.stopPropagation());
                actionCell.appendChild(deleteButton);
            }
            row.appendChild(actionCell);
            return row;
        }));
        const table = body.closest("table");
        if (table) {
            table.style.width = "100%";
            table.style.tableLayout = "fixed";
        }
        updateUsahawan10kSelection();

        if (count) {
            count.textContent = `${filteredRecords.length.toLocaleString()} rekod`;
        }
        if (empty) empty.hidden = hasRecords;
        if (wrapper) wrapper.hidden = !filteredRecords.length;
        if (noResults) noResults.hidden = !hasRecords || filteredRecords.length > 0;
        if (pagination) pagination.hidden = false;
        const rangeEnd = Math.min(firstRecordIndex + usahawan10kPageSize, filteredRecords.length);
        const paginationInfo = document.getElementById("usahawan10kPaginationInfo");
        if (paginationInfo) {
            paginationInfo.textContent = filteredRecords.length
                ? `${firstRecordIndex + 1}-${rangeEnd} daripada ${filteredRecords.length} baris`
                : `0-0 daripada ${filteredRecords.length} baris`;
        }
        ["First", "Previous"].forEach(name => {
            const button = document.getElementById(`usahawan10k${name}Page`);
            if (button) button.disabled = usahawan10kPage === 1;
        });
        ["Next", "Last"].forEach(name => {
            const button = document.getElementById(`usahawan10k${name}Page`);
            if (button) button.disabled = usahawan10kPage === pageCount;
        });
        updateUsahawan10kSaveButton();
    }

    function showUsahawan10kError(error) {
        console.error("Usahawan 10K action failed:", error);
        window.alert(error.message || "Operasi Usahawan 10K gagal.");
    }

    async function usahawan10kApi(method, body) {
        const response = await fetch("/api/usahawan-10k/records", {
            method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || result.success === false) {
            throw new Error(result.error || "Operasi Usahawan 10K gagal.");
        }
        return result;
    }

    function updateUsahawan10kSaveButton() {
        const button = document.getElementById("usahawan10kSaveButton");
        if (!button) return;
        const hasChanges = usahawan10kPendingChanges.size > 0;
        button.disabled = !hasChanges || usahawan10kSavingChanges;
        button.classList.toggle("has-changes", hasChanges);
        button.classList.toggle("is-saving", usahawan10kSavingChanges);
        button.title = usahawan10kSavingChanges
            ? "Menyimpan..."
            : (hasChanges ? "Simpan perubahan" : "Disimpan");
        button.setAttribute("aria-label", button.title);
        button.innerHTML = usahawan10kSavingChanges
            ? '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>'
            : '<i class="bi bi-floppy" aria-hidden="true"></i>';
    }

    function closeUsahawan10kSuggestions() {
        if (!usahawan10kSuggestionState) return;
        const { input, popup, wrapper, hideOnScroll } = usahawan10kSuggestionState;
        input.removeEventListener("input", updateUsahawan10kSuggestions);
        wrapper?.removeEventListener("scroll", hideOnScroll);
        popup.remove();
        usahawan10kSuggestionState = null;
    }

    function openUsahawan10kSuggestions(cell, input) {
        const popup = document.createElement("div");
        popup.className = "recipient-cell-suggestions";
        popup.setAttribute("role", "listbox");
        const cellStyle = window.getComputedStyle(cell);
        popup.style.fontFamily = cellStyle.fontFamily;
        popup.style.fontSize = cellStyle.fontSize;
        popup.style.fontWeight = cellStyle.fontWeight;
        popup.style.lineHeight = cellStyle.lineHeight;
        popup.style.letterSpacing = cellStyle.letterSpacing;
        document.body.appendChild(popup);
        const wrapper = document.getElementById("usahawan10kTableWrapper");
        const hideOnScroll = () => { popup.style.display = "none"; };
        wrapper?.addEventListener("scroll", hideOnScroll, { passive: true });
        usahawan10kSuggestionState = {
            cell, input, popup, wrapper, hideOnScroll, options: [], activeIndex: -1
        };
        input.addEventListener("input", updateUsahawan10kSuggestions);
        updateUsahawan10kSuggestions();
    }

    function updateUsahawan10kSuggestions() {
        const state = usahawan10kSuggestionState;
        if (!state) return;
        const currentValue = state.input.value.trim();
        const query = currentValue.toLocaleLowerCase();
        const values = new Set(usahawan10kRecords.map(record => String(record.status ?? "").trim()).filter(Boolean));
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
                state.input.value = value;
                finishUsahawan10kEditing(true);
            });
            state.popup.appendChild(option);
        });
        const rect = state.cell.getBoundingClientRect();
        state.popup.style.display = state.options.length ? "block" : "none";
        state.popup.style.left = `${Math.max(0, Math.min(rect.left, window.innerWidth - rect.width))}px`;
        state.popup.style.top = `${rect.bottom}px`;
        state.popup.style.width = `${rect.width}px`;
    }

    function startUsahawan10kEditing(cell, record, field, initialCharacter = null) {
        if (typeof window.canEditAppPage !== "function" || !window.canEditAppPage("participants")) return;
        if (isViewSelected("usahawan10k")) activateUsahawan10kUnsavedHooks();
        if (usahawan10kEditing) return;
        const state = { cell, record, field, oldValue: String(record[field] ?? "") };
        usahawan10kEditing = state;
        cell.classList.remove("active-cell", "selected-cell");
        cell.classList.add("editing-cell");
        const input = document.createElement("input");
        input.type = "text";
        input.className = "inline-edit-input";
        input.value = initialCharacter ?? state.oldValue;
        cell.replaceChildren(input);
        if (field === "status") openUsahawan10kSuggestions(cell, input);
        input.focus();
        if (initialCharacter === null) input.select();
        else input.setSelectionRange(input.value.length, input.value.length);
        input.addEventListener("keydown", event => {
            const suggestions = usahawan10kSuggestionState;
            if (field === "status" && suggestions?.input === input && ["ArrowDown", "ArrowUp"].includes(event.key)) {
                event.preventDefault();
                event.stopPropagation();
                const direction = event.key === "ArrowDown" ? 1 : -1;
                suggestions.activeIndex = suggestions.activeIndex < 0
                    ? (direction > 0 ? 0 : suggestions.options.length - 1)
                    : (suggestions.activeIndex + direction + suggestions.options.length) % suggestions.options.length;
                suggestions.popup.querySelectorAll(".recipient-cell-suggestion").forEach((option, index) => {
                    const active = index === suggestions.activeIndex;
                    option.classList.toggle("active", active);
                    option.setAttribute("aria-selected", String(active));
                    if (active) option.scrollIntoView({ block: "nearest" });
                });
                return;
            }
            if (field === "status" && event.key === "Enter" && suggestions?.activeIndex >= 0) {
                event.preventDefault();
                event.stopPropagation();
                input.value = suggestions.options[suggestions.activeIndex];
                finishUsahawan10kEditing(true);
            } else if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                finishUsahawan10kEditing(false);
            } else if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.stopPropagation();
                finishUsahawan10kEditing(true).then(() => moveUsahawan10kCell(cell, "ArrowDown"));
            } else if (event.key === "Enter" && event.shiftKey) {
                event.preventDefault();
                event.stopPropagation();
                finishUsahawan10kEditing(true).then(() => moveUsahawan10kCell(cell, "ArrowUp"));
            } else if (event.key === "Tab") {
                event.preventDefault();
                event.stopPropagation();
                finishUsahawan10kEditing(true).then(() =>
                    moveUsahawan10kCell(cell, "ArrowRight", event.shiftKey));
            }
        });
        input.addEventListener("blur", () => finishUsahawan10kEditing(true));
    }

    async function finishUsahawan10kEditing(save) {
        const state = usahawan10kEditing;
        if (!state) return;
        closeUsahawan10kSuggestions();
        usahawan10kEditing = null;
        state.cell.classList.remove("editing-cell");
        const input = state.cell.querySelector(".inline-edit-input");
        const newValue = save ? String(input?.value ?? "").trim() : state.oldValue;
        state.record[state.field] = newValue;
        if (save && newValue !== state.oldValue) {
            updateUsahawan10kPendingChange(state.record, state.field, newValue);
            pushUsahawan10kHistory({
                type: "changes",
                changes: [{
                    record: state.record,
                    field: state.field,
                    oldValue: state.oldValue,
                    newValue
                }]
            });
        }
        const sortedFieldIndex = usahawan10kColumns.findIndex(([key]) => key === state.field);
        if (save && sortedFieldIndex === usahawan10kSortColumn) applyUsahawan10kFilters();
        else renderUsahawan10kTable();
    }

    async function saveUsahawan10kChanges() {
        if (usahawan10kEditing) await finishUsahawan10kEditing(true);
        if (!usahawan10kPendingChanges.size || usahawan10kSavingChanges) return;
        usahawan10kSavingChanges = true;
        updateUsahawan10kSaveButton();
        let savedAny = false;
        try {
            for (const [key, pending] of [...usahawan10kPendingChanges]) {
                await usahawan10kApi("PUT", {
                    record: {
                        datasetId: pending.record.datasetId,
                        rowIndex: pending.record.rowIndex
                    },
                    changes: pending.changes
                });
                const baseline = usahawan10kSavedValues.get(pending.record) || {};
                usahawan10kSavedValues.set(pending.record, { ...baseline, ...pending.changes });
                usahawan10kPendingChanges.delete(key);
                savedAny = true;
            }
        } catch (error) {
            showUsahawan10kError(error);
        } finally {
            usahawan10kSavingChanges = false;
            updateUsahawan10kSaveButton();
            buildUsahawan10kFilterMenu();
            applyUsahawan10kFilters();
            if (savedAny) showUsahawan10kSaveConfirmation();
        }
    }

    function showUsahawan10kSaveConfirmation() {
        const topbar = document.querySelector(".topbar");
        if (!topbar) return;
        let badge = document.querySelector(".save-success-badge");
        if (!badge) {
            badge = document.createElement("div");
            badge.className = "save-success-badge";
            badge.setAttribute("role", "status");
            badge.setAttribute("aria-live", "polite");
            badge.textContent = "Disimpan";
            document.body.appendChild(badge);
        }
        badge.style.top = `${topbar.getBoundingClientRect().bottom}px`;
        window.clearTimeout(usahawan10kSaveBadgeTimer);
        badge.classList.remove("is-visible");
        requestAnimationFrame(() => badge.classList.add("is-visible"));
        usahawan10kSaveBadgeTimer = window.setTimeout(() => badge.classList.remove("is-visible"), 1800);
    }

    function openUsahawan10kDeleteConfirmation(record) {
        usahawan10kPendingDeleteRecord = record;
        document.getElementById("usahawan10kDeleteMessage").textContent =
            `Adakah anda pasti mahu memadam rekod "${record.nama || record.kadPengenalan}"? Tindakan ini tidak boleh dibuat asal.`;
        document.getElementById("usahawan10kDeleteOverlay").classList.add("show");
        document.getElementById("usahawan10kDeleteOverlay").setAttribute("aria-hidden", "false");
        document.getElementById("usahawan10kDeleteConfirmation").classList.add("show");
        document.getElementById("usahawan10kDeleteConfirmation").setAttribute("aria-hidden", "false");
    }

    function closeUsahawan10kDeleteConfirmation() {
        document.getElementById("usahawan10kDeleteOverlay").classList.remove("show");
        document.getElementById("usahawan10kDeleteOverlay").setAttribute("aria-hidden", "true");
        document.getElementById("usahawan10kDeleteConfirmation").classList.remove("show");
        document.getElementById("usahawan10kDeleteConfirmation").setAttribute("aria-hidden", "true");
        usahawan10kPendingDeleteRecord = null;
    }

    async function confirmUsahawan10kDelete() {
        const record = usahawan10kPendingDeleteRecord;
        const button = document.getElementById("usahawan10kConfirmDelete");
        if (!record || usahawan10kSavingChanges) return;
        button.disabled = true;
        try {
            if (usahawan10kPendingChanges.size) await saveUsahawan10kChanges();
            if (usahawan10kPendingChanges.size) return;
            await usahawan10kApi("DELETE", {
                record: { datasetId: record.datasetId, rowIndex: record.rowIndex }
            });
            closeUsahawan10kDeleteConfirmation();
            clearUsahawan10kSelection();
            usahawan10kRecords = usahawan10kRecords.filter(item => item !== record);
            usahawan10kRecords.forEach(item => {
                if (item.datasetId === record.datasetId && item.rowIndex > record.rowIndex) item.rowIndex--;
            });
            buildUsahawan10kFilterMenu();
            applyUsahawan10kFilters();
        } catch (error) {
            showUsahawan10kError(error);
        } finally {
            button.disabled = false;
        }
    }

    function openUsahawan10kAddForm() {
        const form = document.getElementById("usahawan10kAddForm");
        if (!form || form.open) return;
        form.querySelectorAll("input, textarea").forEach(input => { input.value = ""; });
        form.showModal();
        document.getElementById("usahawan10kAddNama")?.focus();
    }

    function closeUsahawan10kAddForm() {
        closeUsahawan10kSuggestions();
        const form = document.getElementById("usahawan10kAddForm");
        if (form?.open && typeof window.closeBpaCreateDialog === "function") {
            window.closeBpaCreateDialog(form);
        } else if (form?.open) {
            form.close();
        }
    }

    async function addUsahawan10kRecord() {
        if (usahawan10kPendingChanges.size) {
            await saveUsahawan10kChanges();
            if (usahawan10kPendingChanges.size) return;
        }
        const value = id => String(document.getElementById(id)?.value ?? "").trim();
        const changes = {
            nama: value("usahawan10kAddNama"),
            kadPengenalan: value("usahawan10kAddKP"),
            telefon: value("usahawan10kAddTelefon"),
            lokasi: value("usahawan10kAddLokasi"),
            produk: value("usahawan10kAddProduk"),
            tarikhSesi: value("usahawan10kAddTarikhSesi"),
            status: value("usahawan10kAddStatus"),
            catatan: value("usahawan10kAddCatatan")
        };
        if (!changes.nama || !changes.kadPengenalan || !changes.telefon) {
            window.alert("Nama, Kad Pengenalan dan Telefon wajib diisi.");
            return;
        }
        const datasetId = Number(value("usahawan10kAddDataset"));
        if (!datasetId) {
            window.alert("Tiada fail sumber Usahawan 10K tersedia.");
            return;
        }
        const button = document.getElementById("usahawan10kConfirmAdd");
        if (button) button.disabled = true;
        try {
            await usahawan10kApi("POST", { datasetId, changes });
            closeUsahawan10kAddForm();
            await refreshUsahawan10kRecords();
            await loadUsahawan10kDatasets();
            buildUsahawan10kFilterMenu();
            usahawan10kPage = Math.max(1, Math.ceil(usahawan10kRecords.length / usahawan10kPageSize));
            applyUsahawan10kFilters();
        } catch (error) {
            showUsahawan10kError(error);
        } finally {
            if (button) button.disabled = false;
        }
    }

    function toggleUsahawan10kMenu(event, menuId, otherMenuId) {
        event.stopPropagation();
        const menu = document.getElementById(menuId);
        const otherMenu = document.getElementById(otherMenuId);
        otherMenu?.classList.remove("show");
        menu?.classList.toggle("show");
    }

    function closeUsahawan10kMenus(event) {
        ["usahawan10kColumnMenu", "usahawan10kFilterMenu"].forEach(id => {
            const menu = document.getElementById(id);
            if (menu && !menu.contains(event.target) &&
                !menu.previousElementSibling?.contains(event.target)) menu.classList.remove("show");
        });
    }

    function exportUsahawan10kToExcel() {
        try {
            if (!window.XLSX) throw new Error("Pustaka eksport Excel tidak tersedia.");
            const records = getFilteredUsahawan10kRecords();
            const exportColumns = usahawan10kColumns.filter((_, index) => usahawan10kVisibleColumns[index]);
            const worksheetData = [
                exportColumns.map(([, label]) => label),
                ...records.map(record =>
                    exportColumns.map(([field]) => String(record[field] ?? ""))
                )
            ];
            const worksheet = window.XLSX.utils.aoa_to_sheet(worksheetData);
            const workbook = window.XLSX.utils.book_new();
            window.XLSX.utils.book_append_sheet(workbook, worksheet, "Usahawan 10K");
            window.XLSX.writeFile(
                workbook,
                `usahawan-10k-${new Date().toISOString().slice(0, 10)}.xlsx`
            );
        } catch (error) {
            console.error("Usahawan 10K Excel export error:", error);
            window.alert(error.message || "Eksport Usahawan 10K gagal.");
        }
    }

    function initialize() {
        const root = document.querySelector(".recipient-participant-shell");
        const pathname = typeof window.appPathname === "function"
            ? window.appPathname(window.location.pathname)
            : window.location.pathname;
        if (!root || pathname !== "/penerima-peserta" || root.dataset.switcherReady === "true") return;

        root.dataset.switcherReady = "true";
        const buttons = [...root.querySelectorAll("[data-recipient-participant-view]")];
        const selectView = key => {
            if (!views[key]) return;
            const previousKey = buttons.find(button => button.getAttribute("aria-pressed") === "true")
                ?.dataset.recipientParticipantView;
            const switched = previousKey !== key;
            const panel = document.getElementById(views[key].panelId);
            const shouldAnimate = switched;

            buttons.forEach(button => {
                const selected = button.dataset.recipientParticipantView === key;
                button.setAttribute("aria-pressed", String(selected));
                document.getElementById(views[button.dataset.recipientParticipantView].panelId).hidden = !selected;
            });
            updateTitle(key);
            showTitleActions(key);
            if (key === "usahawan10k") activateUsahawan10kUnsavedHooks();
            else deactivateUsahawan10kUnsavedHooks();
            const root = document.querySelector(".recipient-participant-shell");
            if (shouldAnimate) root.dataset.transitionTo = key;
            const loading = loadView(key);
            if (shouldAnimate && panel?.dataset.loaded === "true") {
                animateViewTransition(key);
                delete root.dataset.transitionTo;
            }
            return loading;
        };

        buttons.forEach(button => {
            button.addEventListener("click", () => {
                selectView(button.dataset.recipientParticipantView);
            });
        });
        document.getElementById("usahawan10kExportButton")?.addEventListener("click", exportUsahawan10kToExcel);
        const addForm = document.getElementById("usahawan10kAddForm");
        if (addForm && addForm.parentElement !== document.body) document.body.appendChild(addForm);
        ["usahawan10kDeleteOverlay", "usahawan10kDeleteConfirmation"].forEach(id => {
            const element = document.getElementById(id);
            if (element && element.parentElement !== document.body) document.body.appendChild(element);
        });
        document.getElementById("usahawan10kAddButton")?.addEventListener("click", openUsahawan10kAddForm);
        document.getElementById("usahawan10kCloseAdd")?.addEventListener("click", closeUsahawan10kAddForm);
        document.getElementById("usahawan10kConfirmAdd")?.addEventListener("click", addUsahawan10kRecord);
        addForm?.addEventListener("click", event => {
            if (event.target === addForm) closeUsahawan10kAddForm();
        });
        addForm?.addEventListener("cancel", event => {
            event.preventDefault();
            closeUsahawan10kAddForm();
        });
        document.getElementById("usahawan10kSaveButton")?.addEventListener("click", saveUsahawan10kChanges);
        document.getElementById("usahawan10kCancelDelete")?.addEventListener("click", closeUsahawan10kDeleteConfirmation);
        document.getElementById("usahawan10kConfirmDelete")?.addEventListener("click", confirmUsahawan10kDelete);
        document.getElementById("usahawan10kDeleteOverlay")?.addEventListener("click", closeUsahawan10kDeleteConfirmation);
        document.getElementById("usahawan10kColumnButton")?.addEventListener("click", event =>
            toggleUsahawan10kMenu(event, "usahawan10kColumnMenu", "usahawan10kFilterMenu"));
        document.getElementById("usahawan10kFilterButton")?.addEventListener("click", event =>
            toggleUsahawan10kMenu(event, "usahawan10kFilterMenu", "usahawan10kColumnMenu"));
        document.getElementById("usahawan10kSelectAllColumns")?.addEventListener("click", () => {
            const showAll = usahawan10kVisibleColumns.every(Boolean);
            usahawan10kVisibleColumns = usahawan10kColumns.map(() => !showAll);
            buildUsahawan10kColumnMenu();
            renderUsahawan10kTable();
        });
        document.getElementById("usahawan10kTableBody")?.addEventListener("dblclick", event => {
            const cell = event.target.closest?.("td[data-field]");
            const row = cell?.closest("tr");
            if (!cell || !row) return;
            const record = usahawan10kRecords.find(item =>
                String(item.datasetId) === row.dataset.datasetId &&
                String(item.rowIndex) === row.dataset.rowIndex
            );
            if (record) startUsahawan10kEditing(cell, record, cell.dataset.field);
        });
        document.getElementById("usahawan10kTableBody")?.addEventListener("click", event => {
            const button = event.target.closest?.("button[data-action='delete']");
            if (!button) return;
            const row = button.closest("tr");
            const record = usahawan10kRecords.find(item =>
                String(item.datasetId) === row?.dataset.datasetId &&
                String(item.rowIndex) === row?.dataset.rowIndex
            );
            if (record) openUsahawan10kDeleteConfirmation(record);
        });
        document.addEventListener("click", closeUsahawan10kMenus);
        document.addEventListener("click", clearUsahawan10kSelectionOnOutsideClick);
        document.addEventListener("mouseup", () => { usahawan10kMouseSelecting = false; });
        document.addEventListener("keydown", handleUsahawan10kKeyboard, true);
        document.addEventListener("copy", copyUsahawan10kSelection, true);
        document.addEventListener("cut", cutUsahawan10kSelection, true);
        document.addEventListener("paste", pasteUsahawan10kSelection, true);
        document.getElementById("usahawan10kSearch")?.addEventListener("input", () => {
            usahawan10kPage = 1;
            clearUsahawan10kSelection();
            applyUsahawan10kFilters();
        });
        document.getElementById("usahawan10kFirstPage")?.addEventListener("click", () => {
            usahawan10kPage = 1;
            renderUsahawan10kTable();
        });
        document.getElementById("usahawan10kPreviousPage")?.addEventListener("click", () => {
            usahawan10kPage = Math.max(1, usahawan10kPage - 1);
            renderUsahawan10kTable();
        });
        document.getElementById("usahawan10kNextPage")?.addEventListener("click", () => {
            usahawan10kPage += 1;
            renderUsahawan10kTable();
        });
        document.getElementById("usahawan10kLastPage")?.addEventListener("click", () => {
            usahawan10kPage = Math.max(1, Math.ceil(usahawan10kFilteredRecords.length / usahawan10kPageSize));
            renderUsahawan10kTable();
        });
        const requestedView = new URLSearchParams(window.location.search).get("view");
        const initialView = ["participants", "usahawan10k"].includes(requestedView)
            ? requestedView
            : "recipients";
        preloadViewAfterPageReady(initialView === "participants" ? "recipients" : "participants");
        return selectView(initialView);
    }

    function registerInitialization() {
        window.registerAppPageLoadTask?.(initialize());
    }

    document.addEventListener("DOMContentLoaded", registerInitialization);
    document.addEventListener("app:page-loaded", registerInitialization);
})();
