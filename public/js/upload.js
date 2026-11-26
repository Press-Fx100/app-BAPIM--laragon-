(() => {
let selectedFile = null;
let selectedType = null;
let workbook = null;
let excelSheets = [];
let csvRows = null;
let activeSheet = 0;

const PREVIEW_ROWS = 10;
const USAHAWAN10K_HEADERS = [
    "NAMA",
    "KAD PENGENALAN",
    "TELEFON",
    "LOKASI",
    "PRODUK",
    "TARIKH SESI",
    "STATUS",
    "CATATAN"
];
const USAHAWAN10K_FIELDS = [
    ["name", "NAMA"],
    ["identity", "KAD PENGENALAN"],
    ["phone", "TELEFON"],
    ["location", "LOKASI"],
    ["product", "PRODUK"],
    ["sessionDate", "TARIKH SESI"],
    ["status", "STATUS"],
    ["notes", "CATATAN"]
];

let uploadOverlay;
let uploadCard;
let closeUploadButton;
let uploadDropZone;
let browseUploadButton;
let datasetFileInput;
let uploadPreviewSection;
let uploadFileName;
let uploadFileMeta;
let removeUploadFileButton;
let uploadDatasetName;
let uploadUnitInCharge;
let uploadSheetSection;
let uploadSheetList;
let uploadSelectedSheetCount;
let uploadSelectAllSheets;
let uploadDeselectAllSheets;
let uploadPreviewRows;
let uploadPreviewTable;
let uploadStatusMessage;
let uploadCardFooter;
let importUploadButton;
let uploadDatasetType;
let uploadMode = "penerima";
let participantHeaderMapping = {
    name: "",
    identity: "",
    category: "",
    incomeBefore: "",
    incomeAfter: "",
    status: "",
    notes: "",
    program: ""
};
let participantHeaderMappingContainer;
let participantNameHeader;
let participantIdentityHeader;
let participantCategoryHeader;
let participantIncomeBeforeHeader;
let participantIncomeAfterHeader;
let participantStatusHeader;
let participantNotesHeader;
let participantProgramHeader;
let recipientHeaderMapping = {
    name: "", identity: "", phone: "", email: "", status: "", notes: "", pic: ""
};
let recipientHeaderMappingContainer;
let recipientHeaderSelects = {};
let usahawan10kHeaderMapping = {
    name: "", identity: "", phone: "", location: "",
    product: "", sessionDate: "", status: "", notes: ""
};
let usahawan10kHeaderMappingContainer;
let usahawan10kHeaderSelects = {};

function formatFileSize(bytes) {
    const size = Number(bytes);

    if (!Number.isFinite(size) || size < 1024) {
        return `${Math.max(0, size || 0)} B`;
    }

    if (size < 1024 * 1024) {
        return `${(size / 1024).toFixed(1)} KB`;
    }

    if (size < 1024 * 1024 * 1024) {
        return `${(size / 1024 / 1024).toFixed(1)} MB`;
    }

    return `${(size / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function openUpload() {
    if (!uploadCard || !document.body.contains(uploadCard)) {
        initializeUploadController();
    }

    if (!uploadCard) {
        console.error("Upload modal is unavailable.");
        return;
    }

    uploadOverlay?.classList.add("show");
    uploadCard?.classList.add("show");
    uploadOverlay?.setAttribute("aria-hidden", "false");
    uploadCard?.setAttribute("aria-hidden", "false");
}

function closeUpload() {
    resetUpload(true);
    uploadOverlay?.classList.remove("show");
    uploadCard?.classList.remove("show");
    uploadOverlay?.setAttribute("aria-hidden", "true");
    uploadCard?.setAttribute("aria-hidden", "true");
}

function showUploadStatus(message, type = "") {
    uploadStatusMessage.textContent = message;
    uploadStatusMessage.className = "dataset-upload-status";

    if (type) {
        uploadStatusMessage.classList.add(type);
    }

    uploadStatusMessage.style.display = "block";
}

function setImportButtonLabel(label) {
    const labelElement = importUploadButton?.querySelector(
        ".dataset-upload-action-label"
    );
    if (labelElement) {
        labelElement.textContent = label;
    }
}

function hideUploadStatus() {
    uploadStatusMessage.style.display = "none";
    uploadStatusMessage.textContent = "";
    uploadStatusMessage.className = "dataset-upload-status";
}

function handleFile(file) {
    if (!file) {
        return;
    }

    const extension = file.name.split(".").pop().toLowerCase();

    if (!["csv", "xlsx", "xls"].includes(extension)) {
        alert("Sila pilih fail CSV atau Excel.");
        return;
    }

    selectedFile = file;
    selectedType = extension;
    workbook = null;
    excelSheets = [];
    csvRows = null;
    activeSheet = 0;

    uploadDropZone?.classList.add("hidden");
    uploadPreviewSection.style.display = "block";
    uploadSheetSection.style.display = "none";
    uploadCardFooter.style.display = "none";

    uploadSheetList.innerHTML = "";
    uploadPreviewTable.innerHTML = "";

    uploadSelectedSheetCount.textContent = "0 helaian dipilih";
    uploadPreviewRows.textContent = "-";

    uploadFileName.textContent = file.name;
    uploadFileMeta.textContent = `${extension.toUpperCase()} • ${formatFileSize(file.size)}`;

    uploadDatasetName.value = file.name.replace(/\.(csv|xlsx|xls)$/i, "");

    importUploadButton.disabled = true;
    setImportButtonLabel("Import Data");

    showUploadStatus("Membaca fail...");

    uploadDropZone.classList.add("loading");
    browseUploadButton.disabled = true;

    if (extension === "csv") {
        readCSV(file);
    } else {
        readExcel(file);
    }
}

function readCSV(file) {
    const reader = new FileReader();

    reader.onload = event => {
        try {
            const rows = parseCSV(event.target.result);

            if (!rows.length) {
                showEmptyUpload();
                return;
            }

            csvRows = rows;

            const dataRowCount = Math.max(rows.length - 1, 0);

            uploadPreviewRows.textContent =
                `${dataRowCount.toLocaleString()} baris`;

            uploadPreviewSection.style.display = "block";
            uploadCardFooter.style.display = "flex";

            renderParticipantHeaderMapping();
            renderRecipientHeaderMapping();
            renderUsahawan10kHeaderMapping();
            if (uploadMode === "usahawan10k") {
                if (usahawan10kHeadersAreValid()) {
                    const usahawanRows = buildUsahawan10kRows(true);
                    uploadPreviewRows.textContent = `${Math.max(usahawanRows.length - 1, 0).toLocaleString()} baris pratonton`;
                    renderTable(usahawanRows);
                    importUploadButton.disabled = false;
                } else {
                    uploadPreviewRows.textContent = "-";
                    uploadPreviewTable.replaceChildren();
                    importUploadButton.disabled = true;
                }
            } else if (uploadMode === "peserta") {
                if (participantHeadersAreValid()) {
                    const participantRows = buildParticipantRows(true);
                    uploadPreviewRows.textContent = `${Math.min(
                        Math.max(participantRows.length - 1, 0),
                        PREVIEW_ROWS
                    ).toLocaleString()} baris pratonton`;
                    renderTable(participantRows.slice(0, PREVIEW_ROWS + 1));
                    importUploadButton.disabled = false;
                } else {
                    importUploadButton.disabled = true;
                }
            } else {
                renderIdentityNormalizedPreview();
                importUploadButton.disabled = !recipientHeadersAreValid();
            }

            if (uploadMode === "usahawan10k" && !usahawan10kHeadersAreValid()) {
                showUploadStatus(
                    "Padankan Nama, Kad Pengenalan dan Telefon, dan pastikan setiap lajur yang dipilih berbeza.",
                    "error"
                );
            } else if (uploadMode === "peserta" && !participantHeadersAreValid()) {
                showUploadStatus(
                    "Pilih lajur NAMA, KAD PENGENALAN dan PROGRAM yang berbeza.",
                    "error"
                );
            } else {
                showUploadStatus("Fail sedia untuk diimport.", "success");
            }
        } catch (error) {
            console.error("CSV error:", error);

            showUploadStatus(
                "Gagal membaca fail CSV.",
                "error"
            );

            showEmptyUpload();
        } finally {
            finishReading();
        }
    };

    reader.onerror = () => {
        showUploadStatus(
            "Gagal membaca fail CSV.",
            "error"
        );

        finishReading();
    };

    reader.readAsText(file);
}

function readExcel(file) {
    const reader = new FileReader();

    reader.onload = event => {
        try {
            if (typeof XLSX === "undefined") {
                throw new Error("XLSX library tidak dimuatkan.");
            }

            const data = new Uint8Array(event.target.result);

            workbook = XLSX.read(data, {
                type: "array",
                cellFormula: false,
                cellHTML: false
            });

            if (!workbook.SheetNames?.length) {
                showEmptyUpload();
                return;
            }

            excelSheets = workbook.SheetNames.map(sheetName => {
                const worksheet = workbook.Sheets[sheetName];
                const range = worksheet?.["!ref"]
                    ? XLSX.utils.decode_range(worksheet["!ref"])
                    : null;

                return {
                    name: sheetName,
                    rowCount: range
                        ? Math.max(range.e.r - range.s.r, 0)
                        : 0,
                    selected: false
                };
            });

            uploadSheetSection.style.display = "block";
            uploadPreviewSection.style.display = "block";
            uploadCardFooter.style.display = "flex";

            createSheetList();
            renderParticipantHeaderMapping();
            renderRecipientHeaderMapping();
            updateSheetSelection();

            showUploadStatus(
                "Pilih worksheet yang ingin diimport."
            );
        } catch (error) {
            console.error("Excel read error:", error);

            showUploadStatus(
                `Gagal membaca fail Excel. ${error.message}`,
                "error"
            );

            showEmptyUpload();
        } finally {
            finishReading();
        }
    };

    reader.onerror = () => {
        showUploadStatus(
            "Gagal membaca fail Excel.",
            "error"
        );

        finishReading();
    };

    reader.readAsArrayBuffer(file);
}

function createSheetList() {
    uploadSheetList.innerHTML = "";

    excelSheets.forEach((sheet, index) => {
        const item = document.createElement("div");

        item.className = "dataset-upload-sheet-item";

        if (sheet.selected) {
            item.classList.add("selected");
        }

        const checkbox = document.createElement("input");

        checkbox.type = "checkbox";
        checkbox.checked = sheet.selected;

        const button = document.createElement("button");

        button.type = "button";
        button.textContent = sheet.name;

        const count = document.createElement("span");

        count.textContent =
            `${sheet.rowCount.toLocaleString()} baris`;

        function toggleSheetSelection() {
            sheet.selected = !sheet.selected;

            checkbox.checked = sheet.selected;

            item.classList.toggle(
                "selected",
                sheet.selected
            );

            activeSheet = sheet.selected
                ? index
                : excelSheets.findIndex(selectedSheet => selectedSheet.selected);
            updateSheetSelection();
        }

        item.addEventListener("click", event => {
            if (event.target === checkbox) {
                return;
            }

            toggleSheetSelection();
        });

        checkbox.addEventListener("click", event => {
            event.stopPropagation();
        });

        checkbox.addEventListener("change", () => {
            sheet.selected = checkbox.checked;

            item.classList.toggle(
                "selected",
                sheet.selected
            );

            activeSheet = sheet.selected
                ? index
                : excelSheets.findIndex(selectedSheet => selectedSheet.selected);
            updateSheetSelection();
        });

        button.addEventListener("click", event => {
            event.preventDefault();
            event.stopPropagation();
            toggleSheetSelection();
        });

        item.appendChild(checkbox);
        item.appendChild(button);
        item.appendChild(count);

        uploadSheetList.appendChild(item);
    });
}

function updateSheetSelection() {
    const selected = excelSheets.filter(
        sheet => sheet.selected
    );

    if (selectedType === "xlsx" || selectedType === "xls") {
        renderParticipantHeaderMapping();
        renderRecipientHeaderMapping();
    }
    renderUsahawan10kHeaderMapping();

    if (uploadMode === "usahawan10k" && selectedType === "csv") {
        uploadSelectedSheetCount.textContent = "Fail CSV dipilih";
        if (!usahawan10kHeadersAreValid()) {
            uploadPreviewRows.textContent = "-";
            uploadPreviewTable.replaceChildren();
            importUploadButton.disabled = true;
            showUploadStatus(
                "Padankan Nama, Kad Pengenalan dan Telefon, dan pastikan setiap lajur yang dipilih berbeza.",
                "error"
            );
            return;
        }
        const usahawanRows = buildUsahawan10kRows(true);
        uploadPreviewRows.textContent = `${Math.max(usahawanRows.length - 1, 0).toLocaleString()} baris pratonton`;
        renderTable(usahawanRows);
        importUploadButton.disabled = false;
        hideUploadStatus();
        return;
    }

    if (uploadMode === "peserta" && selectedType === "csv") {
        uploadSelectedSheetCount.textContent = "Fail CSV dipilih";

        if (!participantHeadersAreValid()) {
            importUploadButton.disabled = true;
            showUploadStatus(
                "Pilih lajur NAMA, KAD PENGENALAN dan PROGRAM yang berbeza.",
                "error"
            );
            return;
        }

        const participantRows = buildParticipantRows(true);
        uploadPreviewRows.textContent =
            `${Math.min(
                Math.max(participantRows.length - 1, 0),
                PREVIEW_ROWS
            ).toLocaleString()} baris pratonton`;
        renderTable(participantRows.slice(0, PREVIEW_ROWS + 1));
        importUploadButton.disabled = false;
        hideUploadStatus();
        return;
    }

    if (selectedType === "csv") {
        uploadSelectedSheetCount.textContent = "Fail CSV dipilih";
        renderParticipantHeaderMapping();
        renderRecipientHeaderMapping();

        if (uploadMode === "peserta" && participantHeadersAreValid()) {
            const participantRows = buildParticipantRows(true);
            uploadPreviewRows.textContent = `${Math.min(
                Math.max(participantRows.length - 1, 0),
                PREVIEW_ROWS
            ).toLocaleString()} baris pratonton`;
            renderTable(participantRows.slice(0, PREVIEW_ROWS + 1));
            importUploadButton.disabled = false;
            hideUploadStatus();
        } else {
            renderIdentityNormalizedPreview();
            importUploadButton.disabled = !recipientHeadersAreValid();
            if (!recipientHeadersAreValid()) {
                showUploadStatus(
                    "Pilih lajur NAMA dan KAD PENGENALAN.",
                    "error"
                );
            } else {
                hideUploadStatus();
            }
        }
        return;
    }

    uploadSelectedSheetCount.textContent =
        `${selected.length} daripada ${excelSheets.length} sheet dipilih`;

    if (!selected.length) {
        uploadPreviewRows.textContent = "-";
        uploadPreviewTable.replaceChildren();
        importUploadButton.disabled = true;
        showUploadStatus("Pilih sekurang-kurangnya satu Excel sheet.");
        return;
    }

    if (!excelSheets[activeSheet]?.selected) {
        activeSheet = excelSheets.findIndex(sheet => sheet.selected);
    }

    if (uploadMode === "usahawan10k") {
        if (!usahawan10kHeadersAreValid()) {
            uploadPreviewRows.textContent = "-";
            uploadPreviewTable.replaceChildren();
            importUploadButton.disabled = true;
            showUploadStatus(
                "Setiap helaian terpilih mesti mempunyai lajur yang dipadankan untuk Nama, Kad Pengenalan dan Telefon.",
                "error"
            );
            return;
        }
        const usahawanRows = buildUsahawan10kRows(true);
        uploadPreviewRows.textContent = `${Math.max(usahawanRows.length - 1, 0).toLocaleString()} baris pratonton`;
        renderTable(usahawanRows);
        importUploadButton.disabled = false;
        hideUploadStatus();
        return;
    }

    if (uploadMode === "peserta") {
        if (!participantHeadersAreValid()) {
            uploadPreviewRows.textContent = "-";
            uploadPreviewTable.replaceChildren();
            importUploadButton.disabled = true;
            showUploadStatus(
                "Pilih lajur NAMA, KAD PENGENALAN dan PROGRAM yang berbeza.",
                "error"
            );
            return;
        }

        const participantRows = buildParticipantRows(true);
        uploadPreviewRows.textContent = `${Math.min(
            Math.max(participantRows.length - 1, 0),
            PREVIEW_ROWS
        ).toLocaleString()} baris pratonton`;
        renderTable(participantRows.slice(0, PREVIEW_ROWS + 1));
        importUploadButton.disabled = false;
        hideUploadStatus();
        return;
    }

    showSheet(activeSheet);
    importUploadButton.disabled = !recipientHeadersAreValid();
    if (recipientHeadersAreValid()) {
        hideUploadStatus();
    } else {
        showUploadStatus("Pilih lajur NAMA dan KAD PENGENALAN.", "error");
    }
}

function renderIdentityNormalizedPreview() {
    if (!csvRows?.length) {
        return;
    }

    const identityHeader = uploadMode === "penerima"
        ? recipientHeaderMapping.identity
        : participantHeaderMapping.identity;
    const identityIndex = csvRows[0].indexOf(identityHeader);
    const rows = csvRows.slice(0, PREVIEW_ROWS + 1).map(row => [...row]);

    if (identityIndex >= 0) {
        rows.slice(1).forEach(row => {
            row[identityIndex] = participantIdentityText(row[identityIndex]);
        });
    }

    renderTable(rows);
}

function showSheet(index) {
    if (!excelSheets[index]) {
        return;
    }

    activeSheet = index;

    const sheet = excelSheets[index];

    uploadPreviewRows.textContent =
        `${sheet.rowCount.toLocaleString()} baris`;

    const worksheet = workbook?.Sheets[workbook.SheetNames[index]];
    if (!worksheet) {
        throw new Error(`Excel worksheet "${sheet.name}" is unavailable.`);
    }

    const range = XLSX.utils.decode_range(worksheet["!ref"] || "A1");
    const headers = [];
    for (let column = range.s.c; column <= range.e.c; column += 1) {
        headers.push(participantCellText(
            worksheet[XLSX.utils.encode_cell({ r: range.s.r, c: column })]
        ));
    }
    const identityHeader = uploadMode === "penerima"
        ? recipientHeaderMapping.identity
        : participantHeaderMapping.identity;
    const identityIndex = headers.indexOf(identityHeader);
    const previewRows = [headers];
    const lastPreviewRow = Math.min(range.e.r, range.s.r + PREVIEW_ROWS);

    for (let row = range.s.r + 1; row <= lastPreviewRow; row += 1) {
        const values = [];
        for (let column = range.s.c; column <= range.e.c; column += 1) {
            const address = XLSX.utils.encode_cell({ r: row, c: column });
            values.push(column - range.s.c === identityIndex
                ? participantIdentityCellText(worksheet[address])
                : participantCellText(worksheet[address]));
        }
        previewRows.push(values);
    }

    renderTable(previewRows);
}

function renderTable(rows) {
    if (!uploadPreviewTable) {
        throw new Error("Upload preview table is unavailable.");
    }

    uploadPreviewTable.innerHTML = "";

    if (!rows?.length) {
        return;
    }

    const normalizedRows = rows.map(row =>
        Array.isArray(row) ? row : [row]
    );
    const columnCount = Math.max(
        1,
        ...normalizedRows.map(row => row.length)
    );

    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");

    const numberHeader = document.createElement("th");

    numberHeader.textContent = "#";

    headerRow.appendChild(numberHeader);

    for (let i = 0; i < columnCount; i++) {
        const th = document.createElement("th");

        th.textContent =
            normalizedRows[0]?.[i] ||
            `Column ${i + 1}`;

        headerRow.appendChild(th);
    }

    thead.appendChild(headerRow);
    uploadPreviewTable.appendChild(thead);

    const tbody = document.createElement("tbody");

    normalizedRows.slice(1).forEach((row, rowIndex) => {
        const tr = document.createElement("tr");

        const numberCell = document.createElement("td");

        numberCell.textContent = rowIndex + 1;
        numberCell.className = "row-number";

        tr.appendChild(numberCell);

        for (let i = 0; i < columnCount; i++) {
            const td = document.createElement("td");

            td.textContent = row[i] ?? "";

            tr.appendChild(td);
        }

        tbody.appendChild(tr);
    });

    uploadPreviewTable.appendChild(tbody);
}

function parseCSV(csv) {
    const source = String(csv || "").replace(/^\uFEFF/, "");
    const firstLine = source.split(/\r?\n/, 1)[0] || "";
    const delimiters = [",", ";", "\t"];
    const delimiter = delimiters.reduce((best, candidate) =>
        countDelimiter(firstLine, candidate) >
        countDelimiter(firstLine, best)
            ? candidate
            : best
    );
    const rows = [];

    let row = [];
    let value = "";
    let insideQuotes = false;

    for (let i = 0; i < source.length; i++) {
        const char = source[i];
        const next = source[i + 1];

        if (char === '"') {
            if (insideQuotes && next === '"') {
                value += '"';
                i++;
            } else {
                insideQuotes = !insideQuotes;
            }
        } else if (char === delimiter && !insideQuotes) {
            row.push(value);
            value = "";
        } else if (
            (char === "\n" || char === "\r") &&
            !insideQuotes
        ) {
            if (char === "\r" && next === "\n") {
                i++;
            }

            row.push(value);
            value = "";

            if (
                row.some(
                    cell => String(cell).trim() !== ""
                )
            ) {
                rows.push(row);
            }

            row = [];
        } else {
            value += char;
        }
    }

    if (value !== "" || row.length > 0) {
        row.push(value);

        if (
            row.some(
                cell => String(cell).trim() !== ""
            )
        ) {
            rows.push(row);
        }
    }

    return rows;
}

function countDelimiter(line, delimiter) {
    return line.split(delimiter).length - 1;
}

function participantCellText(cell) {
    return String(cell?.w ?? cell?.v ?? "").trim();
}

function participantIdentityCellText(cell) {
    if (cell?.t === "n" && Number.isFinite(cell.v)) {
        const zeroFormat = typeof cell.z === "string" && /^0+$/.test(cell.z)
            ? cell.z.length
            : 0;
        const value = Number.isInteger(cell.v)
            ? String(cell.v).padStart(zeroFormat, "0")
            : String(cell.v);
        return participantIdentityText(value);
    }

    return participantIdentityText(participantCellText(cell));
}

function expandScientificNumber(value) {
    const text = String(value ?? "").trim();
    const match = text.match(/^([+-]?)(\d+)(?:\.(\d+))?[eE]([+-]?\d+)$/);

    if (!match) {
        return text;
    }

    const sign = match[1] === "-" ? "-" : "";
    const digits = `${match[2]}${match[3] || ""}`.replace(/^0+(?=\d)/, "");
    const decimalPlaces = (match[3] || "").length;
    const exponent = Number(match[4]);
    const decimalIndex = match[2].length + exponent;

    if (!Number.isInteger(exponent) || !digits) {
        return text;
    }

    if (decimalIndex <= 0) {
        return `${sign}0.${"0".repeat(-decimalIndex)}${digits}`;
    }

    if (decimalIndex >= digits.length) {
        return `${sign}${digits}${"0".repeat(decimalIndex - digits.length)}`;
    }

    return `${sign}${digits.slice(0, decimalIndex)}.${digits.slice(decimalIndex)}`;
}

function participantIdentityText(value) {
    return expandScientificNumber(value)
        .replace(/[^a-zA-Z0-9]/g, "");
}

function getParticipantHeaders() {
    if (selectedType === "csv") {
        return (csvRows?.[0] || [])
            .map(value => String(value ?? "").trim())
            .filter(Boolean);
    }

    const headers = new Set();

    excelSheets
        .filter(sheet => sheet.selected)
        .forEach(sheet => {
            const worksheet = workbook?.Sheets[sheet.name];

            if (!worksheet?.["!ref"]) {
                return;
            }

            const range = XLSX.utils.decode_range(worksheet["!ref"]);

            for (let column = range.s.c; column <= range.e.c; column += 1) {
                const address = XLSX.utils.encode_cell({
                    r: range.s.r,
                    c: column
                });
                const header = participantCellText(worksheet[address]);

                if (header) {
                    headers.add(header);
                }
            }
        });

    return Array.from(headers);
}

function renderParticipantHeaderMapping() {
    if (uploadMode !== "peserta") {
        participantHeaderMappingContainer.style.display = "none";
        return;
    }

    if (!workbook && selectedType !== "csv") {
        participantHeaderMappingContainer.style.display = "none";
        return;
    }

    const headers = getParticipantHeaders();
    participantHeaderMappingContainer.style.display = "block";
    participantHeaderMappingContainer.querySelector(
        ".dataset-upload-section-title span"
    ).textContent =
        "Pilih lajur sumber. Rekod dengan Kad Pengenalan sama akan digabungkan.";

    [
        [participantNameHeader, "name", true],
        [participantIdentityHeader, "identity", true],
        [participantCategoryHeader, "category", true],
        [participantIncomeBeforeHeader, "incomeBefore", true],
        [participantIncomeAfterHeader, "incomeAfter", true],
        [participantStatusHeader, "status", true],
        [participantNotesHeader, "notes", true],
        [participantProgramHeader, "program", true]
    ].forEach(([select, field, hasUnselectedOption]) => {
        const currentValue = participantHeaderMapping[field];
        const expectedHeader = {
            name: "NAMA",
            identity: "KAD PENGENALAN",
            category: "KATEGORI",
            incomeBefore: "PENDAPATAN AWAL/SEBELUM",
            incomeAfter: "PENDAPATAN SEMASA/SELEPAS",
            status: "STATUS",
            notes: "CATATAN",
            program: "PROGRAM"
        }[field];

        select.innerHTML = "";

        if (hasUnselectedOption || headers.length === 0) {
            const optional = document.createElement("option");
            optional.value = "";
            optional.textContent = "Tidak dipilih";
            select.appendChild(optional);
        }

        headers.forEach(header => {
            const option = document.createElement("option");
            option.value = header;
            option.textContent = header;
            select.appendChild(option);
        });

        select.value = headers.includes(currentValue)
            ? currentValue
            : findParticipantHeader(headers, field, expectedHeader);
    });

    participantHeaderMapping.name = participantNameHeader.value;
    participantHeaderMapping.identity = participantIdentityHeader.value;
    participantHeaderMapping.category = participantCategoryHeader.value;
    participantHeaderMapping.incomeBefore = participantIncomeBeforeHeader.value;
    participantHeaderMapping.incomeAfter = participantIncomeAfterHeader.value;
    participantHeaderMapping.status = participantStatusHeader.value;
    participantHeaderMapping.notes = participantNotesHeader.value;
    participantHeaderMapping.program = participantProgramHeader.value;
}

function participantHeadersAreValid() {
    const mappedHeaders = [
        participantHeaderMapping.name,
        participantHeaderMapping.identity,
        participantHeaderMapping.category,
        participantHeaderMapping.incomeBefore,
        participantHeaderMapping.incomeAfter,
        participantHeaderMapping.status,
        participantHeaderMapping.program
    ].filter(Boolean);

    return Boolean(
        participantHeaderMapping.name &&
        participantHeaderMapping.identity &&
        participantHeaderMapping.name !== participantHeaderMapping.identity &&
        new Set(mappedHeaders).size === mappedHeaders.length &&
        participantHeaderMapping.program
    );
}

function recipientHeadersAreValid() {
    return Boolean(
        recipientHeaderMapping.name &&
        recipientHeaderMapping.identity &&
        recipientHeaderMapping.name !== recipientHeaderMapping.identity
    );
}

function getSourceHeaders() {
    if (selectedType === "csv") {
        return (csvRows?.[0] || []).map(value => String(value ?? "").trim()).filter(Boolean);
    }
    return getParticipantHeaders();
}

function getUsahawan10kSheetHeaders(sheet) {
    const worksheet = workbook?.Sheets[sheet.name];
    if (!worksheet?.["!ref"]) return [];
    const range = XLSX.utils.decode_range(worksheet["!ref"]);
    const headers = [];
    for (let column = range.s.c; column <= range.e.c; column += 1) {
        headers.push(participantCellText(
            worksheet[XLSX.utils.encode_cell({ r: range.s.r, c: column })]
        ).trim());
    }
    return headers;
}

function getUsahawan10kSourceHeaders() {
    if (selectedType === "csv") {
        return (csvRows?.[0] || [])
            .map(value => String(value ?? "").trim())
            .filter(Boolean);
    }

    const headers = new Set();
    excelSheets
        .filter(sheet => sheet.selected)
        .forEach(sheet => {
            getUsahawan10kSheetHeaders(sheet).filter(Boolean).forEach(header => headers.add(header));
        });
    return Array.from(headers);
}

function renderUsahawan10kHeaderMapping() {
    if (!usahawan10kHeaderMappingContainer) return;
    if (uploadMode !== "usahawan10k" || !["csv", "xlsx", "xls"].includes(selectedType)) {
        usahawan10kHeaderMappingContainer.style.display = "none";
        return;
    }

    const headers = getUsahawan10kSourceHeaders();
    usahawan10kHeaderMappingContainer.style.display = "block";
    usahawan10kHeaderMappingContainer.querySelector(
        ".dataset-upload-section-title span"
    ).textContent = headers.length
        ? "Pilih lajur sumber yang sepadan dengan setiap medan."
        : "Tiada pengepala sumber ditemui.";

    USAHAWAN10K_FIELDS.forEach(([field, expectedHeader]) => {
        const select = usahawan10kHeaderSelects[field];
        const currentValue = usahawan10kHeaderMapping[field];
        select.replaceChildren();

        const unselected = document.createElement("option");
        unselected.value = "";
        unselected.textContent = "Pilih lajur";
        select.appendChild(unselected);

        headers.forEach(header => {
            const option = document.createElement("option");
            option.value = header;
            option.textContent = header;
            select.appendChild(option);
        });

        select.value = headers.includes(currentValue)
            ? currentValue
            : findExactHeader(headers, expectedHeader);
        usahawan10kHeaderMapping[field] = select.value;
    });
}

function usahawan10kHeadersAreValid() {
    const mappedHeaders = USAHAWAN10K_FIELDS.map(([field]) => usahawan10kHeaderMapping[field]);
    const requiredHeaders = [
        usahawan10kHeaderMapping.name,
        usahawan10kHeaderMapping.identity,
        usahawan10kHeaderMapping.phone
    ];
    const selectedHeaders = mappedHeaders.filter(Boolean);
    if (
        !requiredHeaders.every(Boolean) ||
        new Set(selectedHeaders).size !== selectedHeaders.length
    ) {
        return false;
    }
    if (selectedType === "csv") {
        const headers = (csvRows?.[0] || []).map(value => String(value ?? "").trim());
        return requiredHeaders.every(header => headers.includes(header));
    }
    if (!["xlsx", "xls"].includes(selectedType)) return false;
    const selectedSheets = excelSheets.filter(sheet => sheet.selected);
    return selectedSheets.length > 0 && selectedSheets.every(sheet => {
        const headers = getUsahawan10kSheetHeaders(sheet);
        return requiredHeaders.every(header => headers.includes(header));
    });
}

function buildUsahawan10kRows(previewOnly = false) {
    const output = [USAHAWAN10K_HEADERS];
    const appendRows = (headers, rows, identityText = value => String(value ?? "").trim()) => {
        const normalizedHeaders = headers.map(value => String(value ?? "").trim());
        const indexes = USAHAWAN10K_FIELDS.map(([field]) =>
            usahawan10kHeaderMapping[field]
                ? normalizedHeaders.indexOf(usahawan10kHeaderMapping[field])
                : -1
        );
        if (indexes.slice(0, 3).some(index => index < 0)) return;

        for (const row of rows) {
            const values = indexes.map((index, fieldIndex) => {
                if (index < 0) return "";
                const value = row[index] ?? "";
                return fieldIndex === 1 ? identityText(value) : String(value).trim();
            });
            if (values.some(value => value !== "")) output.push(values);
            if (previewOnly && output.length > PREVIEW_ROWS) break;
        }
    };

    if (selectedType === "csv") {
        appendRows(
            csvRows?.[0] || [],
            (csvRows || []).slice(1, previewOnly ? PREVIEW_ROWS + 1 : undefined),
            participantIdentityText
        );
        return output;
    }

    for (const sheet of excelSheets.filter(item => item.selected)) {
        const worksheet = workbook?.Sheets[sheet.name];
        if (!worksheet?.["!ref"]) continue;
        const range = XLSX.utils.decode_range(worksheet["!ref"]);
        const headers = getUsahawan10kSheetHeaders(sheet);
        const indexes = USAHAWAN10K_FIELDS.map(([field]) =>
            usahawan10kHeaderMapping[field]
                ? headers.indexOf(usahawan10kHeaderMapping[field])
                : -1
        );
        if (indexes.slice(0, 3).some(index => index < 0)) continue;

        for (let rowIndex = range.s.r + 1; rowIndex <= range.e.r; rowIndex += 1) {
            const values = indexes.map((columnIndex, fieldIndex) => {
                if (columnIndex < 0) return "";
                const cell = worksheet[XLSX.utils.encode_cell({
                    r: rowIndex,
                    c: range.s.c + columnIndex
                })];
                return fieldIndex === 1
                    ? participantIdentityCellText(cell)
                    : participantCellText(cell);
            });
            if (values.some(value => value !== "")) output.push(values);
            if (previewOnly && output.length > PREVIEW_ROWS) return output;
        }
    }
    return output;
}

function findExactHeader(headers, expectedName) {
    const expected = String(expectedName).trim().toLocaleLowerCase();
    return headers.find(header =>
        String(header).trim().toLocaleLowerCase() === expected
    ) || "";
}

function findParticipantHeader(headers, field, expectedName) {
    const exact = findExactHeader(headers, expectedName);

    if (exact || field !== "program") {
        return exact;
    }

    const programHeader = headers.find(header =>
        /program/i.test(header)
    );

    return programHeader || "";
}

function renderRecipientHeaderMapping() {
    if (!recipientHeaderMappingContainer) {
        return;
    }

    if (
        uploadMode !== "penerima" ||
        !Object.keys(recipientHeaderSelects).length
    ) {
        recipientHeaderMappingContainer.style.display = "none";
        return;
    }

    const headers = getSourceHeaders();
    recipientHeaderMappingContainer.style.display = "block";
    recipientHeaderMappingContainer.querySelector(
        ".dataset-upload-section-title span"
    ).textContent = headers.length
        ? "Pilih lajur sumber yang sepadan dengan setiap medan sistem."
        : "Tiada pengepala sumber ditemui.";
    Object.entries(recipientHeaderSelects).forEach(([field, select]) => {
        const currentValue = recipientHeaderMapping[field];
        const expectedHeader = {
            name: "NAMA",
            identity: "KAD PENGENALAN",
            phone: "TELEFON",
            email: "EMAIL",
            status: "STATUS",
            notes: "CATATAN",
            pic: "PIC"
        }[field];
        select.innerHTML = "";
        if (
            (field !== "name" && field !== "identity") ||
            headers.length === 0
        ) {
            const optional = document.createElement("option");
            optional.value = "";
            optional.textContent = "Tidak dipilih";
            select.appendChild(optional);
        }
        headers.forEach(header => {
            const option = document.createElement("option");
            option.value = header;
            option.textContent = header;
            select.appendChild(option);
        });
        select.value = headers.includes(currentValue)
            ? currentValue
            : findExactHeader(headers, expectedHeader);
    });
    Object.entries(recipientHeaderSelects).forEach(([field, select]) => {
        recipientHeaderMapping[field] = select.value;
    });
}

function buildRecipientRows() {
    const output = [
        ["NAMA", "KAD PENGENALAN", "TELEFON", "EMAIL", "STATUS", "CATATAN", "PIC"]
    ];
    const sourceRows = [];

    if (selectedType === "csv") {
        sourceRows.push(...(csvRows || []).slice(1));
        const headers = csvRows?.[0] || [];
        const fields = ["name", "identity", "phone", "email", "status", "notes", "pic"];
        const identityIndex = headers.indexOf(recipientHeaderMapping.identity);

        return output.concat(sourceRows
            .filter(row => participantIdentityText(row[identityIndex]))
            .map(row => fields.map(field => {
                if (!recipientHeaderMapping[field]) {
                    return "";
                }

                const value = row[headers.indexOf(recipientHeaderMapping[field])] ?? "";

                return field === "identity"
                    ? participantIdentityText(value)
                    : value;
            })));
    }

    excelSheets
        .filter(sheet => sheet.selected)
        .forEach(sheet => {
            const worksheet = workbook.Sheets[sheet.name];
            const range = XLSX.utils.decode_range(worksheet["!ref"] || "A1");
            const headers = [];
            for (let column = range.s.c; column <= range.e.c; column += 1) {
                headers[column] = participantCellText(worksheet[XLSX.utils.encode_cell({ r: range.s.r, c: column })]);
            }
            for (let row = range.s.r + 1; row <= range.e.r; row += 1) {
                const values = Object.keys(recipientHeaderSelects).map(field => {
                    const index = headers.indexOf(recipientHeaderMapping[field]);
                    return index >= 0
                        ? field === "identity"
                            ? participantIdentityCellText(
                                worksheet[XLSX.utils.encode_cell({ r: row, c: index })]
                            )
                            : participantCellText(
                                worksheet[XLSX.utils.encode_cell({ r: row, c: index })]
                            )
                        : "";
                });
                if (values[1]) sourceRows.push(values);
            }
        });

    return output.concat(sourceRows);
}

function buildParticipantRows(previewOnly = false) {
    const records = new Map();

    const addRecord = (
        name,
        identity,
        category,
        incomeBefore,
        incomeAfter,
        status,
        notes,
        program
    ) => {
        const cleanIdentity = participantIdentityText(identity);
        const identityKey = cleanIdentity.toUpperCase().replace(/[\s-]+/g, "");

        if (!cleanIdentity || !identityKey) {
            return;
        }

        if (!records.has(identityKey)) {
            records.set(identityKey, {
                name: String(name ?? "").trim(),
                identity: cleanIdentity,
                category: String(category ?? "").trim(),
                incomeBefore: String(incomeBefore ?? "").trim(),
                incomeAfter: String(incomeAfter ?? "").trim(),
                status: String(status ?? "").trim(),
                notes: String(notes ?? "").trim(),
                programs: [],
                programKeys: new Set()
            });
        }

        const record = records.get(identityKey);
        const cleanName = String(name ?? "").trim();
        const cleanCategory = String(category ?? "").trim();

        if (!record.name && cleanName) record.name = cleanName;
        if (!record.category && cleanCategory) record.category = cleanCategory;
        if (!record.incomeBefore && incomeBefore) {
            record.incomeBefore = String(incomeBefore).trim();
        }
        if (!record.incomeAfter && incomeAfter) {
            record.incomeAfter = String(incomeAfter).trim();
        }
        if (!record.status && status) record.status = String(status).trim();
        if (!record.notes && notes) record.notes = String(notes).trim();

        String(program ?? "")
            .split(",")
            .map(value => value.trim())
            .filter(Boolean)
            .forEach(cleanProgram => {
                const programKey = cleanProgram.toLocaleLowerCase();
                if (record.programKeys.has(programKey)) return;
                record.programKeys.add(programKey);
                record.programs.push(cleanProgram);
            });
    };

    const sourceSheets = [];

    if (selectedType === "csv") {
        if (csvRows?.length) {
            sourceSheets.push({
                name: selectedFile?.name || "CSV",
                headers: csvRows[0].map(value => String(value ?? "").trim()),
                rows: previewOnly
                    ? csvRows.slice(1, PREVIEW_ROWS + 1)
                    : csvRows.slice(1)
            });
        }
    } else if (workbook) {
        excelSheets.forEach((sheet, sheetIndex) => {
            if (!sheet.selected) return;

            const sheetName = workbook.SheetNames[sheetIndex];
            const worksheet = workbook.Sheets[sheetName];
            if (!worksheet?.["!ref"]) return;

            const range = XLSX.utils.decode_range(worksheet["!ref"]);
            const headers = [];

            for (let column = range.s.c; column <= range.e.c; column += 1) {
                headers[column] = participantCellText(
                    worksheet[XLSX.utils.encode_cell({ r: range.s.r, c: column })]
                );
            }

            const lastRow = previewOnly
                ? Math.min(range.e.r, range.s.r + PREVIEW_ROWS)
                : range.e.r;
            const rows = [];
            for (let row = range.s.r + 1; row <= lastRow; row += 1) {
                const values = [];
                for (let column = range.s.c; column <= range.e.c; column += 1) {
                    const address = XLSX.utils.encode_cell({ r: row, c: column });
                    values[column] =
                        column === headers.indexOf(participantHeaderMapping.identity)
                            ? participantIdentityCellText(worksheet[address])
                            : participantCellText(worksheet[address]);
                }
                rows.push(values);
            }

            sourceSheets.push({ name: sheetName, headers, rows });
        });
    }

    sourceSheets.forEach(sheet => {
        const nameIndex = sheet.headers.indexOf(participantHeaderMapping.name);
        const identityIndex = sheet.headers.indexOf(participantHeaderMapping.identity);
        const categoryIndex = participantHeaderMapping.category
            ? sheet.headers.indexOf(participantHeaderMapping.category)
            : -1;
        const incomeBeforeIndex = participantHeaderMapping.incomeBefore
            ? sheet.headers.indexOf(participantHeaderMapping.incomeBefore)
            : -1;
        const incomeAfterIndex = participantHeaderMapping.incomeAfter
            ? sheet.headers.indexOf(participantHeaderMapping.incomeAfter)
            : -1;
        const statusIndex = participantHeaderMapping.status
            ? sheet.headers.indexOf(participantHeaderMapping.status)
            : -1;
        const notesIndex = participantHeaderMapping.notes
            ? sheet.headers.indexOf(participantHeaderMapping.notes)
            : -1;
        const programIndex = sheet.headers.indexOf(participantHeaderMapping.program);

        if (nameIndex < 0 || identityIndex < 0 || programIndex < 0) {
            throw new Error(
                `Sumber "${sheet.name}" mesti mempunyai lajur NAMA, KAD PENGENALAN dan PROGRAM yang dipilih.`
            );
        }

        sheet.rows.forEach(row => {
            if (!String(row[programIndex] ?? "").trim()) return;
            addRecord(
                row[nameIndex],
                participantIdentityText(row[identityIndex]),
                categoryIndex >= 0 ? row[categoryIndex] : "",
                incomeBeforeIndex >= 0 ? row[incomeBeforeIndex] : "",
                incomeAfterIndex >= 0 ? row[incomeAfterIndex] : "",
                statusIndex >= 0 ? row[statusIndex] : "",
                notesIndex >= 0 ? row[notesIndex] : "",
                row[programIndex]
            );
        });
    });

    return [
        [
            "NAMA",
            "KAD PENGENALAN",
            "KATEGORI",
            "PENDAPATAN AWAL/SEBELUM",
            "PENDAPATAN SEMASA/SELEPAS",
            "STATUS",
            "CATATAN",
            "PROGRAM"
        ],
        ...Array.from(records.values()).map(record => [
            record.name,
            record.identity,
            record.category,
            record.incomeBefore,
            record.incomeAfter,
            record.status,
            record.notes,
            record.programs.join(", ")
        ])
    ];
}

function csvEscape(value) {
    const text = String(value ?? "");

    return /[",\r\n]/.test(text)
        ? `"${text.replace(/"/g, "\"\"")}"`
        : text;
}

