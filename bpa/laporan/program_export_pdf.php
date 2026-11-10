<?php
require_once __DIR__ . '/../init.php';
require_login();

require_once __DIR__ . '/get_program.php';

/* =========================================================
   COMPOSER / DOMPDF
========================================================= */
$autoload = __DIR__ . '/../vendor/autoload.php';

if (!file_exists($autoload)) {
    http_response_code(500);

    exit(
        'Vendor autoload tidak dijumpai. '
        . 'Pastikan Composer dan Dompdf telah dipasang.'
    );
}

require_once $autoload;

use Dompdf\Dompdf;
use Dompdf\Options;

/* =========================================================
   FILTER
========================================================= */
$filters = prepareProgramReportFilters($_GET);

$tarikhDari = $filters['tarikh_dari'];
$tarikhHingga = $filters['tarikh_hingga'];
$unitFilter = $filters['unit_id'];
$statusFilter = $filters['status'];
$q = $filters['q'];
$errors = $filters['errors'];

if ($errors) {
    http_response_code(400);
    exit(implode(' ', $errors));
}

/* =========================================================
   AMBIL DATA LAPORAN
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
        'Gagal menghasilkan PDF: '
        . $e->getMessage()
    );
}

/* =========================================================
   HELPER KHAS PDF
========================================================= */
function pdfSafeFilename(string $name): string
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

function pdfEscape($value): string
{
    return htmlspecialchars(
        (string)$value,
        ENT_QUOTES,
        'UTF-8'
    );
}

function pdfText($value): string
{
    $value = trim((string)$value);

    if ($value === '') {
        return '-';
    }

    return nl2br(
        pdfEscape($value)
    );
}

function pdfMoney($value): string
{
    return 'RM '
        . number_format(
            (float)($value ?? 0),
            2
        );
}

function pdfStatusText($status): string
{
    $status = trim((string)$status);

    if ($status === '') {
        return '-';
    }

    return strtoupper($status);
}

/* =========================================================
   MAKLUMAT TAJUK
========================================================= */
$tarikhDariPaparan = date(
    'd/m/Y',
    strtotime($tarikhDari)
);

$tarikhHinggaPaparan = date(
    'd/m/Y',
    strtotime($tarikhHingga)
);

$tahunDari = date(
    'Y',
    strtotime($tarikhDari)
);

$tahunHingga = date(
    'Y',
    strtotime($tarikhHingga)
);

$tajukTahun = $tahunDari;

if ($tahunDari !== $tahunHingga) {
    $tajukTahun = $tahunDari
        . ' - '
        . $tahunHingga;
}

/* =========================================================
   BINA HTML PDF
========================================================= */
ob_start();
?>
<!DOCTYPE html>
<html lang="ms">
<head>
    <meta charset="UTF-8">

    <style>
        @page {
            margin: 18px 18px 24px 18px;
        }

        body {
            font-family: DejaVu Sans, sans-serif;
            font-size: 7px;
            color: #000;
            margin: 0;
            padding: 0;
        }

        .report-title {
            text-align: center;
            font-size: 12px;
            font-weight: bold;
            text-transform: uppercase;
            margin-bottom: 4px;
        }

        .report-subtitle {
            text-align: center;
            font-size: 8px;
            margin-bottom: 10px;
        }

        .summary-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 9px;
        }

        .summary-table td {
            border: 1px solid #666;
            padding: 4px 5px;
            vertical-align: top;
        }

        .summary-label {
            font-size: 6.5px;
            color: #444;
        }

        .summary-value {
            font-size: 8px;
            font-weight: bold;
            margin-top: 2px;
        }

        .report-table {
            width: 100%;
            border-collapse: collapse;
            table-layout: fixed;
        }

        .report-table thead {
            display: table-header-group;
        }

        .report-table tr {
            page-break-inside: avoid;
        }

        .report-table th {
            background-color: #9fc5e8;
            border: 1px solid #000;
            padding: 4px 2px;
            text-align: center;
            vertical-align: middle;
            font-size: 6.5px;
            font-weight: bold;
            line-height: 1.15;
        }

        .report-table td {
            border: 1px solid #000;
            padding: 3px 2px;
            vertical-align: top;
            font-size: 6.3px;
            line-height: 1.2;
            word-wrap: break-word;
            overflow-wrap: break-word;
        }

        .center {
            text-align: center;
            vertical-align: middle !important;
        }

        .right {
            text-align: right;
            vertical-align: middle !important;
            white-space: nowrap;
        }

        .status {
            font-size: 5.5px;
            font-weight: bold;
            margin-top: 3px;
        }

        .total-row td {
            background-color: #d9ead3;
            font-weight: bold;
            vertical-align: middle;
        }

        .col-bil {
            width: 3%;
        }

        .col-unit {
            width: 4.5%;
        }

        .col-program {
            width: 16%;
        }

        .col-nk {
            width: 6%;
        }

        .col-tarikh {
            width: 10%;
        }

        .col-tempat {
            width: 10%;
        }

        .col-kerjasama {
            width: 10%;
        }

        .col-peserta {
            width: 5.5%;
        }

        .col-wang {
            width: 7.5%;
        }

        .col-catatan {
            width: 12%;
        }

        .footer {
            position: fixed;
            bottom: -15px;
            left: 0;
            right: 0;
            height: 12px;
            text-align: center;
            font-size: 6px;
            color: #555;
        }

        .page-number:after {
            content: counter(page);
        }
    </style>
