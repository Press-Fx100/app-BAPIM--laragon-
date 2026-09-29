(() => {
let selectedFile = null;
let selectedType = null;
let workbook = null;
let excelSheets = [];
let csvRows = null;
let activeSheet = 0;

const PREVIEW_ROWS = 10;

let uploadOverlay;
let uploadCard;
let closeUploadButton;
let cancelUploadButton;
let uploadDropZone;
let browseUploadButton;
let datasetFileInput;
let uploadPreviewSection;
let uploadFileName;
let uploadFileMeta;
let removeUploadFileButton;
let uploadDatasetName;
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
let participantImportMethod = "color";
let participantHeaderMapping = {
    name: "",
    identity: "",
    category: "",
    program: ""
};
let participantHeaderMappingContainer;
let participantImportOptions;
let participantImportMethodSelect;
let participantProgramHeaderField;
let participantProgramRequired;
let participantNameHeader;
let participantIdentityHeader;
let participantCategoryHeader;
let participantProgramHeader;
let recipientHeaderMapping = {
    name: "", identity: "", phone: "", email: "", status: "", notes: "", pic: ""
};
let recipientHeaderMappingContainer;
let recipientHeaderSelects = {};

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

    if (uploadMode === "peserta" && extension === "csv") {
        participantImportMethod = "column";
        if (participantImportMethodSelect) {
            participantImportMethodSelect.value = "column";
            participantImportMethodSelect.dispatchEvent(
                new Event("change", { bubbles: true })
            );
        }
    }

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
    importUploadButton.textContent = "Import Data";

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

            renderTable(rows.slice(0, PREVIEW_ROWS + 1));

            renderParticipantHeaderMapping();
            renderRecipientHeaderMapping();
            let participantRows = null;
            if (uploadMode === "peserta") {
                if (participantHeadersAreValid()) {
                    participantRows = buildParticipantRows();
                    uploadPreviewRows.textContent =
                        `${Math.max(participantRows.length - 1, 0).toLocaleString()} baris`;
                    renderTable(participantRows.slice(0, PREVIEW_ROWS + 1));
                    importUploadButton.disabled = participantRows.length < 2;
                } else {
                    importUploadButton.disabled = true;
                }
            } else {
                importUploadButton.disabled = !recipientHeadersAreValid();
            }

            if (uploadMode === "peserta" && !participantHeadersAreValid()) {
                showUploadStatus(
                    "Pilih lajur NAMA, KAD PENGENALAN dan PROGRAM yang berbeza.",
                    "error"
                );
            } else if (
                uploadMode === "peserta" &&
                participantImportMethod === "column" &&
                participantRows?.length < 2
            ) {
                showUploadStatus(
                    "Tiada rekod dengan Kad Pengenalan dan program yang sah.",
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
                cellHTML: false,
                cellStyles: true
            });

            if (!workbook.SheetNames?.length) {
                showEmptyUpload();
                return;
            }

            excelSheets = workbook.SheetNames.map(sheetName => {
                const worksheet = workbook.Sheets[sheetName];

                const rows = XLSX.utils.sheet_to_json(
                    worksheet,
                    {
                        header: 1,
                        defval: "",
                        raw: false
                    }
                );

                return {
                    name: sheetName,
                    rows: rows.slice(0, PREVIEW_ROWS + 1),
                    rowCount: Math.max(rows.length - 1, 0),
                    selected: false
                };
            });

            uploadSheetSection.style.display = "block";
            uploadPreviewSection.style.display = "block";
            uploadCardFooter.style.display = "flex";

            createSheetList();
            showSheet(0);
            renderParticipantHeaderMapping();
            renderRecipientHeaderMapping();
            updateSheetSelection();

            if (uploadMode === "peserta" && participantHeadersAreValid()) {
                const participantRows = buildParticipantRows();

                uploadPreviewRows.textContent =
                    `${Math.max(participantRows.length - 1, 0).toLocaleString()} baris`;
                renderTable(participantRows.slice(0, PREVIEW_ROWS + 1));
                importUploadButton.disabled = participantRows.length < 2;
            }

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

            showSheet(index);
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

            showSheet(index);
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

    if (
        uploadMode === "peserta" &&
        selectedType === "csv" &&
        participantImportMethod === "column"
    ) {
        uploadSelectedSheetCount.textContent = "Fail CSV dipilih";

        if (!participantHeadersAreValid()) {
            importUploadButton.disabled = true;
            showUploadStatus(
                "Pilih lajur NAMA, KAD PENGENALAN dan PROGRAM yang berbeza.",
                "error"
            );
            return;
        }

        const participantRows = buildParticipantRows();
        uploadPreviewRows.textContent =
            `${Math.max(participantRows.length - 1, 0).toLocaleString()} baris`;
        renderTable(participantRows.slice(0, PREVIEW_ROWS + 1));
        importUploadButton.disabled = participantRows.length < 2;
        if (participantRows.length < 2) {
            showUploadStatus(
                participantHeadersAreValid()
                    ? "Tiada rekod dengan Kad Pengenalan dan program yang sah."
                    : "Pilih lajur NAMA, KAD PENGENALAN dan PROGRAM yang berbeza."
            );
        } else {
            hideUploadStatus();
        }
        return;
    }

    uploadSelectedSheetCount.textContent =
        `${selected.length} daripada ${excelSheets.length} sheet dipilih`;

    importUploadButton.disabled =
        selected.length === 0;

    if (uploadMode === "peserta" && selected.length && participantHeadersAreValid()) {
        const participantRows = buildParticipantRows();

        uploadPreviewRows.textContent =
            `${Math.max(participantRows.length - 1, 0).toLocaleString()} baris`;
        renderTable(participantRows.slice(0, PREVIEW_ROWS + 1));
        importUploadButton.disabled = participantRows.length < 2;
    } else if (uploadMode === "peserta") {
        importUploadButton.disabled = true;
    } else if (uploadMode === "penerima") {
        renderRecipientHeaderMapping();
        importUploadButton.disabled =
            (
                (selectedType === "xlsx" || selectedType === "xls") &&
                selected.length === 0
            ) ||
            !recipientHeadersAreValid();
    }

    if (selected.length === 0) {
        showUploadStatus(
            "Pilih sekurang-kurangnya satu worksheet."
        );
    } else if (uploadMode === "peserta" && !participantHeadersAreValid()) {
        showUploadStatus(
            "Pilih lajur NAMA, KAD PENGENALAN dan PROGRAM yang berbeza."
        );
    } else if (uploadMode === "peserta" && importUploadButton.disabled) {
        showUploadStatus(
            "Tiada rekod dengan Kad Pengenalan dan program yang sah."
        );
    } else {
        hideUploadStatus();
    }
}

function showSheet(index) {
    if (!excelSheets[index]) {
        return;
    }

    activeSheet = index;

    const sheet = excelSheets[index];

    uploadPreviewRows.textContent =
        `${sheet.rowCount.toLocaleString()} baris`;

    renderTable(sheet.rows);
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

function getCellColor(cell) {
    return [
        cell?.s?.fgColor,
        cell?.s?.fill?.fgColor
    ]
        .filter(Boolean)
        .map(color => {
            if (color.rgb) {
                return String(color.rgb)
                    .replace(/^FF/i, "")
                    .toUpperCase();
            }

            if (
                color.theme !== undefined ||
                color.indexed !== undefined
            ) {
                return `${color.theme ?? "indexed"}:${color.theme ?? color.indexed}`;
            }

            return "";
        })
        .filter(Boolean)
        .join("|");
}

function isColoredParticipantCell(cell) {
    const color = getCellColor(cell);

    return Boolean(
        color &&
        color
            .split("|")
            .some(value => {
                const normalized = String(value)
                    .replace(/^#/, "")
                    .replace(/^RGB:/i, "")
                    .toUpperCase();

                const isWhite =
                    normalized === "FFF" ||
                    normalized === "FFFFFF" ||
                    normalized === "FFFFFFFF" ||
                    /^F{6,8}$/.test(normalized) ||
                    normalized === "0:0" ||
                    normalized === "0:1" ||
                    normalized === "1:0" ||
                    normalized === "1:1" ||
                    normalized === "THEME:0" ||
                    normalized === "THEME:1" ||
                    normalized === "INDEXED:9";

                return !isWhite && normalized !== "000000";
            })
    );
}

function participantCellText(cell) {
    return String(cell?.w ?? cell?.v ?? "").trim();
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
        .replace(/\.$/, "")
        .trim();
}

function getParticipantHeaders() {
    if (selectedType === "csv") {
        return (csvRows?.[0] || [])
            .map(value => String(value ?? "").trim())
            .filter(Boolean);
    }

    const headers = new Set();

    excelSheets.forEach(sheet => {
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
        participantImportOptions.style.display = "none";
        participantHeaderMappingContainer.style.display = "none";
        return;
    }

    if (selectedType === "csv") {
        participantImportMethod = "column";
    }

    participantImportOptions.style.display = "grid";
    participantImportMethodSelect.value = participantImportMethod;
    const colorMethodOption = participantImportMethodSelect.querySelector(
        'option[value="color"]'
    );
    if (colorMethodOption) {
        colorMethodOption.disabled = selectedType === "csv";
    }
    participantImportMethodSelect
        .closest(".custom-select")
        ?.querySelectorAll(".custom-select-option")
        .forEach(option => {
            if (option.dataset.value === "color") {
                option.disabled = selectedType === "csv";
            }
        });
    participantProgramHeaderField.style.display =
        participantImportMethod === "column" ? "block" : "none";
    participantProgramRequired.style.display =
        participantImportMethod === "column" ? "inline" : "none";

    if (!workbook && selectedType !== "csv") {
        participantHeaderMappingContainer.style.display = "none";
        return;
    }

    const headers = getParticipantHeaders();
    participantHeaderMappingContainer.style.display = "block";
    participantHeaderMappingContainer.querySelector(
        ".dataset-upload-section-title span"
    ).textContent = participantImportMethod === "column"
        ? "Pilih lajur sumber. Rekod dengan Kad Pengenalan sama akan digabungkan."
        : "Program dikenal pasti melalui warna sel.";

    [
        [participantNameHeader, "name", false],
        [participantIdentityHeader, "identity", false],
        [participantCategoryHeader, "category", true],
        [participantProgramHeader, "program", true]
    ].forEach(([select, field, hasUnselectedOption]) => {
        const currentValue = participantHeaderMapping[field];
        const expectedHeader = {
            name: "NAMA",
            identity: "KAD PENGENALAN",
            category: "KATEGORI",
            program: "PROGRAM"
        }[field];

        select.innerHTML = "";

        if (hasUnselectedOption) {
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
    participantHeaderMapping.program = participantProgramHeader.value;
}

function participantHeadersAreValid() {
    const mappedHeaders = [
        participantHeaderMapping.name,
        participantHeaderMapping.identity,
        participantHeaderMapping.category,
        participantImportMethod === "column"
            ? participantHeaderMapping.program
            : ""
    ].filter(Boolean);

    return Boolean(
        participantHeaderMapping.name &&
        participantHeaderMapping.identity &&
        participantHeaderMapping.name !== participantHeaderMapping.identity &&
        new Set(mappedHeaders).size === mappedHeaders.length &&
        (
            participantImportMethod !== "column" ||
            participantHeaderMapping.program
        )
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
        if (field !== "name" && field !== "identity") {
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
                            ? participantIdentityText(
                                participantCellText(
                                    worksheet[XLSX.utils.encode_cell({ r: row, c: index })]
                                )
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

function buildParticipantRows() {
    const records = new Map();

    const addRecord = (name, identity, category, program) => {
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
                programs: [],
                programKeys: new Set()
            });
        }

        const record = records.get(identityKey);
        const cleanName = String(name ?? "").trim();
        const cleanCategory = String(category ?? "").trim();

        if (!record.name && cleanName) record.name = cleanName;
        if (!record.category && cleanCategory) record.category = cleanCategory;

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

    if (participantImportMethod === "column") {
        const sourceSheets = [];

        if (selectedType === "csv") {
            if (csvRows?.length) {
                sourceSheets.push({
                    name: selectedFile?.name || "CSV",
                    headers: csvRows[0].map(value => String(value ?? "").trim()),
                    rows: csvRows.slice(1)
                });
            }
        } else if (workbook) {
            excelSheets.forEach((sheet, index) => {
                if (!sheet.selected) return;

                const sheetName = workbook.SheetNames[index];
                const worksheet = workbook.Sheets[sheetName];
                if (!worksheet?.["!ref"]) return;

                const range = XLSX.utils.decode_range(worksheet["!ref"]);
                const headers = [];

                for (let column = range.s.c; column <= range.e.c; column += 1) {
                    headers[column] = participantCellText(
                        worksheet[XLSX.utils.encode_cell({ r: range.s.r, c: column })]
                    );
                }

                const rows = [];
                for (let row = range.s.r + 1; row <= range.e.r; row += 1) {
                    const values = [];
                    for (let column = range.s.c; column <= range.e.c; column += 1) {
                        values[column] = participantCellText(
                            worksheet[XLSX.utils.encode_cell({ r: row, c: column })]
                        );
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
                    row[programIndex]
                );
            });
        });
    } else if (workbook) {
        excelSheets.forEach((sheet, sheetIndex) => {
            if (!sheet.selected) return;

            const sheetName = workbook.SheetNames[sheetIndex];
            const worksheet = workbook.Sheets[sheetName];
            const range = XLSX.utils.decode_range(worksheet["!ref"] || "A1");
            const headers = [];

            for (let column = range.s.c; column <= range.e.c; column += 1) {
                headers[column] = participantCellText(
                    worksheet[XLSX.utils.encode_cell({ r: range.s.r, c: column })]
                );
            }

            const nameIndex = headers.indexOf(participantHeaderMapping.name);
            const identityIndex = headers.indexOf(participantHeaderMapping.identity);
            const categoryIndex = participantHeaderMapping.category
                ? headers.indexOf(participantHeaderMapping.category)
                : -1;

            if (nameIndex < 0 || identityIndex < 0) {
                throw new Error(
                    `Sheet "${sheetName}" mesti mempunyai header yang dipilih untuk NAMA dan KAD PENGENALAN.`
                );
            }

            for (let row = range.s.r + 1; row <= range.e.r; row += 1) {
                let name = "";
                let identity = "";
                let category = "";
                const programs = [];

                for (let column = range.s.c; column <= range.e.c; column += 1) {
                    const address = XLSX.utils.encode_cell({ r: row, c: column });
                    const text = participantCellText(worksheet[address]);

                    if (column === nameIndex) name = text;
                    else if (column === identityIndex) {
                        identity = participantIdentityText(text);
                    }
                    else if (column === categoryIndex) category = text;
                    else if (
                        headers[column] &&
                        isColoredParticipantCell(worksheet[address])
                    ) {
                        programs.push(headers[column]);
                    }
                }

                programs.forEach(program => addRecord(name, identity, category, program));
                if (!programs.length) addRecord(name, identity, category, "");
            }
        });
    }

    return [
        ["NAMA", "KAD PENGENALAN", "KATEGORI", "PROGRAM"],
        ...Array.from(records.values()).map(record => [
            record.name,
            record.identity,
            record.category,
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
        (uploadMode === "penerima" && !recipientHeadersAreValid())
    ) {
        alert("Sila pilih header untuk NAMA dan KAD PENGENALAN.");
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
    importUploadButton.textContent = "Mengimport...";

    showUploadStatus("Memuat naik fail...");

    try {
        const formData = new FormData();

        if (uploadMode === "peserta" || uploadMode === "penerima") {
            const normalizedRows = uploadMode === "peserta"
                ? buildParticipantRows()
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
                (uploadMode === "peserta" ? "Peserta Program" : "Penerima Bantuan")
            );
            formData.append("datasetType", uploadMode);
        } else {
            formData.append("file", selectedFile);
            formData.append("datasetType", uploadMode);
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

        if (selectedType === "csv" || uploadMode === "peserta") {
            alert(
                `Berjaya import "${result.name || uploadDatasetName.value}"\n\n` +
                `${Number(result.rows || 0).toLocaleString()} baris`
            );
        } else {
            const importedSheets =
                result.sheets || [];

            const sheetNames =
                importedSheets
                    .map(
                        sheet =>
                            `${sheet.name} (${Number(
                                sheet.rows || 0
                            ).toLocaleString()} baris)`
                    )
                    .join("\n");

            alert(
                `Berjaya import fail Excel.\n\n` +
                `Worksheets imported: ${Number(
                    result.imported ||
                    importedSheets.length
                ).toLocaleString()}\n` +
                `Jumlah baris: ${Number(
                    result.rows || 0
                ).toLocaleString()}\n\n` +
                sheetNames
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

        importUploadButton.textContent =
            "Import Data";
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
        program: ""
    };
    recipientHeaderMapping = {
        name: "", identity: "", phone: "", email: "",
        status: "", notes: "", pic: ""
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

    uploadSelectedSheetCount.textContent =
        "0 sheet dipilih";

    uploadPreviewRows.textContent = "-";
    participantHeaderMappingContainer.style.display = "none";
    recipientHeaderMappingContainer.style.display = "none";

    importUploadButton.disabled = true;
    importUploadButton.textContent =
        "Import Data";

    browseUploadButton.disabled = false;

    hideUploadStatus();

    if (resetSelections) {
        if (uploadDatasetType) {
            uploadDatasetType.value = "penerima";
            uploadDatasetType.dispatchEvent(
                new Event("change", { bubbles: true })
            );
        }

        participantImportMethod = "color";
        if (participantImportMethodSelect) {
            participantImportMethodSelect.value = "color";
            participantImportMethodSelect.dispatchEvent(
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
    cancelUploadButton = document.getElementById("cancelUploadButton");
    uploadDropZone = document.getElementById("uploadDropZone");
    browseUploadButton = document.getElementById("browseUploadButton");
    datasetFileInput = document.getElementById("datasetFileInput");
    uploadPreviewSection = document.getElementById("uploadPreviewSection");
    uploadFileName = document.getElementById("uploadFileName");
    uploadFileMeta = document.getElementById("uploadFileMeta");
    removeUploadFileButton = document.getElementById("removeUploadFileButton");
    uploadDatasetName = document.getElementById("uploadDatasetName");
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
    participantImportOptions = document.getElementById("participantImportOptions");
    participantImportMethodSelect = document.getElementById("participantImportMethod");
    participantHeaderMappingContainer = document.getElementById("participantHeaderMapping");
    participantProgramHeaderField = document.getElementById("participantProgramHeaderField");
    participantProgramRequired = document.getElementById("participantProgramRequired");
    participantNameHeader = document.getElementById("participantNameHeader");
    participantIdentityHeader = document.getElementById("participantIdentityHeader");
    participantCategoryHeader = document.getElementById("participantCategoryHeader");
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
    uploadMode = uploadDatasetType?.value || "penerima";

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

        if (selectedFile) {
            handleFile(selectedFile);
        } else {
            renderParticipantHeaderMapping();
            renderRecipientHeaderMapping();
        }
    });

    participantImportMethodSelect?.addEventListener("change", () => {
        participantImportMethod = participantImportMethodSelect.value;

        if (selectedType === "csv" && participantImportMethod === "color") {
            participantImportMethod = "column";
            participantImportMethodSelect.value = "column";
            participantImportMethodSelect.dispatchEvent(
                new Event("change", { bubbles: true })
            );
            return;
        }

        renderParticipantHeaderMapping();
        if (selectedFile) {
            updateSheetSelection();
        } else {
            hideUploadStatus();
        }
    });

    [
        participantNameHeader,
        participantIdentityHeader,
        participantCategoryHeader,
        participantProgramHeader
    ].forEach(select => {
        select?.addEventListener("change", () => {
            participantHeaderMapping.name = participantNameHeader.value;
            participantHeaderMapping.identity = participantIdentityHeader.value;
            participantHeaderMapping.category = participantCategoryHeader.value;
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

    cancelUploadButton?.addEventListener(
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
                : window.location.pathname) !== "/upload" &&
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