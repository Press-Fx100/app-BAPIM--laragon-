(() => {
    "use strict";

    const columns = [
        ["nama", "NAMA"], ["kadPengenalan", "KAD PENGENALAN"],
        ["telefon", "TELEFON"], ["email", "EMAIL"], ["statusPekerjaan", "PEKERJAAN"],
        ["status", "STATUS"], ["catatan", "CATATAN"],
        ["pic", "PIC"], ["sourceFile", "SUMBER FAIL"]
    ];
    const pageSize = 100;
    const $ = id => document.getElementById(id);
    let data = [], filtered = [], page = 1, sortKey = "", sortDirection = "asc";
    let visible = columns.map(c => !["sourceFile", "pic"].includes(c[0]));
    let filters = {}, widths = [45].concat(columns.map(() => 160));
    let deleteMode = false, active = null, anchor = null;
    let pendingChanges = new Map(), pendingDeleteRow = null;
    let savingChanges = false;
    let saveBadgeTimer = null;
    let dragging = false, shiftSelecting = false, editing = false, currentEdit = null, undoStack = [], redoStack = [], initializedBody = null, documentEventsBound = false;
    let addSuggestions = null, addSuggestionInputId = null, addSuggestionKey = null;
    let addSuggestionMatches = [], addSuggestionActiveIndex = -1, addSuggestionPositionHandler = null;

    const rowKey = row => `${row.datasetId}:${row.rowIndex}`;
    const esc = value => String(value == null ? "" : value).replace(/[&<>"']/g, c => (
        { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
    ));
    const value = (row, key) => String(row[key] == null ? "" : row[key]);
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
    function cellSuggestions(key, currentValue = "") {
        const options = new Set(
            data.map(row => value(row, key).trim()).filter(Boolean)
        );
        if (currentValue.trim()) options.add(currentValue.trim());
        return [...options].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
    }
    function refreshValueOptions(select, key) {
        if (!select) return;
        const currentValue = select.value;
        const options = new Set(
            data.map(row => value(row, key).trim()).filter(Boolean)
        );
        select.replaceChildren(new Option("", ""));
        [...options].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
            .forEach(option => select.add(new Option(option, option)));
        select.value = options.has(currentValue) ? currentValue : "";
    }
    function closeAddSuggestions(inputId = null) {
        if (inputId && addSuggestionInputId !== inputId) return;
        if (addSuggestionPositionHandler) {
            window.removeEventListener("resize", addSuggestionPositionHandler);
            window.removeEventListener("scroll", addSuggestionPositionHandler, true);
            addSuggestionPositionHandler = null;
        }
        addSuggestions?.remove();
        addSuggestions = null;
        addSuggestionInputId = null;
        addSuggestionKey = null;
        addSuggestionMatches = [];
        addSuggestionActiveIndex = -1;
    }
    function positionAddSuggestions(input) {
        if (!addSuggestions) return;
        const rect = input.getBoundingClientRect();
        const height = Math.min(220, addSuggestions.scrollHeight);
        const below = Math.max(0, window.innerHeight - rect.bottom - 8);
        const above = Math.max(0, rect.top - 8);
        const dropUp = below < height && above > below;
        const available = dropUp ? above : below;
        addSuggestions.style.left = `${Math.max(0, Math.min(rect.left, window.innerWidth - rect.width))}px`;
        addSuggestions.style.width = `${rect.width}px`;
        addSuggestions.style.maxHeight = `${Math.max(60, Math.min(220, available))}px`;
        addSuggestions.style.top = dropUp ? "auto" : `${rect.bottom}px`;
        addSuggestions.style.bottom = dropUp ? `${window.innerHeight - rect.top}px` : "auto";
    }
    function updateAddSuggestions() {
        const input = $(addSuggestionInputId);
        if (!input || !addSuggestions) return;
        const query = input.value.trim().toLocaleLowerCase();
        addSuggestionMatches = [
            ...(query ? [] : [""]),
            ...cellSuggestions(addSuggestionKey).filter(option => option.toLocaleLowerCase().includes(query))
        ];
        addSuggestionActiveIndex = addSuggestionMatches.length
            ? Math.max(0, addSuggestionMatches.indexOf(input.value))
            : -1;
        addSuggestions.replaceChildren();
        addSuggestionMatches.forEach((suggestion, index) => {
            const option = document.createElement("button");
            option.type = "button";
            option.className = "recipient-cell-suggestion";
            option.setAttribute("role", "option");
            option.setAttribute("aria-selected", String(index === addSuggestionActiveIndex));
            if (index === addSuggestionActiveIndex) option.classList.add("active");
            option.textContent = suggestion;
            option.addEventListener("mousedown", event => event.preventDefault());
            option.addEventListener("click", () => {
                input.value = suggestion;
                closeAddSuggestions();
                input.focus();
            });
            addSuggestions.appendChild(option);
        });
        addSuggestions.style.display = addSuggestionMatches.length ? "block" : "none";
        positionAddSuggestions(input);
    }
    function openAddSuggestions(inputId, key) {
        const input = $(inputId);
        if (!input) return;
        if (addSuggestions && addSuggestionInputId !== inputId) closeAddSuggestions();
        addSuggestionInputId = inputId;
        addSuggestionKey = key;
        if (!addSuggestions) {
            addSuggestions = document.createElement("div");
            addSuggestions.className = "recipient-cell-suggestions recipient-add-autocomplete-suggestions";
            addSuggestions.setAttribute("role", "listbox");
            document.body.appendChild(addSuggestions);
            addSuggestionPositionHandler = () => positionAddSuggestions(input);
            window.addEventListener("resize", addSuggestionPositionHandler);
            window.addEventListener("scroll", addSuggestionPositionHandler, true);
        }
        updateAddSuggestions();
    }
    function handleAddSuggestionKey(event) {
        if (!addSuggestions || !addSuggestionMatches.length) return;
        if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            closeAddSuggestions();
            return;
        }
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            const direction = event.key === "ArrowDown" ? 1 : -1;
            addSuggestionActiveIndex = addSuggestionActiveIndex < 0
                ? (direction > 0 ? 0 : addSuggestionMatches.length - 1)
                : (addSuggestionActiveIndex + direction + addSuggestionMatches.length) % addSuggestionMatches.length;
            addSuggestions.querySelectorAll(".recipient-cell-suggestion").forEach((option, index) => {
                const active = index === addSuggestionActiveIndex;
                option.classList.toggle("active", active);
                option.setAttribute("aria-selected", String(active));
                if (active) option.scrollIntoView({ block: "nearest" });
            });
            return;
        }
        if (event.key === "Enter" && addSuggestionActiveIndex >= 0) {
            event.preventDefault();
            event.stopPropagation();
            $(addSuggestionInputId).value = addSuggestionMatches[addSuggestionActiveIndex];
            closeAddSuggestions();
        }
    }
    const error = e => { console.error(e); window.alert(e && e.message ? e.message : "Operasi gagal"); };
    const api = async (method, body) => {
        const response = await fetch("/api/penerima-bantuan/records", {
            method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || result.success === false) throw new Error(result.error || "Operasi gagal");
        return result;
    };

    function init() {
        const body = $("recipientTableBody");
        if (!body || body === initializedBody) return;
        initializedBody = body;
        const addForm = $("recipientAddForm");
        if (addForm && addForm.parentElement !== document.body) {
            document.body.appendChild(addForm);
        }
        data = [];
        filtered = [];
        page = 1;
        sortKey = "";
        sortDirection = "asc";
        visible = columns.map(c => !["sourceFile", "pic"].includes(c[0]));
        filters = {};
        widths = [45].concat(columns.map(() => 160));
        deleteMode = false;
        active = null;
        anchor = null;
        pendingChanges.clear();
        pendingDeleteRow = null;
        dragging = false;
        shiftSelecting = false;
        editing = false;
        undoStack = [];
        redoStack = [];
        const params = new URLSearchParams(window.location.search);
        filters = {};
        ["status", "pic"].forEach(key => {
            const filter = params.get(key);
            if (filter !== null && filter !== "") {
                filters[key] = filter;
            }
        });
        window.hasUnsavedTableChanges = () =>
            pendingChanges.size > 0 ||
            Boolean(currentEdit && currentEdit.cell.querySelector(".inline-edit-input")?.value !== currentEdit.oldValue);
        window.isSavingTableChanges = () => savingChanges;
        window.resetTableState = () => {
            pendingChanges.clear();
            active = null;
            anchor = null;
            deleteMode = false;
            deleteActionStyles(false);
        };
        body.dataset.ready = "true";
        bind("recipientSearch", "input", apply);
        bind("recipientAddButton", "click", openAdd);
        bind("recipientCancelAdd", "click", closeAdd);
        bind("recipientCloseAdd", "click", closeAdd);
        bind("recipientAddForm", "click", event => {
            if (event.target === $("recipientAddForm")) closeAdd();
        });
        [["recipientAddStatus", "status"], ["recipientAddStatusPekerjaan", "statusPekerjaan"]]
            .forEach(([inputId, key]) => {
                const open = () => openAddSuggestions(inputId, key);
                bind(inputId, "focus", open);
                bind(inputId, "click", open);
                bind(inputId, "input", updateAddSuggestions);
                bind(inputId, "keydown", handleAddSuggestionKey);
                bind(inputId, "blur", () => window.setTimeout(() => {
                    if (
                        addSuggestionInputId === inputId &&
                        !addSuggestions?.contains(document.activeElement)
                    ) {
                        closeAddSuggestions(inputId);
                    }
                }));
            });
        bind("recipientConfirmAdd", "click", addRecord);
        bind("recipientDeleteButton", "click", deleteAction);
        bind("recipientSaveButton", "click", saveChanges);
        bind("recipientExportButton", "click", exportToExcel);
        bind("recipientCancelDelete", "click", closeDeleteConfirmation);
        bind("recipientConfirmDelete", "click", confirmDelete);
        bind("recipientDeleteOverlay", "click", closeDeleteConfirmation);
        bind("recipientColumnButton", "click", e => menu(e, "recipientColumnMenu", "recipientFilterMenu"));
        bind("recipientFilterButton", "click", e => menu(e, "recipientFilterMenu", "recipientColumnMenu"));
        bind("recipientSelectAllColumns", "click", () => {
            const all = visible.every(Boolean); visible = columns.map(() => !all); buildColumns(); render();
        });
        ["First", "Previous", "Next", "Last"].forEach(name =>
            bind(`recipient${name}Page`, "click", () => paginate(name)));
        if (!documentEventsBound) {
            document.addEventListener("click", closeMenus);
            document.addEventListener("click", finishEditOnOutsideClick);
            document.addEventListener("keydown", keyboard);
            document.addEventListener("copy", copy);
            document.addEventListener("cut", cut);
            document.addEventListener("paste", paste);
            document.addEventListener("mousemove", event => {
                if (!dragging) return;
                const cell = event.target.closest?.("#recipientTableBody td[data-col]");
                if (cell) selectRange(cell);
            });
            documentEventsBound = true;
        }
        load();
    }
    function bind(id, event, fn) { const node = $(id); if (node) node.addEventListener(event, fn); }
    function finishEditOnOutsideClick(event) {
        if (
            !currentEdit ||
            currentEdit.cell.contains(event.target) ||
            currentEdit.popup?.contains(event.target)
        ) return;
        const target = event.target.closest?.("#recipientTableBody td[data-row][data-col]");
        const targetRow = target ? data[Number(target.dataset.row)] : null;
        const targetCol = target ? Number(target.dataset.col) : -1;
        const finish = currentEdit.finish;
        finish(true).then(() => {
            if (!targetRow || targetCol <= 0) return;
            active = { row: data.indexOf(targetRow), col: targetCol };
            anchor = active;
            render();
            const currentCell = document.querySelector(
                `#recipientTableBody td[data-row="${active.row}"][data-col="${active.col}"]`
            );
            if (!currentCell) return;
            if (["status", "statusPekerjaan", "pic", "catatan"].includes(columns[targetCol - 1]?.[0])) {
                edit(currentCell, targetRow, targetCol, undefined, event);
            } else {
                focusSelectedCell(targetRow, targetCol);
            }
        });
    }
    function menu(event, open, close) {
        event.stopPropagation(); const a = $(open), b = $(close);
        if (b) b.classList.remove("show"); if (a) a.classList.toggle("show");
    }
    function closeMenus(event) {
        ["recipientColumnMenu", "recipientFilterMenu"].forEach(id => {
            const node = $(id); if (node && !node.contains(event.target)) node.classList.remove("show");
        });
    }
    async function load() {
        try {
            const response = await fetch("/api/penerima-bantuan");
            if (!response.ok) throw new Error("Gagal memuatkan penerima");
            data = (await response.json()).recipients || [];
            refreshValueOptions($("recipientAddPIC"), "pic");
            await loadDatasets(); buildColumns(); buildFilters(); apply();
        } catch (e) { error(e); const node = $("recipientLoading"); if (node) node.textContent = "Gagal memuatkan penerima."; }
    }
    async function loadDatasets() {
        const select = $("recipientAddDataset"); if (!select) return;
        const response = await fetch("/api/datasets");
        if (!response.ok) throw new Error("Gagal mendapatkan fail sumber penerima.");
        const list = await response.json(); select.innerHTML = "";
        list.filter(item => item.filename &&
            String(item.dataset_type ?? item.datasetType ?? "").toLowerCase() === "penerima"
        ).forEach(item => {
            const option = document.createElement("option");
            option.value = item.id; option.textContent = item.filename; select.appendChild(option);
        });
    }
    function buildColumns() {
        const list = $("recipientColumnChecklist"); if (!list) return;
        list.innerHTML = "";
        columns.forEach((column, index) => {
            const label = document.createElement("label"); label.className = "column-checkbox";
            label.innerHTML = `<input type="checkbox" ${visible[index] ? "checked" : ""}><span>${esc(column[1])}</span>`;
            label.firstChild.addEventListener("change", e => { visible[index] = e.target.checked; render(); });
            list.appendChild(label);
        });
    }
    function buildFilters() {
        const menuNode = $("recipientFilterMenu"); if (!menuNode) return;
        menuNode.innerHTML = '<div class="filter-title">Tapis</div>';
        columns.forEach(([key, label]) => {
            const counts = {}; let hasEmpty = false;
            data.forEach(row => { const v = value(row, key).trim(); if (v) counts[v] = (counts[v] || 0) + 1; else hasEmpty = true; });
            const repeated = Object.keys(counts).filter(v => counts[v] > 1).sort();
            if (!hasEmpty && !repeated.length) return;
            const field = document.createElement("div"); field.className = "filter-field";
            field.innerHTML = `<label>${esc(label)}</label><select><option value="">Semua</option>` +
                (hasEmpty ? '<option value="__EMPTY__">Kosong</option>' : "") +
                repeated.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join("") + "</select>";
            field.querySelector("select").value = filters[key] || "";
            field.querySelector("select").addEventListener("change", e => { filters[key] = e.target.value; apply(); });
            menuNode.appendChild(field);
        });
    }
    function apply() {
        const search = $("recipientSearch"), query = search ? search.value.toLowerCase() : "";
        filtered = data.filter(row => {
            const matchesSearch = Object.keys(row).some(k => value(row, k).toLowerCase().includes(query));
            const matchesFilters = Object.keys(filters).every(key => {
                const filter = filters[key]; if (!filter) return true;
                return filter === "__EMPTY__" ? !value(row, key).trim() : value(row, key).trim() === filter;
            });
            return matchesSearch && matchesFilters;
        });
        if (sortKey) filtered.sort((a, b) => value(a, sortKey).localeCompare(value(b, sortKey), undefined, { numeric: true }) * (sortDirection === "asc" ? 1 : -1));
        page = Math.min(page, Math.max(1, Math.ceil(filtered.length / pageSize))); render();
    }
    function render() {
        const body = $("recipientTableBody"), table = body && body.parentElement; if (!body || !table) return;
        document.querySelector(".recipient-page")?.classList.remove("data-content-pending");
        const loading = $("recipientLoading"); if (loading) loading.style.display = "none";
        const empty = $("recipientEmpty"), none = $("recipientNoResults"), wrapper = $("recipientTableWrapper");
        if (empty) empty.style.display = data.length ? "none" : "block";
        if (none) none.style.display = data.length && !filtered.length ? "block" : "none";
        if (wrapper) wrapper.style.display = filtered.length ? "block" : "none";
        if (!table.tHead) table.createTHead(); table.tHead.innerHTML = "";
        const header = table.tHead.insertRow();
        addHeader(header, "", 0);
        columns.forEach((column, index) => { if (visible[index]) addHeader(header, column[1], index + 1, column[0]); });
        body.innerHTML = "";
        const start = (page - 1) * pageSize;
        filtered.slice(start, start + pageSize).forEach((row, offset) => {
            const tr = body.insertRow(), rowIndex = data.indexOf(row);
            addCell(tr, String(start + offset + 1), rowIndex, 0, row);
            columns.forEach((column, index) => { if (visible[index]) addCell(tr, value(row, column[0]), rowIndex, index + 1, row); });
        });
        table.style.width = "100%";
        table.style.tableLayout = "fixed";
        paginateRender();
        updateSelectionInfo();
        updateHistory();
        const save = $("recipientSaveButton");
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
    function addHeader(row, text, index, key) {
        const th = document.createElement("th"); th.dataset.resizeColumn = index;
        const content = document.createElement("span");
        content.className = "header-content";
        const label = document.createElement("span");
        label.className = "header-label";
        label.textContent = text;
        content.appendChild(label);
        applyWidth(th, index);
        if (key) {
            th.classList.add("sortable"); th.setAttribute("aria-sort", sortKey === key ? sortDirection : "none");
            const icon = document.createElement("span");
            icon.className = "sort-icon";
            icon.textContent = sortKey === key ? (sortDirection === "asc" ? "▲" : "▼") : "";
            content.appendChild(icon);
            th.addEventListener("click", () => {
                if (sortKey === key) sortDirection = sortDirection === "asc" ? "desc" : "asc";
                else { sortKey = key; sortDirection = "asc"; }
                active = null;
                anchor = null;
                apply();
            });
        }
        th.appendChild(content);
        if (index !== 0) addResize(th, index);
        row.appendChild(th);
    }
    function addCell(tr, text, rowIndex, colIndex, row) {
        const td = tr.insertCell(); td.textContent = text; td.tabIndex = 0;
        td.dataset.row = rowIndex; td.dataset.col = colIndex; td.dataset.resizeColumn = colIndex;
        applyWidth(td, colIndex);
        if (colIndex === 0) {
            td.className = "row-select-cell";
            td.tabIndex = -1;
            td.textContent = "";
            if (deleteMode) {
                const button = document.createElement("button");
                button.type = "button";
                button.className = "row-delete-button";
                button.setAttribute("aria-label", `Padam rekod ${value(row, "nama")}`);
                button.title = "Padam rekod";
                button.innerHTML = '<i class="bi bi-x-lg" aria-hidden="true"></i>';
                button.addEventListener("click", event => {
                    event.stopPropagation();
                    openDeleteConfirmation(row);
                });
                td.appendChild(button);
            } else {
                const number = document.createElement("span");
                number.className = "row-number";
                number.textContent = text;
                td.appendChild(number);
            }
            return;
        }
        td.addEventListener("mousedown", e => startSelection(e, td));
        td.addEventListener("mouseenter", () => { if (dragging) selectRange(td); });
        td.addEventListener("mousemove", () => { if (dragging) selectRange(td); });
        td.addEventListener("dblclick", event => {
            if (deleteMode) return;
            if (currentEdit) {
                if (
                    currentEdit.cell !== td ||
                    !["status", "statusPekerjaan", "pic", "catatan"].includes(columns[colIndex - 1]?.[0])
                ) return;
                const finish = currentEdit.finish;
                finish(false).then(() => {
                    const currentCell = document.querySelector(
                        `#recipientTableBody td[data-row="${data.indexOf(row)}"][data-col="${colIndex}"]`
                    );
                    if (currentCell) edit(currentCell, row, colIndex, undefined, event);
                });
                return;
            }
            edit(td, row, colIndex, undefined, event);
        });
        td.addEventListener("keydown", e => cellKey(e, td));
        if (active && active.row === rowIndex && active.col === colIndex) td.classList.add("active-cell");
        if (inSelection(rowIndex, colIndex)) td.classList.add("selected-cell");
    }
    function addResize(th, index) {
        const handle = document.createElement("span"); handle.className = "column-resize-handle";
        handle.addEventListener("mousedown", event => {
            event.preventDefault(); event.stopPropagation(); const x = event.clientX, width = th.getBoundingClientRect().width;
            const move = e => { widths[index] = Math.max(70, width + e.clientX - x); document.querySelectorAll(`[data-resize-column="${index}"]`).forEach(n => applyWidth(n, index)); };
            const stop = () => { document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", stop); };
            document.addEventListener("mousemove", move); document.addEventListener("mouseup", stop);
        }); th.appendChild(handle);
    }
    function applyWidth(element, index) {
        if (index === 0) {
            element.style.width = "45px";
            element.style.minWidth = "45px";
            element.style.maxWidth = "45px";
            return;
        }
        const width = widths[index] || 160;
        element.style.width = `${width}px`;
        element.style.minWidth = `${width}px`;
        element.style.maxWidth = "none";
    }
    function inSelection(row, col) {
        if (!active) return false; const end = anchor || active;
        const activeRow = filtered.indexOf(data[active.row]);
        const endRow = filtered.indexOf(data[end.row]);
        const currentRow = filtered.indexOf(data[row]);
        return currentRow >= Math.min(activeRow, endRow) && currentRow <= Math.max(activeRow, endRow) &&
            col >= Math.min(active.col, end.col) && col <= Math.max(active.col, end.col);
    }
    function startSelection(event, td) {
        if (event.target.closest?.(".inline-edit-input")) return;
        if (deleteMode) return; event.preventDefault();
        const cell = { row: Number(td.dataset.row), col: Number(td.dataset.col) };
        shiftSelecting = event.shiftKey && !!active;
        if (!shiftSelecting) {
            active = cell;
            anchor = cell;
        } else {
            anchor = cell;
        }
        dragging = true; selectRange(td); td.focus();
        const stop = () => { dragging = false; shiftSelecting = false; document.removeEventListener("mouseup", stop); };
        document.addEventListener("mouseup", stop);
    }
    function selectRange(td) {
        if (!active) return;
        if (dragging && !shiftSelecting) {
            anchor = { row: Number(td.dataset.row), col: Number(td.dataset.col) };
        }
        document.querySelectorAll("#recipientTableBody td").forEach(cell => {
            const selected = inSelection(Number(cell.dataset.row), Number(cell.dataset.col));
            cell.classList.toggle("selected-cell", selected);
            cell.classList.toggle("active-cell", Number(cell.dataset.row) === active.row && Number(cell.dataset.col) === active.col);
        });
        updateSelectionInfo();
    }

    function updateSelectionInfo() {
        const selected = [...document.querySelectorAll("#recipientTableBody td.selected-cell")];
        const rowCount = new Set(selected.map(cell => cell.dataset.row)).size;
        const columnCount = new Set(selected.map(cell => cell.dataset.col)).size;
        const info = $("recipientSelectionInfo");
        if (info) info.textContent = `${rowCount} baris, ${columnCount} lajur, ${selected.length} sel dipilih`;
    }
    function cellKey(event, td) {
        if (event.target !== td && event.target.closest?.(".inline-edit-input")) {
            event.stopPropagation();
            return;
        }
        if (event.key === "F2" || event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
            event.preventDefault();
            event.stopPropagation();
            edit(td, data[Number(td.dataset.row)], Number(td.dataset.col), event.key.length === 1 ? event.key : undefined);
            return;
        }
        if (event.key === "Delete" || event.key === "Backspace") {
            event.preventDefault();
            event.stopPropagation();
            clearSelection().then(() => {
                if (!active) return;
                document.querySelector(`#recipientTableBody td[data-row="${active.row}"][data-col="${active.col}"]`)?.focus();
            });
            return;
        }
        if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) { event.preventDefault(); event.stopPropagation(); move(event.key, event.shiftKey); return; }
        if (event.key === "Tab") { event.preventDefault(); event.stopPropagation(); move("ArrowRight", false, event.shiftKey); return; }
        if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); move(event.shiftKey ? "ArrowUp" : "ArrowDown", false); }
    }
    function move(key, extend, reverse = false) {
        if (!active) return;
        const visibleColumns = columns.map((_, index) => index + 1).filter(index => visible[index - 1]);
        const currentColumn = active.col;
        const filteredIndex = filtered.indexOf(data[active.row]);
        if (filteredIndex < 0) return;
        let rowPosition = filteredIndex;
        let columnPosition = visibleColumns.indexOf(currentColumn);
        if (key === "ArrowUp" || key === "ArrowDown") {
            rowPosition += key === "ArrowUp" ? -1 : 1;
        } else {
            columnPosition += key === "ArrowLeft" || reverse ? -1 : 1;
            if (columnPosition < 0) {
                rowPosition--;
                columnPosition = visibleColumns.length - 1;
            } else if (columnPosition >= visibleColumns.length) {
                rowPosition++;
                columnPosition = 0;
            }
        }
        if (rowPosition < 0 || rowPosition >= filtered.length || columnPosition < 0) return;
        const nextPage = Math.floor(rowPosition / pageSize) + 1;
        if (nextPage !== page) page = nextPage;
        const next = {
            row: data.indexOf(filtered[rowPosition]),
            col: visibleColumns[columnPosition]
        };
        if (extend) {
            anchor = next;
        } else {
            active = next;
            anchor = next;
        }
        render();
        const cell = document.querySelector(`#recipientTableBody td[data-row="${next.row}"][data-col="${next.col}"]`);
        if (cell) cell.focus();
    }
    function caretOffsetAtPoint(text, element, clientX) {
        const style = window.getComputedStyle(element);
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        if (!context) return text.length;
        context.font = style.font;
        const x = Math.max(0, clientX - element.getBoundingClientRect().left - parseFloat(style.paddingLeft || "0"));
        let bestOffset = 0;
        let bestDistance = x;
        for (let offset = 1; offset <= text.length; offset++) {
            const distance = Math.abs(context.measureText(text.slice(0, offset)).width - x);
            if (distance < bestDistance) {
                bestOffset = offset;
                bestDistance = distance;
            }
        }
        return bestOffset;
    }
    function focusSelectedCell(row, col) {
        const rowIndex = data.indexOf(row);
        const target = document.querySelector(
            `#recipientTableBody td[data-row="${rowIndex}"][data-col="${col}"]`
        );
        target?.focus();
    }
    async function edit(cell, row, col, initial, event) {
        if (editing || col === 0 || columns[col - 1][0] === "sourceFile") return;
        editing = true;
        cell.classList.remove("active-cell", "selected-cell");
        cell.classList.add("editing-cell");
        const key = columns[col - 1][0], old = value(row, key);
        const hasSuggestions = ["status", "statusPekerjaan", "pic", "catatan"].includes(key);
        const input = document.createElement("input");
        input.className = "inline-edit-input";
        let suggestionPopup = null;
        const tableWrapper = $("recipientTableWrapper");
        const hideSuggestionsOnTableScroll = () => {
            if (suggestionPopup) suggestionPopup.style.display = "none";
        };
        let matchingSuggestions = [];
        let activeSuggestionIndex = -1;
        input.value = initial === undefined ? old : initial;
        cell.textContent = "";
        cell.appendChild(input);
        if (hasSuggestions) {
            suggestionPopup = document.createElement("div");
            suggestionPopup.className = "recipient-cell-suggestions";
            suggestionPopup.setAttribute("role", "listbox");
            const cellStyle = window.getComputedStyle(cell);
            suggestionPopup.style.fontFamily = cellStyle.fontFamily;
            suggestionPopup.style.fontSize = cellStyle.fontSize;
            suggestionPopup.style.fontWeight = cellStyle.fontWeight;
            suggestionPopup.style.lineHeight = cellStyle.lineHeight;
            suggestionPopup.style.letterSpacing = cellStyle.letterSpacing;
            document.body.appendChild(suggestionPopup);
            tableWrapper?.addEventListener("scroll", hideSuggestionsOnTableScroll, { passive: true });
        }
        input.focus();
        if (initial === undefined && input instanceof HTMLInputElement) {
            const offset = event ? caretOffsetAtPoint(old, cell, event.clientX) : old.length;
            input.setSelectionRange(offset, offset);
        }
        let finished = false, moving = false;
        const finish = async (save, restoreFocus = true) => {
            if (finished) return;
            finished = true;
            if (currentEdit?.cell === cell) currentEdit = null;
            tableWrapper?.removeEventListener("scroll", hideSuggestionsOnTableScroll);
            suggestionPopup?.remove();
            const next = input.value;
            const was = old;
            editing = false; cell.classList.remove("editing-cell");
            if (!save || next === was) {
                render();
                if (restoreFocus) focusSelectedCell(row, col);
                return;
            }
            try {
                row[key] = next;
                const pendingKey = `${rowKey(row)}:${key}`;
                const existing = pendingChanges.get(pendingKey);
                if (next === (existing?.old ?? was)) pendingChanges.delete(pendingKey);
                else pendingChanges.set(pendingKey, { row, key, old: existing?.old ?? was, next });
                historyPush({ type: "changes", changes: [{ row, key, old: was, next }] });
                render();
            }
            catch (e) { error(e); render(); }
            if (restoreFocus) focusSelectedCell(row, col);
        };
        currentEdit = { cell, row, col, finish, popup: suggestionPopup };
        const updateSuggestions = () => {
            if (!suggestionPopup) return;
            const query = input.value.trim().toLocaleLowerCase();
            matchingSuggestions = [
                ...(query ? [] : [""]),
                ...cellSuggestions(key, old).filter(option =>
                    option.toLocaleLowerCase().includes(query)
                )
            ];
            activeSuggestionIndex = matchingSuggestions.length
                ? Math.max(0, matchingSuggestions.indexOf(input.value))
                : -1;
            suggestionPopup.replaceChildren();
            suggestionPopup.style.display = matchingSuggestions.length ? "block" : "none";
            matchingSuggestions.forEach((suggestion, index) => {
                const option = document.createElement("button");
                option.type = "button";
                option.className = "recipient-cell-suggestion";
                option.setAttribute("role", "option");
                option.setAttribute("aria-selected", String(index === activeSuggestionIndex));
                if (index === activeSuggestionIndex) option.classList.add("active");
                option.textContent = suggestion;
                option.addEventListener("mousedown", suggestionEvent => {
                    suggestionEvent.preventDefault();
                });
                option.addEventListener("click", () => {
                    input.value = suggestion;
                    finish(true);
                });
                suggestionPopup.appendChild(option);
            });

            const rect = cell.getBoundingClientRect();
            suggestionPopup.style.left = `${Math.max(0, Math.min(rect.left, window.innerWidth - rect.width))}px`;
            suggestionPopup.style.top = `${rect.bottom}px`;
            suggestionPopup.style.width = `${rect.width}px`;
        };
        const updateActiveSuggestion = index => {
            if (!matchingSuggestions.length || !suggestionPopup) return;
            activeSuggestionIndex = (index + matchingSuggestions.length) % matchingSuggestions.length;
            suggestionPopup.querySelectorAll(".recipient-cell-suggestion").forEach((option, optionIndex) => {
                const isActive = optionIndex === activeSuggestionIndex;
                option.classList.toggle("active", isActive);
                option.setAttribute("aria-selected", String(isActive));
                if (isActive) option.scrollIntoView({ block: "nearest" });
            });
        };
        if (hasSuggestions) {
            updateSuggestions();
            input.addEventListener("input", () => {
                updateSuggestions();
            });
        }
        const handleEditKey = e => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
                e.preventDefault();
                e.stopPropagation();
                finish(true).then(saveChanges);
                return;
            }
            e.stopPropagation();
            if (e.key === "Escape") {
                e.preventDefault(); e.stopPropagation();
                finish(false);
            } else if (hasSuggestions && ["ArrowDown", "ArrowUp"].includes(e.key)) {
                if (!matchingSuggestions.length) return;
                e.preventDefault();
                updateActiveSuggestion(activeSuggestionIndex + (e.key === "ArrowDown" ? 1 : -1));
            } else if (e.key === "Enter") {
                e.preventDefault();
                if (hasSuggestions && matchingSuggestions.length) {
                    input.value = matchingSuggestions[Math.max(activeSuggestionIndex, 0)];
                }
                finish(true);
            } else if (e.key === "Tab") {
                e.preventDefault();
                moving = true;
                finish(true).then(() => move("ArrowRight", false, e.shiftKey));
            }
        };
        input.onkeydown = handleEditKey;
        input.addEventListener("blur", () => {
            window.setTimeout(() => {
                if (!moving && document.activeElement !== input) {
                    finish(true, false);
                }
            });
        });
    }
    function selectedCells() {
        if (!active) return [];
        const end = anchor || active, out = [];
        const activeRow = filtered.indexOf(data[active.row]);
        const endRow = filtered.indexOf(data[end.row]);
        for (let position = Math.min(activeRow, endRow); position <= Math.max(activeRow, endRow); position++) {
            const row = filtered[position];
            const rowIndex = data.indexOf(row);
            for (let c = Math.min(active.col, end.col); c <= Math.max(active.col, end.col); c++) {
                out.push({ row, rowIndex, col: c });
            }
        }
        return out;
    }
    async function applyChanges(changes) {
        const valid = changes.filter(x => x.col > 0 && columns[x.col - 1][0] !== "sourceFile");
        if (!valid.length) return;
        const oldChanges = valid.map(x => ({ row: x.row, key: columns[x.col - 1][0], old: value(x.row, columns[x.col - 1][0]), next: x.next }));
        try {
            oldChanges.forEach(x => {
                x.row[x.key] = x.next;
                const pendingKey = `${rowKey(x.row)}:${x.key}`;
                const existing = pendingChanges.get(pendingKey);
                const original = existing?.old ?? x.old;
                if (x.next === original) pendingChanges.delete(pendingKey);
                else {
                    pendingChanges.set(pendingKey, { row: x.row, key: x.key, old: existing?.old ?? x.old, next: x.next });
                }
            });
            historyPush({ type: "changes", changes: oldChanges }); render();
        } catch (e) { error(e); }
    }
    function copy(event) {
        if (!$("recipientTableBody")) return;
        const cells = selectedCells(); if (!cells.length) return;
        const end = anchor || active, lines = [];
        const start = Math.min(filtered.indexOf(data[active.row]), filtered.indexOf(data[end.row]));
        const finish = Math.max(filtered.indexOf(data[active.row]), filtered.indexOf(data[end.row]));
        for (let position = start; position <= finish; position++) {
            const row = filtered[position];
            lines.push(cells.filter(x => x.row === row).map(x => x.col ? value(x.row, columns[x.col - 1][0]) : "").join("\t"));
        }
        event.clipboardData.setData("text/plain", lines.join("\n")); event.preventDefault();
    }
    function cut(event) {
        if (!$("recipientTableBody")) return;
        copy(event);
        if (event.defaultPrevented) clearSelection();
    }
    function paste(event) {
        if (!$("recipientTableBody")) return;
        const text = event.clipboardData && event.clipboardData.getData("text/plain"); if (!text || !active) return;
        event.preventDefault(); const rows = text.replace(/\r/g, "").split("\n"), changes = [];
        const start = filtered.indexOf(data[active.row]);
        rows.forEach((line, r) => line.split("\t").forEach((next, c) => {
            const row = filtered[start + r];
            if (row) changes.push({ row, col: active.col + c, next });
        }));
        applyChanges(changes);
    }
    async function clearSelection() { await applyChanges(selectedCells().map(x => ({ row: x.row, col: x.col, next: "" }))); }
    function historyPush(action) { undoStack.push(action); redoStack = []; updateHistory(); }

    async function historyRun(redo) {
        const source = redo ? redoStack : undoStack, action = source.pop(); if (!action) return;
        try {
            if (action.type === "changes") {
                for (const change of action.changes) {
                    const pendingKey = `${rowKey(change.row)}:${change.key}`;
                    const pending = pendingChanges.get(pendingKey);
                    const baseline = pending?.old ?? value(change.row, change.key);
                    const next = redo ? change.next : change.old;
                    change.row[change.key] = next;
                    if (next === baseline) pendingChanges.delete(pendingKey);
                    else pendingChanges.set(pendingKey, {
                        row: change.row,
                        key: change.key,
                        old: baseline,
                        next
                    });
                }
            }
            if (action.type === "add" && !redo) {
                const row = data.find(r => value(r, "nama") === value(action.changes, "nama") && value(r, "kadPengenalan") === value(action.changes, "kadPengenalan"));
                if (row) await api("DELETE", { record: { datasetId: row.datasetId, rowIndex: row.rowIndex } });
            }
            if (action.type === "add" && redo) await api("POST", { datasetId: action.datasetId, changes: action.changes });
            if (action.type === "delete" && redo) for (const row of action.rows) await api("DELETE", { record: { datasetId: row.datasetId, rowIndex: row.rowIndex } });
            if (action.type === "delete" && !redo) for (const row of action.rows) await api("POST", { datasetId: row.datasetId, changes: row });
            (redo ? undoStack : redoStack).push(action);
            if (action.type === "changes") render();
            else await load();
        } catch (e) { source.push(action); error(e); }
    }
    function updateHistory() { /* Undo/redo are intentionally keyboard-only. */ }
    function keyboard(event) {
        if (!$("recipientTableBody")) return;
        const mod = event.ctrlKey || event.metaKey;
        if (mod && event.key.toLowerCase() === "s") {
            event.preventDefault();
            if (editing && currentEdit) {
                currentEdit.finish(true).then(saveChanges);
            } else {
                saveChanges();
            }
            return;
        }
        if (event.key === "Escape" && $("recipientAddForm")?.classList.contains("show")) {
            event.preventDefault();
            closeAdd();
            return;
        }
        if (editing && event.key === "Escape" && currentEdit) {
            event.preventDefault();
            currentEdit.finish(false);
            return;
        }
        if (editing) return;
        if (event.key === "Escape" && deleteMode) {
            deleteMode = false;
            deleteActionStyles(false);
            render();
            return;
        }
        if (mod && event.key.toLowerCase() === "z") { event.preventDefault(); historyRun(event.shiftKey); }
        else if (mod && event.key.toLowerCase() === "y") { event.preventDefault(); historyRun(true); }
    }
    function openAdd() {
        const form = $("recipientAddForm");
        const card = $("recipientAddCard");
        if (!form || !card) return;
        form.classList.add("show");
        card.classList.add("show");
        form.setAttribute("aria-hidden", "false");
        card.setAttribute("aria-hidden", "false");
        $("recipientAddNama")?.focus();
    }
    function closeAdd() {
        closeAddSuggestions();
        const form = $("recipientAddForm");
        const card = $("recipientAddCard");
        if (!form || !card) return;
        form.classList.remove("show");
        card.classList.remove("show");
        form.setAttribute("aria-hidden", "true");
        card.setAttribute("aria-hidden", "true");
    }
    async function addRecord() {
        const fields = [["nama", "recipientAddNama"], ["kadPengenalan", "recipientAddKP"], ["telefon", "recipientAddTelefon"], ["email", "recipientAddEmail"], ["status", "recipientAddStatus"], ["statusPekerjaan", "recipientAddStatusPekerjaan"], ["pic", "recipientAddPIC"], ["catatan", "recipientAddCatatan"]];
        const changes = {}; fields.forEach(([key, id]) => { const input = $(id); changes[key] = input ? input.value : ""; });
        const datasetId = $("recipientAddDataset") && $("recipientAddDataset").value;
        try { await api("POST", { datasetId, changes }); historyPush({ type: "add", datasetId, changes }); closeAdd(); await load(); }
        catch (e) { error(e); }
    }
    async function exportToExcel() {
        try {
            if (currentEdit) await currentEdit.finish(true, false);
            if (!window.XLSX) throw new Error("Pustaka eksport Excel tidak tersedia.");

            const exportColumns = columns.filter((_, index) => visible[index]);
            const worksheetData = [
                exportColumns.map(([, label]) => label),
                ...filtered.map(row => exportColumns.map(([key]) => value(row, key)))
            ];
            const worksheet = window.XLSX.utils.aoa_to_sheet(worksheetData);
            const workbook = window.XLSX.utils.book_new();
            window.XLSX.utils.book_append_sheet(workbook, worksheet, "Penerima Bantuan");
            window.XLSX.writeFile(
                workbook,
                `penerima-bantuan-${new Date().toISOString().slice(0, 10)}.xlsx`
            );
        } catch (e) {
            error(e);
        }
    }
    function deleteAction() {
        deleteMode = !deleteMode;
        deleteActionStyles(deleteMode);
        render();
    }
    function deleteActionStyles(active) {
        const button = $("recipientDeleteButton");
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
        $("recipientDeleteMessage").textContent =
            `Adakah anda pasti mahu memadam rekod "${value(row, "nama")}"?`;
        $("recipientDeleteOverlay").classList.add("show");
        $("recipientDeleteConfirmation").classList.add("show");
        $("recipientDeleteConfirmation").setAttribute("aria-hidden", "false");
    }
    function closeDeleteConfirmation() {
        $("recipientDeleteOverlay").classList.remove("show");
        $("recipientDeleteConfirmation").classList.remove("show");
        $("recipientDeleteConfirmation").setAttribute("aria-hidden", "true");
        pendingDeleteRow = null;
    }
    async function confirmDelete() {
        const row = pendingDeleteRow;
        if (!row) return;
        const button = $("recipientConfirmDelete");
        button.disabled = true;
        try {
            await api("DELETE", { record: { datasetId: row.datasetId, rowIndex: row.rowIndex } });
            historyPush({ type: "delete", rows: [Object.assign({}, row)] });
            closeDeleteConfirmation();
            await load();
        } catch (e) {
            error(e);
        } finally {
            button.disabled = false;
        }
    }
    async function saveChanges() {
        const save = $("recipientSaveButton");
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
            for (const { row, key, next } of pendingChanges.values()) {
                await api("PUT", { record: { datasetId: row.datasetId, rowIndex: row.rowIndex }, changes: { [key]: next } });
            }
            pendingChanges.clear();
            render();
            showSaveConfirmation();
        } catch (e) {
            render();
            error(e);
        } finally {
            savingChanges = false;
            render();
        }
    }
    function paginate(name) {
        const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
        if (name === "First") page = 1; if (name === "Previous") page = Math.max(1, page - 1);
        if (name === "Next") page = Math.min(pages, page + 1); if (name === "Last") page = pages; render();
    }
    function paginateRender() {
        const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
        ["First", "Previous"].forEach(n => { const b = $(`recipient${n}Page`); if (b) b.disabled = page === 1; });
        ["Next", "Last"].forEach(n => { const b = $(`recipient${n}Page`); if (b) b.disabled = page === pages; });
        const label = $("recipientPaginationInfo");
        if (label) {
            const first = filtered.length ? (page - 1) * pageSize + 1 : 0;
            const last = Math.min(page * pageSize, filtered.length);
            label.textContent = `${first}-${last} daripada ${filtered.length} baris`;
        }
    }
    document.addEventListener("DOMContentLoaded", init);
    document.addEventListener("app:page-loaded", () => {
        const pathname = typeof window.appPathname === "function"
            ? window.appPathname(window.location.pathname)
            : window.location.pathname;
        if (pathname === "/penerima-bantuan") {
            init();
            return;
        }
        closeAdd();
        const addForm = $("recipientAddForm");
        if (addForm?.parentElement === document.body) addForm.remove();
    });
})();
