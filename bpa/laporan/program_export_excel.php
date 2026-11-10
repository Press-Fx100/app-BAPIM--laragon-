<?php
require_once __DIR__ . '/../init.php';
require_login();

require_once __DIR__ . '/get_program.php';

/* =========================================================
   COMPOSER / PHPSPREADSHEET
========================================================= */
$autoload = __DIR__ . '/../vendor/autoload.php';

if (!file_exists($autoload)) {
    http_response_code(500);
    exit(
        "Vendor autoload tidak dijumpai. "
        . "Pastikan PhpSpreadsheet telah dipasang."
    );
}

require_once $autoload;

use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;
use PhpOffice\PhpSpreadsheet\Style\Alignment;
use PhpOffice\PhpSpreadsheet\Style\Border;
use PhpOffice\PhpSpreadsheet\Style\Fill;
use PhpOffice\PhpSpreadsheet\Worksheet\PageSetup;

/* =========================================================
   FILTER
========================================================= */
$filters = prepareProgramReportFilters($_GET);

$tarikhDari    = $filters['tarikh_dari'];
$tarikhHingga  = $filters['tarikh_hingga'];
$unitFilter    = $filters['unit_id'];
$statusFilter  = $filters['status'];
$q             = $filters['q'];
$errors        = $filters['errors'];

if ($errors) {
    http_response_code(400);
    exit(implode(' ', $errors));
}

/* =========================================================
   AMBIL DATA
========================================================= */
try {
    $units = getProgramReportUnits($pdo);

    $namaUnitDipilih = getProgramReportSelectedUnitName(
        $units,
        $unitFilter
    );

    $rows = getProgramReport(
        $pdo,
        $tarikhDari,
        $tarikhHingga,
        $unitFilter,
        $statusFilter,
        $q
    );

    $summary = getProgramReportSummary($rows);

} catch (Throwable $e) {
    http_response_code(500);
    exit(
        'Gagal menghasilkan Excel: '
        . $e->getMessage()
    );
}

/* =========================================================
   HELPER
========================================================= */
function safeExcelFilename(string $name): string
{
    $name = preg_replace(
        '/[^A-Za-z0-9_\- ]+/',
        '',
        $name
    );

    $name = preg_replace(
        '/\s+/',
        '_',
        trim($name)
    );

    return $name !== ''
        ? $name
        : 'Laporan_Program';
}

/* =========================================================
   BINA EXCEL
========================================================= */
$spreadsheet = new Spreadsheet();
$sheet = $spreadsheet->getActiveSheet();

$sheet->setTitle('Laporan Program');

/* =========================================================
   TAJUK
========================================================= */
$sheet->mergeCells('A1:L1');

$sheet->setCellValue(
    'A1',
    'PROGRAM BAHAGIAN PEMBANGUNAN ASNAF'
);

$sheet->mergeCells('A2:L2');

$infoLaporan =
    'Tempoh: '
    . date('d/m/Y', strtotime($tarikhDari))
    . ' hingga '
    . date('d/m/Y', strtotime($tarikhHingga))
    . ' | Unit: '
    . $namaUnitDipilih;

if ($statusFilter !== '') {
    $infoLaporan .=
        ' | Status: '
        . ucfirst($statusFilter);
}

if ($q !== '') {
    $infoLaporan .=
        ' | Carian: '
        . $q;
}

$sheet->setCellValue(
    'A2',
    $infoLaporan
);

$sheet->getStyle('A1:L1')->applyFromArray([
    'font' => [
        'bold' => true,
        'size' => 14
    ],
    'alignment' => [
        'horizontal' => Alignment::HORIZONTAL_CENTER,
        'vertical' => Alignment::VERTICAL_CENTER
    ]
]);

$sheet->getStyle('A2:L2')->applyFromArray([
    'font' => [
        'italic' => true,
        'size' => 10
    ],
    'alignment' => [
        'horizontal' => Alignment::HORIZONTAL_CENTER,
        'vertical' => Alignment::VERTICAL_CENTER,
        'wrapText' => true
    ]
]);

$sheet->getRowDimension(1)->setRowHeight(25);
$sheet->getRowDimension(2)->setRowHeight(22);

/* =========================================================
   HEADER JADUAL
========================================================= */
$headerRow = 4;

$headers = [
    'BIL.',
    'UNIT',
    'PROGRAM',
    'NK / JKB',
    'TARIKH PELAKSANAAN / TEMPOH',
    'TEMPAT',
    'KERJASAMA / KONSULTAN',
    'BIL. PESERTA',
    'PERUNTUKAN',
    'PERBELANJAAN',
    'DANA WAKALAH',
    'CATATAN'
];

$columns = range('A', 'L');

foreach ($headers as $index => $header) {
    $sheet->setCellValue(
        $columns[$index] . $headerRow,
        $header
    );
}

