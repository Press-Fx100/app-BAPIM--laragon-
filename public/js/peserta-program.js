(() => {
    const columns = [
        ["nama", "NAMA"],
        ["kadPengenalan", "KAD PENGENALAN"],
        ["ketegori", "KATEGORI"],
        ["jumlahProgram", "JUMLAH PROGRAM"],
        ["programs", "PROGRAM"],
        ["sourceFile", "SUMBER FAIL"]
    ];
    const pageSize = 100;
    const $ = id => document.getElementById(id);
    let rows = [];
    let filteredRows = [];
    let visibleColumns = columns.map((_, index) => index !== columns.length - 1);
    let columnWidths = [45, ...columns.map(() => 160)];
    let currentPage = 1;
    let sortColumn = -1;
    let sortDirection = "asc";
    let filters = {};
    let selectedCell = null;
    let selectionAnchor = null;
    let selectionRange = null;
    let mouseSelecting = false;
    let deleteMode = false;
    let editingCell = null;
    let pendingChanges = new Map(), pendingDeleteRow = null;
    let savingChanges = false;
    let saveBadgeTimer = null;
    let undoStack = [];
    let redoStack = [];
    let documentEventsBound = false;
    let categorySuggestionState = null;

    const rowKey = row => `${row.kadPengenalan}:${(row.sourceRecords || [])
        .map(record => `${record.datasetId}:${record.rowIndex}`).join(",")}`;
    const cellValue = (row, key) => key === "programs"
        ? (row.programs || []).join(", ")
        : row[key] ?? "";
    const editable = key => ["nama", "kadPengenalan", "ketegori", "programs"].includes(key);
    const escapeHtml = value => String(value ?? "")
        .replace(/&/g, "&amp;").replace(/</g, "&lt;")
        .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    function showSaveConfirmation() {
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
        clearTimeout(saveBadgeTimer);
        badge.classList.remove("is-visible");
        requestAnimationFrame(() => badge.classList.add("is-visible"));
        saveBadgeTimer = setTimeout(() => badge.classList.remove("is-visible"), 1800);
    }

    function initialize() {
        const body = $("participantTableBody");
        if (!body || body.dataset.ready === "true") return;
        body.dataset.ready = "true";
        ["participantAddForm", "participantProgramsOverlay"].forEach(id => {
            const overlay = $(id);
            if (overlay && overlay.parentElement !== document.body) {
                document.body.appendChild(overlay);
            }
        });
        rows = [];
        filteredRows = [];
        visibleColumns = columns.map((_, index) => index !== columns.length - 1);
        columnWidths = [45, ...columns.map(() => 160)];
        currentPage = 1;
        sortColumn = -1;
        sortDirection = "asc";
        filters = {};
        const params = new URLSearchParams(window.location.search);
        const programFilter = params.get("program");
        if (programFilter) {
            filters.programs = programFilter;
        }
        selectedCell = null;
        selectionAnchor = null;
        selectionRange = null;
        mouseSelecting = false;
        deleteMode = false;
        editingCell = null;
        pendingChanges.clear();
        pendingDeleteRow = null;
        undoStack = [];
        redoStack = [];
        deleteButtonStyles(false);
        window.hasUnsavedTableChanges = () =>
            pendingChanges.size > 0 ||
            Boolean(editingCell && editingCell.cell.querySelector(".inline-edit-input")?.value !== editingCell.oldValue);
        window.isSavingTableChanges = () => savingChanges;
        window.resetTableState = () => {
            pendingChanges.clear();
            selectedCell = null;
            selectionAnchor = null;
            selectionRange = null;
            deleteMode = false;
            deleteButtonStyles(false);
        };
        $("participantSearch").addEventListener("input", applyFilters);
        $("participantAddButton").addEventListener("click", openAddForm);
        $("participantSaveButton").addEventListener("click", saveChanges);
        $("participantExportButton").addEventListener("click", exportToExcel);
        $("participantCancelDelete").addEventListener("click", closeDeleteConfirmation);
        $("participantConfirmDelete").addEventListener("click", confirmDelete);
        $("participantDeleteOverlay").addEventListener("click", closeDeleteConfirmation);
        $("participantCancelAdd").addEventListener("click", closeAddForm);
        $("participantCloseAdd").addEventListener("click", closeAddForm);
        $("participantAddForm").addEventListener("click", event => {
            if (event.target === $("participantAddForm")) closeAddForm();
        });
        $("participantConfirmAdd").addEventListener("click", addRecord);
        $("participantDeleteButton").addEventListener("click", toggleDeleteMode);
        $("participantColumnButton").addEventListener("click", event => toggleMenu(event, "participantColumnMenu", "participantFilterMenu"));
        $("participantFilterButton").addEventListener("click", event => toggleMenu(event, "participantFilterMenu", "participantColumnMenu"));
        $("participantSelectAllColumns").addEventListener("click", toggleAllColumns);
        ["First", "Previous", "Next", "Last"].forEach(name =>
            $(`participant${name}Page`).addEventListener("click", () => changePage(name))
        );
        $("closeParticipantPrograms")?.addEventListener("click", closeProgramsModal);
        $("closeParticipantProgramsFooter")?.addEventListener("click", closeProgramsModal);
        $("participantProgramsOverlay")?.addEventListener("click", event => {
            if (event.target === $("participantProgramsOverlay")) closeProgramsModal();
        });
        if (!documentEventsBound) {
            document.addEventListener("click", closeMenus);
            document.addEventListener("keydown", handleKeyboard);
            document.addEventListener("copy", copyClipboard);
            document.addEventListener("cut", cutClipboard);
            document.addEventListener("paste", pasteClipboard);
            documentEventsBound = true;
        }
        load();
    }

    document.addEventListener("DOMContentLoaded", initialize);
    document.addEventListener("app:page-loaded", () => {
        const pathname = typeof window.appPathname === "function"
            ? window.appPathname(window.location.pathname)
            : window.location.pathname;
        if (pathname === "/peserta-program") return;
        closeAddForm();
        closeProgramsModal();
        ["participantAddForm", "participantProgramsOverlay"].forEach(id => {
            const overlay = $(id);
            if (overlay?.parentElement === document.body) overlay.remove();
        });
    });
    document.addEventListener("app:page-loaded", initialize);

    async function load() {
        try {
            const response = await fetch("/api/peserta-program");
            if (!response.ok) throw new Error("Gagal memuatkan peserta.");
            rows = (await response.json()).participants || [];
            await loadDatasetOptions();
            buildColumnMenu();
            buildFilterMenu();
            applyFilters();
        } catch (error) {
            console.error(error);
            $("participantLoading").textContent = "Gagal memuatkan peserta.";
        }
    }

    async function loadDatasetOptions() {
        const response = await fetch("/api/datasets");
        if (!response.ok) throw new Error("Gagal mendapatkan fail sumber.");
        const datasets = await response.json();
        const select = $("participantAddDataset");
        select.innerHTML = "";
        datasets.filter(dataset => dataset.filename &&
            String(dataset.dataset_type ?? dataset.datasetType ?? "").toLowerCase() === "peserta")
            .forEach(dataset => {
                const option = document.createElement("option");
                option.value = dataset.id;
                option.textContent = dataset.filename;
                select.appendChild(option);
            });
    }

    function toggleMenu(event, menuId, otherId) {
        event.stopPropagation();
        $(otherId).classList.remove("show");
        $(menuId).classList.toggle("show");
    }

    function closeMenus(event) {
        ["participantColumnMenu", "participantFilterMenu"].forEach(id => {
            const menu = $(id);
            if (menu && !menu.contains(event.target)) menu.classList.remove("show");
        });
    }

    function buildColumnMenu() {
        const checklist = $("participantColumnChecklist");
        checklist.innerHTML = "";
        columns.forEach(([key, label], index) => {
            if (key === "programs") return;
            const item = document.createElement("label");
            item.className = "column-checkbox";
            item.innerHTML = `<input type="checkbox" ${visibleColumns[index] ? "checked" : ""}><span>${label}</span>`;
            item.querySelector("input").addEventListener("change", event => {
                visibleColumns[index] = event.target.checked;
                render();
            });
            checklist.appendChild(item);
        });
    }

    function toggleAllColumns() {
        const showAll = visibleColumns.every(Boolean);
        visibleColumns = columns.map(() => !showAll);
        buildColumnMenu();
        render();
    }

    function buildFilterMenu() {
        const menu = $("participantFilterMenu");
        menu.innerHTML = '<div class="filter-title">Tapis</div>';
        columns.forEach(([key, label]) => {
            const values = new Map();
            let hasEmpty = false;
            rows.forEach(row => {
                const valuesForRow = key === "programs" ? row.programs || [] : [row[key]];
                if (!valuesForRow.some(value => String(value ?? "").trim())) hasEmpty = true;
                valuesForRow.forEach(value => {
                    const text = String(value ?? "").trim();
                    if (text) values.set(text, (values.get(text) || 0) + 1);
                });
            });
            const options = [...values].filter(([, count]) => count > 1).map(([value]) => value).sort();
            if (!hasEmpty && !options.length) return;
            const field = document.createElement("div");
            field.className = "filter-field";
            field.innerHTML = `<label>${label}</label><select>
                <option value="">Semua</option>
                ${hasEmpty ? '<option value="__EMPTY__">Kosong</option>' : ""}
                ${options.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("")}
            </select>`;
            field.querySelector("select").value = filters[key] || "";
            field.querySelector("select").addEventListener("change", event => {
                filters[key] = event.target.value;
                applyFilters();
            });
            menu.appendChild(field);
        });
    }

    function applyFilters() {
        const query = ($("participantSearch").value || "").trim().toLowerCase();
        filteredRows = rows.filter(row => {
            const searchable = Object.values(row).flat().join(" ").toLowerCase();
            if (query && !searchable.includes(query)) return false;
            return Object.entries(filters).every(([key, value]) => {
                if (!value) return true;
                const valuesForRow = key === "programs" ? row.programs || [] : [row[key]];
                return value === "__EMPTY__"
                    ? !valuesForRow.some(item => String(item ?? "").trim())
                    : valuesForRow.some(item => String(item ?? "").trim() === value);
            });
        });
        if (sortColumn >= 0) {
            const key = columns[sortColumn][0];
            filteredRows.sort((a, b) => {
                const result = String(cellValue(a, key)).localeCompare(String(cellValue(b, key)), undefined, {
                    numeric: true, sensitivity: "base"
                });
                return sortDirection === "asc" ? result : -result;
            });
        }
        currentPage = Math.min(currentPage, Math.max(1, Math.ceil(filteredRows.length / pageSize)));
        render();
    }

    function render() {
        const table = $("participantTableBody").closest("table");
        document.querySelector(".participant-page")?.classList.remove("data-content-pending");
        $("participantLoading").style.display = "none";
        $("participantEmpty").style.display = rows.length ? "none" : "block";
        $("participantNoResults").style.display = rows.length && !filteredRows.length ? "block" : "none";
        $("participantTableWrapper").style.display = filteredRows.length ? "block" : "none";
        const head = table.tHead;
        head.innerHTML = "";
        const headerRow = head.insertRow();
        appendHeader(headerRow, "", -1);
        columns.forEach(([key, label], index) => {
            if (key === "programs") return;
            if (visibleColumns[index]) appendHeader(headerRow, label, index);
        });
        const body = $("participantTableBody");
        body.innerHTML = "";
        const start = (currentPage - 1) * pageSize;
        filteredRows.slice(start, start + pageSize).forEach((row, offset) => {
            const actualIndex = rows.indexOf(row);
            const tr = document.createElement("tr");
            const numberCell = document.createElement("td");
            numberCell.className = "row-select-cell";
            if (deleteMode) {
                const deleteButton = document.createElement("button");
                deleteButton.type = "button";
                deleteButton.className = "row-delete-button";
                deleteButton.setAttribute(
                    "aria-label",
                    `Padam rekod ${row.nama || row.kadPengenalan}`
                );
                deleteButton.title = "Padam rekod";
                deleteButton.innerHTML = '<i class="bi bi-x-lg" aria-hidden="true"></i>';
                deleteButton.addEventListener("click", event => {
                    event.stopPropagation();
                    openDeleteConfirmation(row);
                });
                numberCell.appendChild(deleteButton);
            } else {
                numberCell.innerHTML = `<span class="row-number">${start + offset + 1}</span>`;
            }
            tr.appendChild(numberCell);
            columns.forEach(([key], columnIndex) => {
                if (key === "programs") return;
                if (!visibleColumns[columnIndex]) return;
                const td = document.createElement("td");
                td.className = "excel-cell";
                if (key === "jumlahProgram") {
                    const programCell = document.createElement("div");
                    programCell.className = "participant-program-cell";
                    const count = document.createElement("span");
                    count.textContent = cellValue(row, key);
                    programCell.appendChild(count);
                    const programButton = document.createElement("button");
                    programButton.type = "button";
                    programButton.className = "participant-programs-button";
                    programButton.setAttribute(
                        "aria-label",
                        `Lihat senarai program untuk ${row.nama || row.kadPengenalan || "peserta"}`
                    );
                    programButton.title = "Lihat senarai program";
                    programButton.innerHTML = '<i class="bi bi-three-dots" aria-hidden="true"></i>';
                    programButton.addEventListener("mousedown", event => event.stopPropagation());
                    programButton.addEventListener("dblclick", event => event.stopPropagation());
                    programButton.addEventListener("click", event => {
                        event.stopPropagation();
                        openProgramsModal(row);
                    });
                    programCell.appendChild(programButton);
                    td.appendChild(programCell);
                } else {
                    td.textContent = cellValue(row, key);
                    td.title = td.textContent;
                }
                td.tabIndex = 0;
                td.dataset.rowIndex = String(actualIndex);
                td.dataset.columnIndex = String(columnIndex);
                td.addEventListener("mousedown", event => {
                    if (deleteMode) {
                        event.preventDefault();
                        return;
                    }
                    beginCellSelection(event, td);
                });
                td.addEventListener("mouseenter", () => {
                    if (mouseSelecting) selectRange(actualIndex, columnIndex);
                });
                td.addEventListener("dblclick", () => {
                    if (!deleteMode) startEditing(td, row, key);
                });
                td.addEventListener("keydown", event => handleCellKey(event, td, row, key, columnIndex));
                applyWidth(td, columnIndex + 1);
                tr.appendChild(td);
            });
            body.appendChild(tr);
        });
        applyWidth(numberCellForHeader(headerRow), 0);
        updatePagination();
        updateSelection();
        const save = $("participantSaveButton");
        if (save) {
            const hasChanges = pendingChanges.size > 0;
            save.disabled = !hasChanges;
            save.title = hasChanges ? "Simpan perubahan" : "Disimpan";
            save.setAttribute("aria-label", save.title);
            save.innerHTML = '<i class="bi bi-floppy"></i>';
            save.classList.remove("is-saving");
            save.classList.toggle("has-changes", hasChanges);
            save.classList.toggle("saved", !hasChanges);
        }
    }

    function numberCellForHeader(header) {
        return header.cells[0];
    }

    function openProgramsModal(row) {
        const overlay = $("participantProgramsOverlay");
        const card = $("participantProgramsCard");
        const title = $("participantProgramsTitle");
        const list = $("participantProgramsList");
        if (!overlay || !card || !title || !list) return;

        const programs = Array.isArray(row.programs) ? row.programs : [];
        title.textContent = `Program — ${row.nama || row.kadPengenalan || "Peserta"}`;
        list.replaceChildren();
        if (programs.length) {
            programs.forEach(program => {
                const item = document.createElement("li");
                item.textContent = String(program);
                list.appendChild(item);
            });
        } else {
            const item = document.createElement("li");
            item.textContent = "Tiada program disenaraikan.";
            item.className = "participant-programs-empty";
            list.appendChild(item);
        }

        overlay.classList.add("show");
        card.classList.add("show");
        overlay.setAttribute("aria-hidden", "false");
        card.setAttribute("aria-hidden", "false");
        $("closeParticipantPrograms")?.focus();
    }

    function closeProgramsModal() {
        const overlay = $("participantProgramsOverlay");
        const card = $("participantProgramsCard");
        if (!overlay || !card) return;
        overlay.classList.remove("show");
        card.classList.remove("show");
        overlay.setAttribute("aria-hidden", "true");
        card.setAttribute("aria-hidden", "true");
    }

    function appendHeader(row, label, columnIndex) {
        const th = document.createElement("th");
        const content = document.createElement("span");
        content.className = "header-content";
        const labelNode = document.createElement("span");
        labelNode.className = "header-label";
        labelNode.textContent = label;
        content.appendChild(labelNode);
        if (columnIndex >= 0) {
            const icon = document.createElement("span");
            icon.className = "sort-icon";
            icon.textContent = sortColumn === columnIndex ? (sortDirection === "asc" ? "▲" : "▼") : "";
            content.appendChild(icon);
            th.addEventListener("click", event => {
                if (event.target.classList.contains("column-resize-handle")) return;
                sortDirection = sortColumn === columnIndex && sortDirection === "asc" ? "desc" : "asc";
                sortColumn = columnIndex;
                selectedCell = null;
                selectionAnchor = null;
                selectionRange = null;
                applyFilters();
            });
        }
        th.appendChild(content);
        if (columnIndex !== 0) {
            const handle = document.createElement("span");
            handle.className = "column-resize-handle";
            handle.addEventListener("mousedown", event => beginResize(event, columnIndex + 1));
            th.appendChild(handle);
        }
        applyWidth(th, columnIndex + 1);
        row.appendChild(th);
    }

    function applyWidth(element, index) {
        if (index === 0) {
            element.style.width = "45px";
            element.style.minWidth = "45px";
            element.style.maxWidth = "45px";
            return;
        }
        if (index > 0) {
            element.style.width = "auto";
            element.style.minWidth = `${columnWidths[index] || 160}px`;
            element.style.maxWidth = "none";
            return;
        }
    }

    function beginResize(event, index) {
        event.preventDefault();
        event.stopPropagation();
        const startX = event.clientX;
        const initialWidth = columnWidths[index];
        const move = moveEvent => {
            columnWidths[index] = Math.max(80, Math.min(600, initialWidth + moveEvent.clientX - startX));
            document.querySelectorAll(`[data-column-index="${index - 1}"]`).forEach(cell => applyWidth(cell, index));
            document.querySelectorAll("#participantTable thead th").forEach((cell, cellIndex) => {
                if (cellIndex === index) applyWidth(cell, index);
            });
            render();
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

    function beginCellSelection(event, cell) {
        if (deleteMode) return;
        if (event.button !== 0) return;
        const position = {
            rowIndex: Number(cell.dataset.rowIndex),
            columnIndex: Number(cell.dataset.columnIndex),
            displayRow: [...document.querySelectorAll("#participantTableBody tr")].indexOf(cell.parentElement)
        };
        mouseSelecting = true;
        if (event.shiftKey && selectionAnchor) {
            selectionRange = { ...selectionAnchor, endRow: position.rowIndex, endColumn: position.columnIndex, endDisplayRow: position.displayRow };
        } else {
            selectionAnchor = position;
            selectionRange = { ...position, endRow: position.rowIndex, endColumn: position.columnIndex, endDisplayRow: position.displayRow };
        }
        selectedCell = position;
        updateSelection();
    }

    document.addEventListener("mouseup", () => { mouseSelecting = false; });

    function selectRange(rowIndex, columnIndex) {
        if (!selectionAnchor) return;
        selectedCell = { rowIndex, columnIndex };
        selectionRange = {
            ...selectionAnchor,
            endRow: rowIndex,
            endColumn: columnIndex,
            endDisplayRow: displayedRowPosition(rowIndex)
        };
        updateSelection();
    }

    function displayedRowPosition(rowIndex) {
        const cell = document.querySelector(`#participantTableBody td[data-row-index="${rowIndex}"]`);
        return cell ? [...document.querySelectorAll("#participantTableBody tr")].indexOf(cell.parentElement) : -1;
    }

    function updateSelection() {
        document.querySelectorAll("#participantTableBody .selected-cell, #participantTableBody .active-cell")
            .forEach(cell => cell.classList.remove("selected-cell", "active-cell"));
        if (!selectionRange) return;
        const minRow = Math.min(selectionRange.displayRow, selectionRange.endDisplayRow);
        const maxRow = Math.max(selectionRange.displayRow, selectionRange.endDisplayRow);
        const minColumn = Math.min(selectionRange.columnIndex, selectionRange.endColumn);
        const maxColumn = Math.max(selectionRange.columnIndex, selectionRange.endColumn);
        document.querySelectorAll("#participantTableBody .excel-cell").forEach(cell => {
            const row = [...document.querySelectorAll("#participantTableBody tr")].indexOf(cell.parentElement);
            const column = Number(cell.dataset.columnIndex);
            if (row >= minRow && row <= maxRow && column >= minColumn && column <= maxColumn) {
                cell.classList.add("selected-cell");
            }
            if (selectedCell && row === displayedRowPosition(selectedCell.rowIndex) && column === selectedCell.columnIndex) {
                cell.classList.add("active-cell");
            }
        });
        updateSelectionInfo();
    }

    function updateSelectionInfo() {
        const selected = [...document.querySelectorAll("#participantTableBody .selected-cell")];
        const rowCount = new Set(selected.map(cell => cell.dataset.rowIndex)).size;
        const columnCount = new Set(selected.map(cell => cell.dataset.columnIndex)).size;
        const info = $("participantSelectionInfo");
        if (info) info.textContent = `${rowCount} baris, ${columnCount} lajur, ${selected.length} sel dipilih`;
    }

    function handleCellKey(event, cell, row, key, columnIndex) {
        if (event.key === "F2") {
            event.preventDefault();
            event.stopPropagation();
            if (editable(key)) startEditing(cell, row, key);
            return;
        }
        if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
            event.preventDefault();
            event.stopPropagation();
            moveCell(cell, event.key);
            return;
        }
        if (event.key === "Tab") {
            event.preventDefault();
            event.stopPropagation();
            moveCell(cell, "ArrowRight", event.shiftKey);
            return;
        }
        if (event.key === "Enter") {
            event.preventDefault();
            event.stopPropagation();
            moveCell(cell, event.shiftKey ? "ArrowUp" : "ArrowDown");
            return;
        }
        if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && editable(key)) {
            event.preventDefault();
            event.stopPropagation();
            startEditing(cell, row, key, event.key);
        }
    }

    function moveCell(cell, direction, reverse = false) {
        const rowIndex = Number(cell.dataset.rowIndex);
        const columnIndex = Number(cell.dataset.columnIndex);
        const visible = columns.map((_, index) => index).filter(index => visibleColumns[index]);
        const displayedIndex = displayedRowPosition(rowIndex);
        if (displayedIndex < 0) return;
        const globalIndex = (currentPage - 1) * pageSize + displayedIndex;
        let columnPosition = visible.indexOf(columnIndex);
        let targetRow = globalIndex;
        if (direction === "ArrowUp" || direction === "ArrowDown") {
            targetRow += direction === "ArrowUp" ? -1 : 1;
        } else {
            columnPosition += reverse ? -1 : 1;
            if (columnPosition < 0) {
                targetRow--;
                columnPosition = visible.length - 1;
            } else if (columnPosition >= visible.length) {
                targetRow++;
                columnPosition = 0;
            }
        }
        if (targetRow < 0 || targetRow >= filteredRows.length) return;
        const nextPage = Math.floor(targetRow / pageSize) + 1;
        if (nextPage !== currentPage) currentPage = nextPage;
        const pageRow = targetRow % pageSize;
        render();
        const target = document.querySelectorAll("#participantTableBody tr")[pageRow]
            ?.querySelector(`.excel-cell[data-column-index="${visible[columnPosition]}"]`);
        if (target) {
            const position = {
                rowIndex: Number(target.dataset.rowIndex),
                columnIndex: Number(target.dataset.columnIndex),
                displayRow: pageRow
            };
            selectedCell = position;
            selectionAnchor = position;
            selectionRange = { ...position, endRow: position.rowIndex, endColumn: position.columnIndex, endDisplayRow: pageRow };
            target.focus();
            updateSelection();
        }
    }

    function openCategorySuggestions(cell, row, input) {
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

        const tableWrapper = $("participantTableWrapper");
        const hideOnScroll = () => {
            popup.style.display = "none";
        };
        tableWrapper?.addEventListener("scroll", hideOnScroll, { passive: true });
        categorySuggestionState = { cell, row, input, popup, options: [], activeIndex: -1, tableWrapper, hideOnScroll };
        input.addEventListener("input", updateCategorySuggestions);
        updateCategorySuggestions();
    }

    function updateCategorySuggestions() {
        const state = categorySuggestionState;
        if (!state) return;
        const currentValue = state.input.value.trim();
        const query = currentValue.toLocaleLowerCase();
        const values = new Set(
            rows.map(item => String(item.kategori ?? item.ketegori ?? "").trim()).filter(Boolean)
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
                state.input.value = value;
                finishEditing(true);
            });
            state.popup.appendChild(option);
        });
        const rect = state.cell.getBoundingClientRect();
        state.popup.style.display = state.options.length ? "block" : "none";
        state.popup.style.left = `${Math.max(0, Math.min(rect.left, window.innerWidth - rect.width))}px`;
        state.popup.style.top = `${rect.bottom}px`;
        state.popup.style.width = `${rect.width}px`;
    }

    function closeCategorySuggestions() {
        if (!categorySuggestionState) return;
        const { input, popup, tableWrapper, hideOnScroll } = categorySuggestionState;
        input.removeEventListener("input", updateCategorySuggestions);
        tableWrapper?.removeEventListener("scroll", hideOnScroll);
        popup.remove();
        categorySuggestionState = null;
    }

    function startEditing(cell, row, key, initialCharacter = null) {
        if (editingCell || !editable(key)) return;
        editingCell = { cell, row, key, oldValue: cellValue(row, key) };
        cell.classList.remove("active-cell", "selected-cell");
        cell.classList.add("editing-cell");
        const input = document.createElement("input");
        input.type = "text";
        input.className = "inline-edit-input";
        input.value = initialCharacter ?? editingCell.oldValue;
        cell.textContent = "";
        cell.appendChild(input);
        if (key === "ketegori") openCategorySuggestions(cell, row, input);
        input.focus();
        if (initialCharacter === null) input.select();
        const handleEditKey = event => {
            if (key === "ketegori" && categorySuggestionState?.input === input) {
                const state = categorySuggestionState;
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
                    input.value = state.options[state.activeIndex];
                    finishEditing(true);
                    return;
                }
            }
            if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                finishEditing(false);
            } else if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.stopPropagation();
                finishEditing(true).then(() => moveCell(cell, "ArrowDown"));
            } else if (event.key === "Enter" && event.shiftKey) {
                event.preventDefault();
                event.stopPropagation();
                finishEditing(true).then(() => moveCell(cell, "ArrowUp"));
            } else if (event.key === "Tab") {
                event.preventDefault();
                event.stopPropagation();
                finishEditing(true).then(() => moveCell(cell, "ArrowRight", event.shiftKey));
            } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
                event.preventDefault();
                event.stopPropagation();
                const start = input.selectionStart ?? input.value.length;
                const end = input.selectionEnd ?? start;
                input.setRangeText(event.key, start, end, "end");
            }
        };
        input.onkeydown = handleEditKey;
        input.onblur = () => finishEditing(true);
    }

    async function finishEditing(save) {
        if (!editingCell) return;
        const state = editingCell;
        closeCategorySuggestions();
        editingCell = null;
        state.cell.classList.remove("editing-cell");
        const input = state.cell.querySelector(".inline-edit-input");
        const newValue = save ? (input?.value || "").trim() : state.oldValue;
        state.cell.textContent = newValue;
        if (!save || newValue === state.oldValue) {
            render();
            return;
        }

        try {
            const pendingKey = `${rowKey(state.row)}:${state.key}`;
            const existing = pendingChanges.get(pendingKey);
            state.row[state.key] = newValue;
            if (newValue === (existing?.oldValue ?? state.oldValue)) pendingChanges.delete(pendingKey);
            else pendingChanges.set(pendingKey, { row: state.row, key: state.key, oldValue: existing?.oldValue ?? state.oldValue, newValue });
            pushHistory({ type: "changes", changes: [{ row: state.row, key: state.key, oldValue: state.oldValue, newValue }] });
            render();
        } catch (error) {
            showError(error);
            render();
        }
    }

    async function exportToExcel() {
        try {
            if (editingCell) await finishEditing(true);
            applyFilters();
            if (!window.XLSX) throw new Error("Pustaka eksport Excel tidak tersedia.");

            const exportColumns = columns.filter((_, index) => visibleColumns[index]);
            const worksheetData = [
                exportColumns.map(([, label]) => label),
                ...filteredRows.map(row =>
                    exportColumns.map(([key]) => cellValue(row, key))
                )
            ];
            const worksheet = window.XLSX.utils.aoa_to_sheet(worksheetData);
            const workbook = window.XLSX.utils.book_new();
            window.XLSX.utils.book_append_sheet(workbook, worksheet, "Peserta Program");
            window.XLSX.writeFile(
                workbook,
                `peserta-program-${new Date().toISOString().slice(0, 10)}.xlsx`
            );
        } catch (error) {
            showError(error);
        }
    }

    function selectedCells() {
        if (!selectionRange) return [];
        const minRow = Math.min(selectionRange.displayRow, selectionRange.endDisplayRow);
        const maxRow = Math.max(selectionRange.displayRow, selectionRange.endDisplayRow);
        const minColumn = Math.min(selectionRange.columnIndex, selectionRange.endColumn);
        const maxColumn = Math.max(selectionRange.columnIndex, selectionRange.endColumn);
        const result = [];
        for (let position = minRow; position <= maxRow; position++) {
            const rowCell = document.querySelectorAll("#participantTableBody tr")[position]
                ?.querySelector("td[data-row-index]");
            const rowIndex = rowCell ? Number(rowCell.dataset.rowIndex) : -1;
            for (let columnIndex = minColumn; columnIndex <= maxColumn; columnIndex++) {
                const key = columns[columnIndex]?.[0];
                const row = rows[rowIndex];
                if (row && key && editable(key)) result.push({ row, key, oldValue: cellValue(row, key) });
            }
        }
        return result;
    }

    function handleKeyboard(event) {
        if (event.key === "Escape" && $("participantProgramsOverlay")?.classList.contains("show")) {
            closeProgramsModal();
            return;
        }
        if (!$("participantTableBody")) return;
        const modifier = event.ctrlKey || event.metaKey;
        if (modifier && event.key.toLowerCase() === "s") {
            event.preventDefault();
            if (editingCell) {
                finishEditing(true).then(saveChanges);
            } else {
                saveChanges();
            }
            return;
        }
        if (event.key === "Escape" && $("participantAddForm")?.classList.contains("show")) {
            event.preventDefault();
            closeAddForm();
            return;
        }
        const target = event.target;
        const typing = target.matches?.("input, textarea, select, button, [contenteditable='true']");
        if (modifier && event.key.toLowerCase() === "z" && !typing) {
            event.preventDefault();
            undo();
        } else if (modifier && (event.key.toLowerCase() === "y" || (event.shiftKey && event.key.toLowerCase() === "z")) && !typing) {
            event.preventDefault();
            redo();
        } else if (event.key === "Delete" && !typing && !deleteMode) {
            event.preventDefault();
            clearSelection();
        } else if (event.key === "Escape" && deleteMode) {
            deleteMode = false;
            deleteButtonStyles(false);
            render();
        }
    }

    async function copySelection() {
        const cells = selectedCells();
        if (!cells.length) return;
        const end = selectionRange;
        const minRow = Math.min(end.rowIndex, end.endRow);
        const maxRow = Math.max(end.rowIndex, end.endRow);
        const minColumn = Math.min(end.columnIndex, end.endColumn);
        const maxColumn = Math.max(end.columnIndex, end.endColumn);
        const text = [];
        for (let rowIndex = minRow; rowIndex <= maxRow; rowIndex++) {
            const row = rows[rowIndex];
            const line = [];
            for (let columnIndex = minColumn; columnIndex <= maxColumn; columnIndex++) {
                const key = columns[columnIndex]?.[0];
                line.push(row && key ? cellValue(row, key) : "");
            }

            text.push(line.join("\t"));
        }
        const output = text.join("\r\n");
        try {
            await navigator.clipboard.writeText(output);
        } catch {
            const textarea = document.createElement("textarea");
            textarea.value = output;
            textarea.style.position = "fixed";
            textarea.style.left = "-9999px";
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand("copy");
            textarea.remove();
        }
    }

    function copyClipboard(event) {
        if (!$("participantTableBody")) return;
        if (event.target.matches?.("input, textarea, select, [contenteditable='true']")) return;
        const range = selectedCells();
        if (!range.length) return;
        const rowsInRange = new Map();
        range.forEach(cell => {
            if (!rowsInRange.has(cell.row)) rowsInRange.set(cell.row, []);
            rowsInRange.get(cell.row).push(cell);
        });
        const output = [...rowsInRange.values()]
            .map(row => row.sort((a, b) => columns.findIndex(column => column[0] === a.key) - columns.findIndex(column => column[0] === b.key))
                .map(cell => cellValue(cell.row, cell.key)).join("\t"))
            .join("\r\n");
        event.clipboardData.setData("text/plain", output);
        event.preventDefault();
    }

    function cutClipboard(event) {
        if (!$("participantTableBody")) return;
        copyClipboard(event);
        if (event.defaultPrevented) clearSelection();
    }

    function pasteClipboard(event) {
        if (!$("participantTableBody")) return;
        if (event.target.matches?.("input, textarea, select, [contenteditable='true']")) return;
        const text = event.clipboardData?.getData("text/plain");
        if (!text || !selectionAnchor) return;
        event.preventDefault();
        pasteText(text);
    }

    async function pasteText(text) {
        const matrix = text.replace(/\r/g, "").split("\n").filter(line => line.length).map(line => line.split("\t"));
        if (!matrix.length || !selectionAnchor) return;
        const changes = [];
        matrix.forEach((line, rowOffset) => line.forEach((value, columnOffset) => {
            const row = rows[selectionAnchor.rowIndex + rowOffset];
            const key = columns[selectionAnchor.columnIndex + columnOffset]?.[0];
            if (!row || !editable(key)) return;
            const oldValue = cellValue(row, key);
            if (oldValue !== value) changes.push({ row, key, oldValue, newValue: value });
        }));
        if (!changes.length) return;
        try {
            for (const change of changes) await persistChange(change.row, change.key, change.newValue, change.oldValue);
            pushHistory({ type: "changes", changes });
            render();
        } catch (error) {
            showError(error);
        }
    }

    async function clearSelection() {
        const changes = selectedCells().filter(change => change.oldValue !== "");
        if (!changes.length) return;
        try {
            for (const change of changes) await persistChange(change.row, change.key, "", change.oldValue);
            pushHistory({ type: "changes", changes: changes.map(change => ({ ...change, newValue: "" })) });
            render();
            if (selectedCell) {
                const current = document.querySelector(
                    `#participantTableBody .excel-cell[data-row-index="${selectedCell.rowIndex}"][data-column-index="${selectedCell.columnIndex}"]`
                );
                current?.focus();
            }
        } catch (error) {
            showError(error);
        }
    }

    async function persistChange(row, key, value, oldValue = cellValue(row, key)) {
        row[key] = value;
        const pendingKey = `${rowKey(row)}:${key}`;
        const existing = pendingChanges.get(pendingKey);
        if (value === oldValue || (existing && existing.oldValue === value)) pendingChanges.delete(pendingKey);
        else pendingChanges.set(pendingKey, { row, key, oldValue: existing?.oldValue ?? oldValue, newValue: value });
    }

    async function sendChange(row, key, value) {
        const changes = { [key]: key === "programs" ? value : value };
        const response = await fetch("/api/peserta-program/records", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ record: { kadPengenalan: row.kadPengenalan, sourceRecords: row.sourceRecords || [] }, changes })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.success) throw new Error(result.error || "Operasi gagal.");
    }

    async function saveChanges() {
        const save = $("participantSaveButton");
        const savedChangeCount = pendingChanges.size;
        if (!savedChangeCount) return;
        savingChanges = true;
        if (save) {
            save.disabled = true;
            save.title = "Menyimpan...";
            save.setAttribute("aria-label", save.title);
            save.classList.add("is-saving");
            save.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>';
        }
        try {
            for (const { row, key, newValue } of pendingChanges.values()) await sendChange(row, key, newValue);
            pendingChanges.clear();
            render();
            showSaveConfirmation();
        } catch (error) {
            render();
            showError(error);
        } finally {
            savingChanges = false;
            render();
        }
    }

    function pushHistory(action) {
        undoStack.push(action);
        redoStack = [];
    }

    async function replay(action, useNewValue) {
        const changes = action.changes.map(change => ({ ...change, value: useNewValue ? change.newValue : change.oldValue }));
        for (const change of changes) await persistChange(change.row, change.key, change.value);
        await load();
    }

    async function undo() {
        const action = undoStack.pop();
        if (!action) return;
        try { await replay(action, false); redoStack.push(action); } catch (error) { undoStack.push(action); showError(error); }
    }

    async function redo() {
        const action = redoStack.pop();
        if (!action) return;
        try { await replay(action, true); undoStack.push(action); } catch (error) { redoStack.push(action); showError(error); }
    }

    function openAddForm() {
        const form = $("participantAddForm");
        const card = $("participantAddCard");
        if (!form || !card) return;
        form.classList.add("show");
        card.classList.add("show");
        form.setAttribute("aria-hidden", "false");
        card.setAttribute("aria-hidden", "false");
        $("participantAddNama")?.focus();
    }

    function closeAddForm() {
        const form = $("participantAddForm");
        const card = $("participantAddCard");
        if (!form || !card) return;
        form.classList.remove("show");
        card.classList.remove("show");
        form.setAttribute("aria-hidden", "true");
        card.setAttribute("aria-hidden", "true");
    }

    async function addRecord() {
        const datasetId = $("participantAddDataset").value;
        const changes = {
            nama: $("participantAddNama").value.trim(),
            kadPengenalan: $("participantAddKP").value.trim(),
            ketegori: $("participantAddCategory").value.trim(),
            programs: $("participantAddProgram").value.trim()
        };
        try {
            const response = await fetch("/api/peserta-program/records", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ datasetId, changes })
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok || !result.success) throw new Error(result.error || "Gagal menambah rekod.");
            closeAddForm();
            await load();
        } catch (error) {
            showError(error);
        }
    }

    function toggleDeleteMode() {
        deleteMode = !deleteMode;
        deleteButtonStyles(deleteMode);
        selectionRange = null;
        render();
    }

    function deleteButtonStyles(active) {
        const button = $("participantDeleteButton");
        button.classList.toggle("active", active);
        button.style.backgroundColor = active ? "#dc2626" : "";
        button.style.borderColor = active ? "#dc2626" : "";
        button.style.color = active ? "#fff" : "";
        button.setAttribute("aria-pressed", String(active));
        button.title = active ? "Keluar mod padam" : "Padam Rekod";
        button.setAttribute("aria-label", button.title);
    }

    function openDeleteConfirmation(row) {
        pendingDeleteRow = row;
        $("participantDeleteMessage").textContent =
            `Adakah anda pasti mahu memadam rekod "${row.nama || row.kadPengenalan}"? Tindakan ini tidak boleh dibuat asal.`;
        $("participantDeleteOverlay").classList.add("show");
        $("participantDeleteConfirmation").classList.add("show");
        $("participantDeleteConfirmation").setAttribute("aria-hidden", "false");
    }

    function closeDeleteConfirmation() {
        $("participantDeleteOverlay").classList.remove("show");
        $("participantDeleteConfirmation").classList.remove("show");
        $("participantDeleteConfirmation").setAttribute("aria-hidden", "true");
        pendingDeleteRow = null;
    }

    function confirmDelete() {
        if (!pendingDeleteRow) return;
        deleteParticipantRow(pendingDeleteRow);
    }

    async function deleteParticipantRow(row) {
        const button = $("participantConfirmDelete");
        button.disabled = true;
        try {
            const response = await fetch("/api/peserta-program/records", {
                method: "DELETE", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ record: { kadPengenalan: row.kadPengenalan, sourceRecords: row.sourceRecords || [] } })
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok || !result.success) throw new Error(result.error || "Gagal memadam rekod.");
            closeDeleteConfirmation();
            await load();
        } catch (error) {
            showError(error);
        } finally {
            button.disabled = false;
        }
    }

    function changePage(action) {
        const total = Math.max(1, Math.ceil(filteredRows.length / pageSize));
        if (action === "First") currentPage = 1;
        if (action === "Previous") currentPage = Math.max(1, currentPage - 1);
        if (action === "Next") currentPage = Math.min(total, currentPage + 1);
        if (action === "Last") currentPage = total;
        render();
    }

    function updatePagination() {
        const total = Math.max(1, Math.ceil(filteredRows.length / pageSize));
        const first = filteredRows.length ? (currentPage - 1) * pageSize + 1 : 0;
        const last = Math.min(currentPage * pageSize, filteredRows.length);
        $("participantPaginationInfo").textContent = `${first}-${last} daripada ${filteredRows.length} baris`;
        $("participantFirstPage").disabled = currentPage === 1;
        $("participantPreviousPage").disabled = currentPage === 1;
        $("participantNextPage").disabled = currentPage === total;
        $("participantLastPage").disabled = currentPage === total;
        const numbers = $("participantPageNumbers");
        numbers.innerHTML = "";
    }

    function showError(error) {
        console.error(error);
        window.alert(error.message || "Operasi gagal.");
    }
})();
