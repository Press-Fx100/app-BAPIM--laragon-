(() => {
    "use strict";

    const columns = [
        ["nama", "NAMA"], ["kadPengenalan", "KAD PENGENALAN"],
        ["telefon", "TELEFON"], ["email", "EMAIL"], ["status", "STATUS"],
        ["catatan", "CATATAN"], ["pic", "PIC"], ["sourceFile", "SUMBER FAIL"]
    ];
    const pageSize = 100;
    const $ = id => document.getElementById(id);
    let data = [], filtered = [], page = 1, sortKey = "", sortDirection = "asc";
    let visible = columns.map(c => c[0] !== "sourceFile");
    let filters = {}, widths = [45].concat(columns.map(() => 160));
    let deleteMode = false, active = null, anchor = null;
    let pendingChanges = new Map(), pendingDeleteRow = null;
    let dragging = false, shiftSelecting = false, editing = false, undoStack = [], redoStack = [], initializedBody = null, documentEventsBound = false;

    const rowKey = row => `${row.datasetId}:${row.rowIndex}`;
    const esc = value => String(value == null ? "" : value).replace(/[&<>"']/g, c => (
        { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
    ));
    const value = (row, key) => String(row[key] == null ? "" : row[key]);
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
        data = [];
        filtered = [];
        page = 1;
        sortKey = "";
        sortDirection = "asc";
        visible = columns.map(c => c[0] !== "sourceFile");
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
        window.hasUnsavedTableChanges = () => pendingChanges.size > 0;
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
        bind("recipientCancelAdd", "click", () => { if ($("recipientAddForm")) $("recipientAddForm").style.display = "none"; });
        bind("recipientConfirmAdd", "click", addRecord);
        bind("recipientDeleteButton", "click", deleteAction);
        bind("recipientSaveButton", "click", saveChanges);
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
            await loadDatasets(); buildColumns(); buildFilters(); apply();
        } catch (e) { error(e); const node = $("recipientLoading"); if (node) node.textContent = "Gagal memuatkan penerima."; }
    }
    async function loadDatasets() {
        const select = $("recipientAddDataset"); if (!select) return;
        const response = await fetch("/api/datasets"); if (!response.ok) return;
        const list = await response.json(); select.innerHTML = "";
        list.filter(x => x.filename && !String(x.filename).toLowerCase().includes("peserta")).forEach(item => {
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
        table.style.tableLayout = "auto";
        paginateRender();
        updateSelectionInfo();
        updateHistory();
        const save = $("recipientSaveButton");
        if (save) {
            const hasChanges = pendingChanges.size > 0;
            save.disabled = !hasChanges;
            save.title = hasChanges ? "Simpan perubahan" : "Disimpan";
            save.setAttribute("aria-label", save.title);
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
        addResize(th, index); row.appendChild(th);
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
        td.addEventListener("dblclick", () => { if (!deleteMode) edit(td, row, colIndex); });
        td.addEventListener("keydown", e => cellKey(e, td));
        if (active && active.row === rowIndex && active.col === colIndex) td.classList.add("active-cell");
        if (inSelection(rowIndex, colIndex)) td.classList.add("selected-cell");
    }
    function addResize(th, index) {
        const handle = document.createElement("span"); handle.className = "column-resize-handle";
        handle.addEventListener("mousedown", event => {
            event.preventDefault(); event.stopPropagation(); const x = event.clientX, width = widths[index];
            const move = e => { widths[index] = Math.max(70, width + e.clientX - x); document.querySelectorAll(`[data-resize-column="${index}"]`).forEach(n => { n.style.width = `${widths[index]}px`; n.style.minWidth = `${widths[index]}px`; }); };
            const stop = () => { document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", stop); };
            document.addEventListener("mousemove", move); document.addEventListener("mouseup", stop);
        }); th.appendChild(handle);
    }
    function applyWidth(element, index) {
        const width = widths[index] || 160;
        element.style.width = `${width}px`;
        element.style.minWidth = `${width}px`;
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
    async function edit(cell, row, col, initial) {
        if (editing || col === 0 || columns[col - 1][0] === "sourceFile") return;
        editing = true;
        cell.classList.remove("active-cell", "selected-cell");
        cell.classList.add("editing-cell");
        const key = columns[col - 1][0], old = value(row, key), input = document.createElement("input");
        input.className = "inline-edit-input"; input.value = initial === undefined ? old : initial; cell.textContent = ""; cell.appendChild(input); input.focus(); if (initial === undefined) input.select();
        let finished = false, moving = false;
        const finish = async save => {
            if (finished) return; finished = true; const next = input.value, was = old;
            editing = false; cell.classList.remove("editing-cell");
            if (!save || next === was) { render(); return; }
            try {
                row[key] = next;
                const pendingKey = `${rowKey(row)}:${key}`;
                const existing = pendingChanges.get(pendingKey);
                if (next === (existing?.old ?? was)) pendingChanges.delete(pendingKey);
                else pendingChanges.set(pendingKey, { row, key, old: existing?.old ?? was, next });
                historyPush({ type: "changes", changes: [{ row, key, old: was, next }] }); render();
            }
            catch (e) { error(e); render(); }
        };
        const handleEditKey = e => {
            if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); finish(false); }
            else if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault(); e.stopPropagation();
                moving = true;
                finish(true).then(() => move(
                    e.key === "Enter" ? (e.shiftKey ? "ArrowUp" : "ArrowDown") : "ArrowRight",
                    false,
                    e.key === "Tab" && e.shiftKey
                ));
            } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
                e.preventDefault();
                e.stopPropagation();
                const start = input.selectionStart ?? input.value.length;
                const end = input.selectionEnd ?? start;
                input.setRangeText(e.key, start, end, "end");
            }
        };
        input.onkeydown = handleEditKey;
        input.addEventListener("blur", () => { if (!moving) finish(true); });
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
            if (action.type === "changes") for (const change of action.changes) {
                const next = redo ? change.next : change.old;
                change.row[change.key] = next;
                const pendingKey = `${rowKey(change.row)}:${change.key}`;
                if (next === change.old) pendingChanges.delete(pendingKey);
                else pendingChanges.set(pendingKey, { row: change.row, key: change.key, old: change.old, next });
            if (action.type === "add" && !redo) {
                const row = data.find(r => value(r, "nama") === value(action.changes, "nama") && value(r, "kadPengenalan") === value(action.changes, "kadPengenalan"));
                if (row) await api("DELETE", { record: { datasetId: row.datasetId, rowIndex: row.rowIndex } });
            }
            if (action.type === "add" && redo) await api("POST", { datasetId: action.datasetId, changes: action.changes });
            if (action.type === "delete" && redo) for (const row of action.rows) await api("DELETE", { record: { datasetId: row.datasetId, rowIndex: row.rowIndex } });
            if (action.type === "delete" && !redo) for (const row of action.rows) await api("POST", { datasetId: row.datasetId, changes: row });
            }
            (redo ? undoStack : redoStack).push(action); await load();
        } catch (e) { source.push(action); error(e); }
    }
    function updateHistory() { /* Undo/redo are intentionally keyboard-only. */ }
    function keyboard(event) {
        if (!$("recipientTableBody")) return;
        if (editing) return; const mod = event.ctrlKey || event.metaKey;
        if (event.key === "Escape" && deleteMode) {
            deleteMode = false;
            deleteActionStyles(false);
            render();
            return;
        }
        if (mod && event.key.toLowerCase() === "z") { event.preventDefault(); historyRun(event.shiftKey); }
        else if (mod && event.key.toLowerCase() === "y") { event.preventDefault(); historyRun(true); }
    }
    function openAdd() { const form = $("recipientAddForm"); if (form) { form.style.display = "flex"; const input = $("recipientAddNama"); if (input) input.focus(); } }
    async function addRecord() {
        const fields = [["nama", "recipientAddNama"], ["kadPengenalan", "recipientAddKP"], ["telefon", "recipientAddTelefon"], ["email", "recipientAddEmail"], ["status", "recipientAddStatus"], ["pic", "recipientAddPIC"], ["catatan", "recipientAddCatatan"]];
        const changes = {}; fields.forEach(([key, id]) => { const input = $(id); changes[key] = input ? input.value : ""; });
        const datasetId = $("recipientAddDataset") && $("recipientAddDataset").value;
        try { await api("POST", { datasetId, changes }); historyPush({ type: "add", datasetId, changes }); const form = $("recipientAddForm"); if (form) form.style.display = "none"; await load(); }
        catch (e) { error(e); }
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
        if (save) {
            save.disabled = true;
            save.title = "Menyimpan...";
            save.setAttribute("aria-label", save.title);
        }
        try {
            for (const { row, key, next } of pendingChanges.values()) {
                await api("PUT", { record: { datasetId: row.datasetId, rowIndex: row.rowIndex }, changes: { [key]: next } });
            }
            pendingChanges.clear(); render();
        } catch (e) { error(e); render(); }
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
    document.addEventListener("app:page-loaded", init);
    window.addEventListener("beforeunload", event => {
        if (!pendingChanges.size) return;
        event.preventDefault();
        event.returnValue = "";
    });
})();