async function importDataset() {
    if (!selectedFile) {
        alert("Sila pilih fail terlebih dahulu.");
        return;
    }

    if (
        (uploadMode === "peserta" && !participantHeadersAreValid()) ||
        (uploadMode === "penerima" && !recipientHeadersAreValid()) ||
        (uploadMode === "usahawan10k" && !usahawan10kHeadersAreValid())
    ) {
        alert(uploadMode === "usahawan10k"
            ? "Padankan Nama, Kad Pengenalan dan Telefon, dan pastikan setiap lajur yang dipilih berbeza."
            : "Sila pilih header untuk NAMA dan KAD PENGENALAN.");
        return;
    }

    if (!uploadUnitInCharge.value) {
        showUploadStatus("Sila pilih unit.", "error");
        uploadUnitInCharge.focus();
        return;
    }

    let selectedSheets = [];

    if (
        selectedType === "xlsx" ||
        selectedType === "xls"
    ) {
        selectedSheets = excelSheets.filter(
            sheet => sheet.selected
        );

        if (!selectedSheets.length) {
            alert(
                "Sila pilih sekurang-kurangnya satu Excel sheet."
            );

            updateSheetSelection();
            return;
        }
    }

    importUploadButton.disabled = true;
    setImportButtonLabel("Mengimport...");

    showUploadStatus("Memuat naik fail...");

    try {
        const formData = new FormData();

        if (["peserta", "penerima", "usahawan10k"].includes(uploadMode)) {
            const normalizedRows = uploadMode === "peserta"
                ? buildParticipantRows()
                : uploadMode === "usahawan10k"
                    ? buildUsahawan10kRows()
                    : buildRecipientRows();

            if (normalizedRows.length < 2) {
                throw new Error("Tiada data yang sah ditemui.");
            }

            const normalizedCsv = normalizedRows
                .map(row => row.map(csvEscape).join(","))
                .join("\r\n");

            formData.append(
                "file",
                new Blob([normalizedCsv], { type: "text/csv;charset=utf-8" }),
                `${uploadDatasetName.value.trim() || uploadMode}.csv`
            );
            formData.append(
                "name",
                uploadDatasetName.value.trim() ||
                (uploadMode === "peserta"
                    ? "Peserta Program"
                    : uploadMode === "usahawan10k"
                        ? "Usahawan 10K"
                        : "Penerima Bantuan")
            );
            formData.append("datasetType", uploadMode);
            formData.append("unitInCharge", uploadUnitInCharge.value);
        } else {
            formData.append("file", selectedFile);
            formData.append("datasetType", uploadMode);
            formData.append("unitInCharge", uploadUnitInCharge.value);
        }

        if (selectedType === "csv") {
            let name = uploadDatasetName.value.trim();

            if (!name) {
                name = selectedFile.name.replace(
                    /\.csv$/i,
                    ""
                );
            }

            formData.append("name", name);
        } else {
            const selectedSheetIndexes = excelSheets
                .map((sheet, index) =>
                    sheet.selected
                        ? index
                        : null
                )
                .filter(
                    index => index !== null
                );

            formData.append(
                "selectedSheets",
                JSON.stringify(selectedSheetIndexes)
            );
        }

        const response = await fetch(
            "/api/datasets",
            {
                method: "POST",
                body: formData
            }
        );

        const text = await response.text();

        let result;

        try {
            result = JSON.parse(text);
        } catch {
            console.error(
                "Server response:",
                text
            );

            throw new Error(
                `Server returned an invalid response (${response.status}). Check server console.`
            );
        }

        if (!response.ok) {
            throw new Error(
                result.error ||
                result.message ||
                "Import failed."
            );
        }

        if (selectedType === "csv" || uploadMode === "peserta" || uploadMode === "usahawan10k") {
            window.showAppAlert?.(
                `Berjaya import "${result.name || uploadDatasetName.value}" (${Number(result.rows || 0).toLocaleString()} baris).`,
                "success"
            );
        } else {
            const importedSheets =
                result.sheets || [];
            window.showAppAlert?.(
                `Berjaya import fail Excel: ${Number(result.imported || importedSheets.length).toLocaleString()} worksheets, ${Number(result.rows || 0).toLocaleString()} baris.`,
                "success"
            );
        }

        closeUpload();

        if (
            typeof window.loadDatasetList ===
            "function"
        ) {
            await window.loadDatasetList();
        }
    } catch (error) {
        console.error(
            "Import error:",
            error
        );

        showUploadStatus(
            error.message ||
            "Import failed.",
            "error"
        );

        importUploadButton.disabled =
            selectedType !== "csv" &&
            excelSheets.filter(
                sheet => sheet.selected
            ).length === 0;

        setImportButtonLabel("Import Data");
    }
}