$sheet->getStyle("A{$headerRow}:L{$headerRow}")
    ->applyFromArray([
        'font' => [
            'bold' => true
        ],
        'fill' => [
            'fillType' => Fill::FILL_SOLID,
            'startColor' => [
                'rgb' => '9FC5E8'
            ]
        ],
        'alignment' => [
            'horizontal' => Alignment::HORIZONTAL_CENTER,
            'vertical' => Alignment::VERTICAL_CENTER,
            'wrapText' => true
        ],
        'borders' => [
            'allBorders' => [
                'borderStyle' => Border::BORDER_THIN,
                'color' => [
                    'rgb' => '000000'
                ]
            ]
        ]
    ]);

$sheet->getRowDimension($headerRow)->setRowHeight(38);

/* =========================================================
   DATA PROGRAM
========================================================= */
$currentRow = 5;

foreach ($rows as $index => $row) {

    $tarikhPaparan = formatProgramReportDate(
        $row['tarikh_paparan_mula'] ?? null,
        $row['tarikh_paparan_tamat'] ?? null,
        $row['tempoh_paparan'] ?? null
    );

    $sheet->setCellValue(
        'A' . $currentRow,
        $index + 1
    );

    $sheet->setCellValue(
        'B' . $currentRow,
        formatProgramReportText(
            $row['nama_unit'] ?? null
        )
    );

    $sheet->setCellValue(
        'C' . $currentRow,
        formatProgramReportText(
            $row['nama_program'] ?? null
        )
    );

    $sheet->setCellValue(
        'D' . $currentRow,
        formatProgramReportText(
            $row['nk_jkb'] ?? null
        )
    );

    $sheet->setCellValue(
        'E' . $currentRow,
        $tarikhPaparan
    );

    $sheet->setCellValue(
        'F' . $currentRow,
        formatProgramReportText(
            $row['tempat_paparan'] ?? null
        )
    );

    $sheet->setCellValue(
        'G' . $currentRow,
        formatProgramReportText(
            $row['kerjasama_konsultan'] ?? null
        )
    );

    $sheet->setCellValue(
        'H' . $currentRow,
        (int)($row['bil_peserta_paparan'] ?? 0)
    );

    $sheet->setCellValue(
        'I' . $currentRow,
        (float)($row['peruntukan_rm'] ?? 0)
    );

    $sheet->setCellValue(
        'J' . $currentRow,
        (float)($row['perbelanjaan_rm'] ?? 0)
    );

    $sheet->setCellValue(
        'K' . $currentRow,
        (float)($row['dana_wakalah_rm'] ?? 0)
    );

    $sheet->setCellValue(
        'L' . $currentRow,
        formatProgramReportText(
            $row['catatan'] ?? null
        )
    );

    $currentRow++;
}

/* =========================================================
   JIKA TIADA DATA
========================================================= */
if (!$rows) {
    $sheet->mergeCells(
        "A{$currentRow}:L{$currentRow}"
    );

    $sheet->setCellValue(
        "A{$currentRow}",
        'Tiada program dijumpai berdasarkan filter yang dipilih.'
    );

    $sheet->getStyle(
        "A{$currentRow}:L{$currentRow}"
    )->applyFromArray([
        'alignment' => [
            'horizontal' => Alignment::HORIZONTAL_CENTER,
            'vertical' => Alignment::VERTICAL_CENTER
        ],
        'borders' => [
            'allBorders' => [
                'borderStyle' => Border::BORDER_THIN
            ]
        ]
    ]);

    $sheet->getRowDimension($currentRow)
        ->setRowHeight(30);

    $currentRow++;
}

/* =========================================================
   JUMLAH KESELURUHAN
========================================================= */
$jumlahRow = $currentRow;

$sheet->mergeCells(
    "A{$jumlahRow}:G{$jumlahRow}"
);

$sheet->setCellValue(
    "A{$jumlahRow}",
    'JUMLAH KESELURUHAN'
);

$sheet->setCellValue(
    "H{$jumlahRow}",
    (int)$summary['jumlah_peserta']
);

$sheet->setCellValue(
    "I{$jumlahRow}",
    (float)$summary['jumlah_peruntukan']
);

$sheet->setCellValue(
    "J{$jumlahRow}",
    (float)$summary['jumlah_perbelanjaan']
);

$sheet->setCellValue(
    "K{$jumlahRow}",
    (float)$summary['jumlah_dana_wakalah']
);

$sheet->setCellValue(
    "L{$jumlahRow}",
    ''
);