</head>

<body>

    <div class="footer">
        Laporan Program BPA |
        Halaman <span class="page-number"></span>
    </div>

    <div class="report-title">
        Program Bahagian Pembangunan Asnaf
        <?= pdfEscape($tajukTahun) ?>
    </div>

    <div class="report-subtitle">
        Tempoh:
        <?= pdfEscape($tarikhDariPaparan) ?>
        hingga
        <?= pdfEscape($tarikhHinggaPaparan) ?>

        &nbsp; | &nbsp;

        Unit:
        <?= pdfEscape($namaUnitDipilih) ?>

        <?php if ($statusFilter !== ''): ?>
            &nbsp; | &nbsp;
            Status:
            <?= pdfEscape(ucfirst($statusFilter)) ?>
        <?php endif; ?>

        <?php if ($q !== ''): ?>
            &nbsp; | &nbsp;
            Carian:
            <?= pdfEscape($q) ?>
        <?php endif; ?>
    </div>

    <!-- RINGKASAN -->
    <table class="summary-table">
        <tr>
            <td style="width:16%;">
                <div class="summary-label">
                    JUMLAH PROGRAM
                </div>

                <div class="summary-value">
                    <?= number_format(
                        (int)$summary['jumlah_program']
                    ) ?>
                </div>
            </td>

            <td style="width:16%;">
                <div class="summary-label">
                    JUMLAH PESERTA
                </div>

                <div class="summary-value">
                    <?= number_format(
                        (int)$summary['jumlah_peserta']
                    ) ?>
                </div>
            </td>

            <td style="width:22%;">
                <div class="summary-label">
                    JUMLAH PERUNTUKAN
                </div>

                <div class="summary-value">
                    <?= pdfMoney(
                        $summary['jumlah_peruntukan']
                    ) ?>
                </div>
            </td>

            <td style="width:23%;">
                <div class="summary-label">
                    JUMLAH PERBELANJAAN
                </div>

                <div class="summary-value">
                    <?= pdfMoney(
                        $summary['jumlah_perbelanjaan']
                    ) ?>
                </div>
            </td>

            <td style="width:23%;">
                <div class="summary-label">
                    DANA WAKALAH
                </div>

                <div class="summary-value">
                    <?= pdfMoney(
                        $summary['jumlah_dana_wakalah']
                    ) ?>
                </div>
            </td>
        </tr>
    </table>

    <!-- JADUAL UTAMA -->
    <table class="report-table">

        <thead>
            <tr>
                <th class="col-bil">
                    BIL.
                </th>

                <th class="col-unit">
                    UNIT
                </th>

                <th class="col-program">
                    PROGRAM
                </th>

                <th class="col-nk">
                    NK / JKB
                </th>

                <th class="col-tarikh">
                    TARIKH PELAKSANAAN / TEMPOH
                </th>

                <th class="col-tempat">
                    TEMPAT
                </th>

                <th class="col-kerjasama">
                    KERJASAMA / KONSULTAN
                </th>

                <th class="col-peserta">
                    BIL. PESERTA
                </th>

                <th class="col-wang">
                    PERUNTUKAN
                </th>

                <th class="col-wang">
                    PERBELANJAAN
                </th>

                <th class="col-wang">
                    DANA WAKALAH
                </th>

                <th class="col-catatan">
                    CATATAN
                </th>
            </tr>
        </thead>

        <tbody>

        <?php if (!$rows): ?>

            <tr>
                <td
                    colspan="12"
                    class="center"
                    style="padding:12px;"
                >
                    Tiada program dijumpai berdasarkan
                    filter yang dipilih.
                </td>
            </tr>

        <?php else: ?>

            <?php foreach ($rows as $index => $row): ?>

                <?php
                $tarikhPaparan = formatProgramReportDate(
                    $row['tarikh_paparan_mula'] ?? null,
                    $row['tarikh_paparan_tamat'] ?? null,
                    $row['tempoh_paparan'] ?? null
                );
                ?>

                <tr>
                    <td class="center">
                        <?= $index + 1 ?>
                    </td>

                    <td class="center">
                        <?= pdfText(
                            $row['nama_unit'] ?? null
                        ) ?>
                    </td>

                    <td>
                        <?= pdfText(
                            $row['nama_program'] ?? null
                        ) ?>

                        <div class="status">
                            STATUS:
                            <?= pdfEscape(
                                pdfStatusText(
                                    $row['status'] ?? null
                                )
                            ) ?>
                        </div>
                    </td>

                    <td class="center">
                        <?= pdfText(
                            $row['nk_jkb'] ?? null
                        ) ?>
                    </td>

                    <td class="center">
                        <?= pdfEscape($tarikhPaparan) ?>
                    </td>

                    <td>
                        <?= pdfText(
                            $row['tempat_paparan'] ?? null
                        ) ?>
                    </td>

                    <td>
                        <?= pdfText(
                            $row['kerjasama_konsultan'] ?? null
                        ) ?>
                    </td>

                    <td class="center">
                        <?= number_format(
                            (int)(
                                $row['bil_peserta_paparan']
                                ?? 0
                            )
                        ) ?>
                    </td>

                    <td class="right">
                        <?= pdfMoney(
                            $row['peruntukan_rm'] ?? 0
                        ) ?>
                    </td>

                    <td class="right">
                        <?= pdfMoney(
                            $row['perbelanjaan_rm'] ?? 0
                        ) ?>
                    </td>

                    <td class="right">
                        <?= pdfMoney(
                            $row['dana_wakalah_rm'] ?? 0
                        ) ?>
                    </td>

                    <td>
                        <?= pdfText(
                            $row['catatan'] ?? null
                        ) ?>
                    </td>
                </tr>

            <?php endforeach; ?>

            <!-- JUMLAH KESELURUHAN -->
            <tr class="total-row">
                <td
                    colspan="7"
                    class="right"
                >
                    JUMLAH KESELURUHAN
                </td>

                <td class="center">
                    <?= number_format(
                        (int)$summary['jumlah_peserta']
                    ) ?>
                </td>

                <td class="right">
                    <?= pdfMoney(
                        $summary['jumlah_peruntukan']
                    ) ?>
                </td>

                <td class="right">
                    <?= pdfMoney(
                        $summary['jumlah_perbelanjaan']
                    ) ?>
                </td>

                <td class="right">
                    <?= pdfMoney(
                        $summary['jumlah_dana_wakalah']
                    ) ?>
                </td>

                <td></td>
            </tr>

        <?php endif; ?>

        </tbody>
    </table>