function finishReading() {
    uploadDropZone.classList.remove(
        "loading"
    );

    browseUploadButton.disabled = false;
}

function showEmptyUpload() {
    uploadPreviewSection.style.display = "none";
    uploadSheetSection.style.display = "none";
    uploadCardFooter.style.display = "none";

    uploadPreviewTable.innerHTML = "";
    uploadSheetList.innerHTML = "";

    importUploadButton.disabled = true;
}

function resetUpload(resetSelections = false) {
    selectedFile = null;
    selectedType = null;
    workbook = null;
    excelSheets = [];
    csvRows = null;
    activeSheet = 0;
    participantHeaderMapping = {
        name: "",
        identity: "",
        category: "",
        incomeBefore: "",
        incomeAfter: "",
        status: "",
        notes: "",
        program: ""
    };
    recipientHeaderMapping = {
        name: "", identity: "", phone: "", email: "",
        status: "", notes: "", pic: ""
    };
    usahawan10kHeaderMapping = {
        name: "", identity: "", phone: "", location: "",
        product: "", sessionDate: "", status: "", notes: ""
    };

    datasetFileInput.value = "";

    uploadDropZone.classList.remove("hidden");
    uploadDropZone.classList.remove("loading");

    uploadPreviewSection.style.display = "none";
    uploadSheetSection.style.display = "none";
    uploadCardFooter.style.display = "none";

    uploadSheetList.innerHTML = "";
    uploadPreviewTable.innerHTML = "";

    uploadFileName.textContent = "-";
    uploadFileMeta.textContent = "-";

    uploadDatasetName.value = "";
    uploadUnitInCharge.value = "";
    uploadUnitInCharge.dispatchEvent(new Event("change", { bubbles: true }));

    uploadSelectedSheetCount.textContent =
        "0 sheet dipilih";

    uploadPreviewRows.textContent = "-";
    participantHeaderMappingContainer.style.display = "none";
    recipientHeaderMappingContainer.style.display = "none";
    usahawan10kHeaderMappingContainer.style.display = "none";

    importUploadButton.disabled = true;
    setImportButtonLabel("Import Data");

    browseUploadButton.disabled = false;

    hideUploadStatus();

    if (resetSelections) {
        if (uploadDatasetType) {
            uploadDatasetType.value = "penerima";
            uploadDatasetType.dispatchEvent(
                new Event("change", { bubbles: true })
            );
        }

    } else {
        uploadMode = uploadDatasetType?.value || "penerima";
    }
}