$sheet->getStyle(
    "A{$jumlahRow}:L{$jumlahRow}"
)->applyFromArray([
    'font' => [
        'bold' => true
    ],
    'fill' => [
        'fillType' => Fill::FILL_SOLID,
        'startColor' => [
            'rgb' => 'D9EAD3'
        ]
    ],
    'alignment' => [
        'vertical' => Alignment::VERTICAL_CENTER,
        'wrapText' => true
    ],
    'borders' => [
        'allBorders' => [
            'borderStyle' => Border::BORDER_THIN,
            'color' => [
                'rgb' => '000000'
            ]
        ]
    ]
]);

$sheet->getStyle(
    "A{$jumlahRow}"
)->getAlignment()->setHorizontal(
    Alignment::HORIZONTAL_RIGHT
);

$sheet->getRowDimension($jumlahRow)
    ->setRowHeight(24);

/* =========================================================
   STYLE SEMUA DATA
========================================================= */
$lastDataRow = $jumlahRow - 1;

if ($lastDataRow >= 5) {
    $sheet->getStyle(
        "A5:L{$lastDataRow}"
    )->applyFromArray([
        'alignment' => [
            'vertical' => Alignment::VERTICAL_TOP,
            'wrapText' => true
        ],
        'borders' => [
            'allBorders' => [
                'borderStyle' => Border::BORDER_THIN,
                'color' => [
                    'rgb' => '000000'
                ]
            ]
        ]
    ]);

    $sheet->getStyle(
        "A5:B{$lastDataRow}"
    )->getAlignment()->setHorizontal(
        Alignment::HORIZONTAL_CENTER
    );

    $sheet->getStyle(
        "D5:E{$lastDataRow}"
    )->getAlignment()->setHorizontal(
        Alignment::HORIZONTAL_CENTER
    );

    $sheet->getStyle(
        "H5:H{$lastDataRow}"
    )->getAlignment()->setHorizontal(
        Alignment::HORIZONTAL_CENTER
    );
}

/* =========================================================
   FORMAT NOMBOR DAN WANG
========================================================= */
$sheet->getStyle(
    "H5:H{$jumlahRow}"
)->getNumberFormat()->setFormatCode(
    '#,##0'
);

$sheet->getStyle(
    "I5:K{$jumlahRow}"
)->getNumberFormat()->setFormatCode(
    '"RM" #,##0.00'
);

$sheet->getStyle(
    "I5:K{$jumlahRow}"
)->getAlignment()->setHorizontal(
    Alignment::HORIZONTAL_RIGHT
);

/* =========================================================
   LEBAR COLUMN
========================================================= */
$columnWidths = [
    'A' => 7,
    'B' => 11,
    'C' => 40,
    'D' => 15,
    'E' => 28,
    'F' => 30,
    'G' => 30,
    'H' => 14,
    'I' => 18,
    'J' => 18,
    'K' => 18,
    'L' => 35
];

foreach ($columnWidths as $column => $width) {
    $sheet->getColumnDimension($column)
        ->setWidth($width);
}

/* =========================================================
   FREEZE HEADER DAN AUTO FILTER
========================================================= */
$sheet->freezePane('A5');

$sheet->setAutoFilter(
    "A{$headerRow}:L{$headerRow}"
);

/* =========================================================
   PRINT SETUP
========================================================= */
$sheet->getPageSetup()
    ->setOrientation(
        PageSetup::ORIENTATION_LANDSCAPE
    );

$sheet->getPageSetup()
    ->setPaperSize(
        PageSetup::PAPERSIZE_A3
    );

$sheet->getPageSetup()
    ->setFitToWidth(1);

$sheet->getPageSetup()
    ->setFitToHeight(0);

$sheet->getPageMargins()
    ->setTop(0.4);

$sheet->getPageMargins()
    ->setBottom(0.4);

$sheet->getPageMargins()
    ->setLeft(0.3);

$sheet->getPageMargins()
    ->setRight(0.3);

$sheet->getPageSetup()
    ->setRowsToRepeatAtTopByStartAndEnd(
        $headerRow,
        $headerRow
    );

/* =========================================================
   NAMA FAIL
========================================================= */
$unitFilename = $namaUnitDipilih === 'Semua Unit'
    ? 'Semua_Unit'
    : $namaUnitDipilih;

$filename = safeExcelFilename(
    'Laporan_Program_'
    . $unitFilename
    . '_'
    . $tarikhDari
    . '_hingga_'
    . $tarikhHingga
) . '.xlsx';

/* =========================================================
   OUTPUT DOWNLOAD
========================================================= */
while (ob_get_level() > 0) {
    ob_end_clean();
}

header(
    'Content-Type: '
    . 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
);

header(
    'Content-Disposition: attachment; filename="'
    . $filename
    . '"'
);

header('Cache-Control: max-age=0');
header('Pragma: public');

$writer = new Xlsx($spreadsheet);
$writer->save('php://output');

$spreadsheet->disconnectWorksheets();

exit;