</body>
</html>
<?php
$html = ob_get_clean();

/* =========================================================
   KONFIGURASI DOMPDF
========================================================= */
$options = new Options();

$options->set(
    'isRemoteEnabled',
    true
);

$options->set(
    'isHtml5ParserEnabled',
    true
);

$options->set(
    'defaultFont',
    'DejaVu Sans'
);

$options->set(
    'isPhpEnabled',
    false
);

$dompdf = new Dompdf($options);

$dompdf->loadHtml(
    $html,
    'UTF-8'
);

/*
 * Guna A3 landscape sebab ada 12 kolum.
 * Kalau A4, tulisan akan terlalu kecil.
 */
$dompdf->setPaper(
    'A3',
    'landscape'
);

$dompdf->render();

/* =========================================================
   NAMA FAIL
========================================================= */
$unitFilename = $namaUnitDipilih === 'Semua Unit'
    ? 'Semua_Unit'
    : $namaUnitDipilih;

$filename = pdfSafeFilename(
    'Laporan_Program_'
    . $unitFilename
    . '_'
    . $tarikhDari
    . '_hingga_'
    . $tarikhHingga
) . '.pdf';

/* =========================================================
   OUTPUT PDF
========================================================= */
while (ob_get_level() > 0) {
    ob_end_clean();
}

/*
 * Attachment = true:
 * PDF terus download.
 *
 * Kalau mahu PDF dibuka dalam browser dahulu,
 * tukar true kepada false.
 */
$dompdf->stream(
    $filename,
    [
        'Attachment' => true
    ]
);

exit;