function initializeUploadController() {
    uploadOverlay = document.getElementById("uploadOverlay");
    uploadCard = document.getElementById("uploadFloatingCard");
    closeUploadButton = document.getElementById("closeUploadButton");
    uploadDropZone = document.getElementById("uploadDropZone");
    browseUploadButton = document.getElementById("browseUploadButton");
    datasetFileInput = document.getElementById("datasetFileInput");
    uploadPreviewSection = document.getElementById("uploadPreviewSection");
    uploadFileName = document.getElementById("uploadFileName");
    uploadFileMeta = document.getElementById("uploadFileMeta");
    removeUploadFileButton = document.getElementById("removeUploadFileButton");
    uploadDatasetName = document.getElementById("uploadDatasetName");
    uploadUnitInCharge = document.getElementById("uploadUnitInCharge");
    uploadSheetSection = document.getElementById("uploadSheetSection");
    uploadSheetList = document.getElementById("uploadSheetList");
    uploadSelectedSheetCount = document.getElementById("uploadSelectedSheetCount");
    uploadSelectAllSheets = document.getElementById("uploadSelectAllSheets");
    uploadDeselectAllSheets = document.getElementById("uploadDeselectAllSheets");
    uploadPreviewRows = document.getElementById("uploadPreviewRows");
    uploadPreviewTable = document.getElementById("uploadPreviewTable");
    uploadStatusMessage = document.getElementById("uploadStatusMessage");
    uploadCardFooter = document.getElementById("uploadCardFooter");
    importUploadButton = document.getElementById("importUploadButton");
    uploadDatasetType = document.getElementById("uploadDatasetType");
    participantHeaderMappingContainer = document.getElementById("participantHeaderMapping");
    participantNameHeader = document.getElementById("participantNameHeader");
    participantIdentityHeader = document.getElementById("participantIdentityHeader");
    participantCategoryHeader = document.getElementById("participantCategoryHeader");
    participantIncomeBeforeHeader = document.getElementById("participantIncomeBeforeHeader");
    participantIncomeAfterHeader = document.getElementById("participantIncomeAfterHeader");
    participantStatusHeader = document.getElementById("participantStatusHeader");
    participantNotesHeader = document.getElementById("participantNotesHeader");
    participantProgramHeader = document.getElementById("participantProgramHeader");
    recipientHeaderMappingContainer = document.getElementById("recipientHeaderMapping");
    recipientHeaderSelects = {
        name: document.getElementById("recipientNameHeader"),
        identity: document.getElementById("recipientIdentityHeader"),
        phone: document.getElementById("recipientPhoneHeader"),
        email: document.getElementById("recipientEmailHeader"),
        status: document.getElementById("recipientStatusHeader"),
        notes: document.getElementById("recipientNotesHeader"),
        pic: document.getElementById("recipientPicHeader")
    };
    usahawan10kHeaderMappingContainer = document.getElementById("usahawan10kHeaderMapping");
    usahawan10kHeaderSelects = {
        name: document.getElementById("usahawan10kNameHeader"),
        identity: document.getElementById("usahawan10kIdentityHeader"),
        phone: document.getElementById("usahawan10kPhoneHeader"),
        location: document.getElementById("usahawan10kLocationHeader"),
        product: document.getElementById("usahawan10kProductHeader"),
        sessionDate: document.getElementById("usahawan10kSessionDateHeader"),
        status: document.getElementById("usahawan10kStatusHeader"),
        notes: document.getElementById("usahawan10kNotesHeader")
    };
    uploadMode = uploadDatasetType?.value || "penerima";
    const usahawanHint = document.getElementById("usahawan10kUploadHint");
    if (usahawanHint) usahawanHint.hidden = uploadMode !== "usahawan10k";

    if (!uploadCard) {
        return;
    }

    if (uploadOverlay && uploadOverlay.parentElement !== document.body) {
        document.body.appendChild(uploadOverlay);
    }

    if (uploadCard.dataset.initialized === "true") {
        return;
    }

    uploadCard.dataset.initialized = "true";

    document.getElementById("openUploadButton")?.addEventListener(
        "click",
        openUpload
    );
    uploadOverlay?.addEventListener("click", event => {
        if (event.target === uploadOverlay) {
            closeUpload();
        }
    });

    uploadDatasetType?.addEventListener("change", () => {
        uploadMode = uploadDatasetType.value;
        const usahawanHint = document.getElementById("usahawan10kUploadHint");
        if (usahawanHint) usahawanHint.hidden = uploadMode !== "usahawan10k";
        if (uploadMode === "usahawan10k") {
            uploadUnitInCharge.value = "UPU";
            uploadUnitInCharge.dispatchEvent(new Event("change", { bubbles: true }));
        }

        if (selectedFile) {
            renderParticipantHeaderMapping();
            renderRecipientHeaderMapping();
            renderUsahawan10kHeaderMapping();
            updateSheetSelection();
        } else {
            renderParticipantHeaderMapping();
            renderRecipientHeaderMapping();
            renderUsahawan10kHeaderMapping();
        }
    });

    [
        participantNameHeader,
        participantIdentityHeader,
        participantCategoryHeader,
        participantIncomeBeforeHeader,
        participantIncomeAfterHeader,
        participantStatusHeader,
        participantNotesHeader,
        participantProgramHeader
    ].forEach(select => {
        select?.addEventListener("change", () => {
            participantHeaderMapping.name = participantNameHeader.value;
            participantHeaderMapping.identity = participantIdentityHeader.value;
            participantHeaderMapping.category = participantCategoryHeader.value;
            participantHeaderMapping.incomeBefore = participantIncomeBeforeHeader.value;
            participantHeaderMapping.incomeAfter = participantIncomeAfterHeader.value;
            participantHeaderMapping.status = participantStatusHeader.value;
            participantHeaderMapping.notes = participantNotesHeader.value;
            participantHeaderMapping.program = participantProgramHeader.value;
            updateSheetSelection();
        });
    });

    Object.entries(recipientHeaderSelects).forEach(([field, select]) => {
        select?.addEventListener("change", () => {
            recipientHeaderMapping[field] = select.value;
            updateSheetSelection();
        });
    });

    Object.entries(usahawan10kHeaderSelects).forEach(([field, select]) => {
        select?.addEventListener("change", () => {
            usahawan10kHeaderMapping[field] = select.value;
            updateSheetSelection();
        });
    });

    browseUploadButton?.addEventListener(
    "click",
    event => {
        event.stopPropagation();
        datasetFileInput.click();
    }
    );

    uploadDropZone?.addEventListener(
    "click",
    event => {
        if (
            event.target ===
            browseUploadButton
        ) {
            return;
        }

        datasetFileInput.click();
    }
    );

    datasetFileInput?.addEventListener(
    "change",
    () => {
        if (
            datasetFileInput.files?.length
        ) {
            handleFile(
                datasetFileInput.files[0]
                );
        }
    }
);

    uploadDropZone?.addEventListener(
    "dragover",
    event => {
        event.preventDefault();
        uploadDropZone.classList.add(
            "dragover"
            );
    }
);

    uploadDropZone?.addEventListener(
    "dragleave",
    () => {
        uploadDropZone.classList.remove(
            "dragover"
            );
    }
);

    uploadDropZone?.addEventListener(
    "drop",
    event => {
        event.preventDefault();

        uploadDropZone.classList.remove(
            "dragover"
            );

        const file =
            event.dataTransfer.files[0];

        if (file) {
            handleFile(file);
        }
    }
);

    uploadSelectAllSheets?.addEventListener(
    "click",
    () => {
        excelSheets.forEach(sheet => {
            sheet.selected = true;
        });

        createSheetList();
        updateSheetSelection();
    }
    );

    uploadDeselectAllSheets?.addEventListener(
    "click",
    () => {
        excelSheets.forEach(sheet => {
            sheet.selected = false;
        });

        createSheetList();
        updateSheetSelection();
    }
    );

    removeUploadFileButton?.addEventListener(
    "click",
    resetUpload
    );

    closeUploadButton?.addEventListener(
    "click",
    closeUpload
    );

    importUploadButton?.addEventListener(
    "click",
    importDataset
    );
}

document.addEventListener(
    "keydown",
    event => {
        if (
            event.key === "Escape" &&
            uploadCard?.classList.contains(
                "show"
            )
        ) {
            closeUpload();
        }
    }
);

document.addEventListener(
    "DOMContentLoaded",
    initializeUploadController
);
document.addEventListener(
    "app:page-loaded",
    () => {
        if (
            (typeof window.appPathname === "function"
                ? window.appPathname(window.location.pathname)
                : window.location.pathname) !== "/muat-naik" &&
            uploadOverlay?.parentElement === document.body
        ) {
            closeUpload();
            uploadOverlay.remove();
            uploadOverlay = null;
            uploadCard = null;
        }

        initializeUploadController();
    }
);

window.openUpload = openUpload;
window.closeUpload = closeUpload;
})();