const XLSX = require("xlsx");
const path = require("path");
const fs = require("fs");

// =====================================================
// INPUT
// =====================================================

const inputFile = process.argv[2];

if (!inputFile) {

    console.log(
        "Usage: node excel-to-csv.js input.xlsx"
    );

    process.exit(1);

}


// =====================================================
// CHECK FILE
// =====================================================

if (!fs.existsSync(inputFile)) {

    console.error(
        `File not found: ${inputFile}`
    );

    process.exit(1);

}


// =====================================================
// CHECK EXTENSION
// =====================================================

const extension =
    path.extname(inputFile)
        .toLowerCase();

if (
    extension !== ".xlsx" &&
    extension !== ".xls"
) {

    console.error(
        "Only .xlsx and .xls files are supported."
    );

    process.exit(1);

}


// =====================================================
// READ EXCEL
// =====================================================

try {

    const workbook =
        XLSX.readFile(
            inputFile
        );


    // Excel filename without extension

    const excelName =
        path.basename(
            inputFile,
            extension
        );


    const outputDir =
        path.dirname(
            inputFile
        );


    // =================================================
    // CONVERT EACH SHEET
    // =================================================

    workbook.SheetNames.forEach(
        sheetName => {

            const worksheet =
                workbook.Sheets[
                    sheetName
                ];


            // -----------------------------------------
            // Get actual used range
            // -----------------------------------------

            const range =
                worksheet["!ref"];


            if (!range) {

                console.log(
                    `Skipping empty sheet: ${sheetName}`
                );

                return;

            }


            // -----------------------------------------
            // Convert worksheet to CSV
            // -----------------------------------------

            const csv =
                XLSX.utils.sheet_to_csv(
                    worksheet
                );


            // -----------------------------------------
            // Clean filename
            // -----------------------------------------

            const safeSheetName =
                sheetName
                    .replace(
                        /[<>:"/\\|?*]/g,
                        "_"
                    )
                    .trim();


            const safeExcelName =
                excelName
                    .replace(
                        /[<>:"/\\|?*]/g,
                        "_"
                    )
                    .trim();


            // -----------------------------------------
            // Output filename
            // -----------------------------------------

            const outputFilename =
                `${safeExcelName} - ${safeSheetName}.csv`;


            const outputPath =
                path.join(
                    outputDir,
                    outputFilename
                );


            // -----------------------------------------
            // Write CSV
            // -----------------------------------------

            fs.writeFileSync(
                outputPath,
                csv,
                "utf8"
            );


            // -----------------------------------------
            // Get page length
            // -----------------------------------------

            const rows =
                XLSX.utils.sheet_to_json(
                    worksheet,
                    {
                        header: 1,
                        defval: ""
                    }
                );


            const rowCount =
                rows.length;


            console.log(
                `Created: ${outputFilename}`
            );

            console.log(
                `  Page: ${sheetName}`
            );

            console.log(
                `  Rows: ${rowCount}`
            );

        }
    );


    console.log("");
    console.log(
        "Excel conversion completed."
    );


}

catch (error) {

    console.error(
        "Conversion failed:"
    );

    console.error(
        error.message
    );

    process.exit(1);

}