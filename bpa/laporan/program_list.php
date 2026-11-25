<?php
require_once __DIR__ . '/../init.php';
require_login();

require_once __DIR__ . '/get_program.php';

/* =========================================================
   MAKLUMAT PENGGUNA
========================================================= */
$name = htmlspecialchars(
    $_SESSION['user']['user_nama'] ?? 'User'
);

$role = $_SESSION['user']['role'] ?? 'staff';

$unitIdSession = (int)(
    $_SESSION['user']['unit_id'] ?? 0
);

/* =========================================================
   FILTER LAPORAN
========================================================= */
$filters = prepareProgramReportFilters($_GET);

$tarikhDari = $filters['tarikh_dari'];
$tarikhHingga = $filters['tarikh_hingga'];
$unitFilter = $filters['unit_id'];
$statusFilter = $filters['status'];
$q = $filters['q'];
$errors = $filters['errors'];
$allowedStatus = $filters['allowed_status'];

/* =========================================================
   SENARAI UNIT
========================================================= */
$units = getProgramReportUnits($pdo);
$years = getProgramReportYears($pdo);
$yearFilter = $filters['tahun'];
if ($yearFilter === '' && $years) {
    $yearFilter = (string)date('Y');
    if (!in_array((int)$yearFilter, $years, true)) {
        $yearFilter = (string)$years[0];
    }
}
if ($yearFilter !== '') {
    $filters['tahun'] = $yearFilter;
    $tarikhDari = $yearFilter . '-01-01';
    $tarikhHingga = $yearFilter . '-12-31';
}

$namaUnitDipilih = getProgramReportSelectedUnitName(
    $units,
    $unitFilter
);

/* =========================================================
   AMBIL DATA LAPORAN
========================================================= */
$rows = [];

if (!$errors) {
    try {
        $rows = getProgramReport(
            $pdo,
            $tarikhDari,
            $tarikhHingga,
            $unitFilter,
            $statusFilter,
            $q,
            $yearFilter
        );
    } catch (Throwable $e) {
        $errors[] = 'Gagal mendapatkan laporan: '
            . $e->getMessage();
    }
}

/* =========================================================
   RINGKASAN
========================================================= */
$summary = getProgramReportSummary($rows);

$jumlahProgram = $summary['jumlah_program'];
$jumlahPeserta = $summary['jumlah_peserta'];
$jumlahPeruntukan = $summary['jumlah_peruntukan'];
$jumlahPerbelanjaan = $summary['jumlah_perbelanjaan'];
$jumlahDanaWakalah = $summary['jumlah_dana_wakalah'];
$reportUnitBadgeColors = [
    'UPU' => 'blue',
    'ULK' => 'purple',
    'UAK' => 'green',
    'UPA' => 'yellow',
];

/* =========================================================
   QUERY STRING EXPORT
========================================================= */
$exportParams = buildProgramReportExportQuery($filters);

/* =========================================================
   TAJUK TAHUN
========================================================= */
$tajukTahun = $yearFilter !== ''
    ? $yearFilter
    : date('Y');

/* =========================================================
   STATUS BADGE
========================================================= */
function reportStatusBadge($status): string
{
    $status = strtolower(
        trim((string)$status)
    );

    $class = 'secondary';

    if ($status === 'aktif') {
        $class = 'primary';
    } elseif ($status === 'selesai') {
        $class = 'success';
    } elseif ($status === 'batal') {
        $class = 'danger';
    }

    return '<span class="status-badge bg-'
        . $class
        . '">'
        . htmlspecialchars(strtoupper($status))
        . '</span>';
}
?>
<!DOCTYPE html>
<html lang="ms">
<head>

    <meta charset="UTF-8">

    <meta
        name="viewport"
        content="width=device-width, initial-scale=1"
    >

    <title>Laporan Program BPA</title>

    <link
        href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css"
        rel="stylesheet"
    >

    <link
        rel="stylesheet"
        href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/css/font-awesome.min.css"
    >

    <link
        rel="stylesheet"
        href="/css/bootstrap-icons.min.css"
    >

    <style>
        body {
            background-color: #f4f6f8;
            padding-top: 70px;
        }

        .offcanvas {
            width: 290px;
        }

        .report-heading {
            text-align: center;
            font-weight: 800;
            font-size: 16px;
            text-transform: uppercase;
            color: #000;
        }

        .report-info {
            text-align: center;
            font-size: 12px;
            color: #555;
        }

        .table-report {
            min-width: 1040px;
            table-layout: fixed;
            border-collapse: separate;
            border-spacing: 0;
            font-size: 13px;
        }

        .table-report thead th,
        .bpa-shell-page table.table-report thead th {
            position: sticky;
            top: 0;
            z-index: 5;
            background-color: #f8fafc !important;
            color: #374151 !important;
            border: 0 !important;
            border-bottom: 1px solid #dfe3e8 !important;
            border-right: 0 !important;
            text-align: left !important;
            vertical-align: middle;
            font-size: 13px !important;
            font-weight: 600 !important;
            padding: 10px 12px !important;
            line-height: 1.3;
        }

        .table-report tbody td,
        .bpa-shell-page table.table-report tbody td {
            border: 0 !important;
            border-bottom: 1px solid #eef0f2 !important;
            border-right: 0 !important;
            vertical-align: top;
            font-size: 13px !important;
            padding: 9px 12px !important;
            color: #374151 !important;
            overflow-wrap: anywhere;
        }

        .table-report tbody tr:nth-child(even) td,
        .bpa-shell-page table.table-report tbody tr:nth-child(even) td {
            background-color: #fbfcfe !important;
        }

        .table-report tbody tr:hover td,
        .bpa-shell-page table.table-report tbody tr:hover td {
            background-color: #eef4ff !important;
        }

        .table-report tbody tr.program-report-row {
            cursor: pointer;
        }

        .bpa-shell-page [data-bpa-list-page="program"] table.table-report tbody tr.program-report-row.is-selected td,
        .bpa-shell-page [data-bpa-list-page="program"] table.table-report tbody tr.program-report-row.is-selected:nth-child(even) td,
        .bpa-shell-page [data-bpa-list-page="program"] table.table-report tbody tr.program-report-row.is-selected:hover td {
            background-color: #c7d2fe !important;
            color: #172554 !important;
        }

        .bpa-shell-page [data-bpa-list-page="program"] table.table-report tbody tr.program-report-row.is-selected td:first-child {
            border-left: 4px solid #4f46e5 !important;
        }

        .table-report tbody tr.program-report-row:focus-visible {
            outline: 2px solid #4f6df5;
            outline-offset: -2px;
        }

        .report-table-wrapper {
            max-height: 650px;
            border: 1px solid #e5e7eb;
            border-radius: 10px;
            background: #fff;
        }

        .center {
            text-align: center;
            vertical-align: middle !important;
        }

        .money {
            text-align: right;
            vertical-align: middle !important;
            white-space: nowrap;
            font-variant-numeric: tabular-nums;
        }

        .col-bil {
            width: 55px;
        }

        .col-unit {
            width: 85px;
        }

        .col-program {
            width: 300px;
        }

        .col-peserta {
            width: 95px;
        }

        .col-wang {
            width: 140px;
        }

        .col-action {
            width: 70px;
        }

        .program-detail-action {
            display: inline-grid;
            width: 32px;
            height: 32px;
            place-items: center;
            border: 1px solid #dbe3ee;
            border-radius: 9px;
            color: #53647a;
            background: #fff;
            text-decoration: none;
            transition: background .15s ease, border-color .15s ease, color .15s ease;
        }

        .program-detail-action:hover {
            border-color: #aabcf9;
            background: #edf3ff;
            color: #4f6df5;
        }

        .summary-card {
            border-left: 4px solid #0d6efd;
        }

        .summary-number {
            font-size: 20px;
            font-weight: 800;
        }

        .filter-card label {
            font-weight: 600;
            font-size: 14px;
        }

        @media print {

            body {
                padding-top: 0;
                background: #fff;
            }

            .no-print {
                display: none !important;
            }

            .container-fluid {
                padding: 0 !important;
            }

            .card {
                box-shadow: none !important;
                border: none !important;
            }

            .table-responsive {
                overflow: visible !important;
            }
        }
    </style>

</head>

<body>

<?php
/* =========================================================
   SIDEBAR MENGIKUT ROLE
========================================================= */

if ($role === 'admin') {

    require_once __DIR__ . '/../admin/sidebar.php';

} else {

    $stmtUserUnit = $pdo->prepare("
        SELECT nama_unit
        FROM unit
        WHERE unit_id = ?
        LIMIT 1
    ");

    $stmtUserUnit->execute([
        $unitIdSession
    ]);

    $namaUnitSession = strtoupper(
        trim(
            (string)$stmtUserUnit->fetchColumn()
        )
    );

    if ($role === 'editor') {

        if ($namaUnitSession === 'UAK') {

            require_once __DIR__
                . '/../uak/sidebar_editor.php';

        } elseif ($namaUnitSession === 'UPU') {

            require_once __DIR__
                . '/../upu/sidebar_editor.php';

        } elseif ($namaUnitSession === 'UPA') {

            require_once __DIR__
                . '/../upa/sidebar_editor.php';

        } elseif ($namaUnitSession === 'ULK') {

            require_once __DIR__
                . '/../ulk/sidebar_editor.php';
        }

    } else {

        if ($namaUnitSession === 'UAK') {

            require_once __DIR__
                . '/../uak/sidebar_staff.php';

        } elseif ($namaUnitSession === 'UPU') {

            require_once __DIR__
                . '/../upu/sidebar_staff.php';

        } elseif ($namaUnitSession === 'UPA') {

            require_once __DIR__
                . '/../upa/sidebar_staff.php';

        } elseif ($namaUnitSession === 'ULK') {

            require_once __DIR__
                . '/../ulk/sidebar_staff.php';
        }
    }
}
?>

<div class="container-fluid mt-4" data-bpa-list-page="program">

    <!-- TAJUK DAN BUTANG EXPORT -->
    <div
        class="d-flex justify-content-between align-items-center mb-3 program-page-header no-print"
    >

        <div>

            <h4 class="fw-bold mb-0">
                Senarai Program BPA
            </h4>

            <small class="text-muted">
                Senarai program ditapis mengikut tahun
            </small>

        </div>

        <div class="d-flex gap-2 program-page-actions" aria-label="Eksport senarai program">

            <a
                href="/bpa/laporan/program_export_excel.php?<?= htmlspecialchars($exportParams) ?>"
                class="program-list-action program-list-action--excel"
            >
                <span class="program-list-action-icon"><i class="bi bi-file-earmark-spreadsheet" aria-hidden="true"></i></span>
                <span>Excel</span>
            </a>

            <a
                href="/bpa/laporan/program_export_pdf.php?<?= htmlspecialchars($exportParams) ?>"
                class="program-list-action program-list-action--pdf"
                target="_blank"
            >
                <span class="program-list-action-icon"><i class="bi bi-file-earmark-pdf-fill" aria-hidden="true"></i></span>
                <span>PDF</span>
            </a>

        </div>

    </div>

    <!-- ERROR -->
    <?php if ($errors): ?>

        <div class="alert alert-danger no-print">

            <?php foreach ($errors as $error): ?>

                <div>
                    <?= htmlspecialchars($error) ?>
                </div>

            <?php endforeach; ?>

        </div>

    <?php endif; ?>

    <!-- FILTER -->
    <div
        class="card shadow-sm border-0 mb-3 filter-card program-filter-card no-print"
    >

        <div class="card-body">

            <div class="program-filter-heading">
                <h5>Carian Program</h5>
                <p>Cari dan tapis program mengikut tahun, unit atau status.</p>
            </div>

            <form
                method="get"
                class="search-toolbar-group program-filter-form"
                data-program-filter-form
                role="search"
            >
                <div class="search-box program-search-box">
                    <i class="bi bi-search" aria-hidden="true"></i>
                    <input
                        type="search"
                        name="q"
                        placeholder="Cari nama program..."
                        value="<?= htmlspecialchars($q) ?>"
                        aria-label="Cari program"
                        autocomplete="off"
                    >
                </div>

                <div class="toolbar-group toolbar-control-cluster program-filter-group" role="group" aria-label="Penapis program">
                    <label class="visually-hidden" for="programYearFilter">Tapis mengikut tahun</label>
                    <select id="programYearFilter" name="tahun" class="program-filter-select"
                            data-icon="bi-calendar3" data-icon-only="true" aria-label="Pilih tahun">
                        <?php foreach ($years as $year): ?>
                            <option value="<?= (int)$year ?>" data-icon="bi-calendar3"
                                    <?= (string)$yearFilter === (string)$year ? 'selected' : '' ?>>
                                <?= (int)$year ?>
                            </option>
                        <?php endforeach; ?>
                    </select>

                    <?php
                        $unitIcons = [
                            'UPP' => 'bi-clipboard2-check',
                            'UAK' => 'bi-moon-stars',
                            'UPU' => 'bi-briefcase',
                            'ULK' => 'bi-mortarboard',
                            'UPA' => 'bi-tree',
                        ];
                        $statusIcons = [
                            'draft' => 'bi-pencil-square',
                            'aktif' => 'bi-play-circle',
                            'selesai' => 'bi-check-circle',
                            'batal' => 'bi-x-circle',
                        ];
                    ?>
                    <label class="visually-hidden" for="programUnitFilter">Tapis mengikut unit</label>
                    <select id="programUnitFilter" name="unit_id" class="program-filter-select"
                            data-icon="bi-diagram-3" data-icon-only="true" aria-label="Pilih unit">
                        <option value="" data-icon="bi-diagram-3" <?= $unitFilter === '' ? 'selected' : '' ?>>Semua Unit</option>
                        <?php foreach ($units as $unit): ?>
                            <?php $unitIcon = $unitIcons[strtoupper((string)$unit['nama_unit'])] ?? 'bi-building'; ?>
                            <option value="<?= (int)$unit['unit_id'] ?>" data-icon="<?= htmlspecialchars($unitIcon) ?>"
                                    <?= ((string)$unitFilter === (string)$unit['unit_id']) ? 'selected' : '' ?>>
                                <?= htmlspecialchars($unit['nama_unit']) ?>
                            </option>
                        <?php endforeach; ?>
                    </select>

                    <label class="visually-hidden" for="programStatusFilter">Tapis mengikut status</label>
                    <select id="programStatusFilter" name="status" class="program-filter-select"
                            data-icon="bi-funnel" data-icon-only="true" aria-label="Pilih status">
                        <option value="" data-icon="bi-funnel" <?= $statusFilter === '' ? 'selected' : '' ?>>Semua Status</option>
                        <?php foreach ($allowedStatus as $status): ?>
                            <option value="<?= htmlspecialchars($status) ?>"
                                    data-icon="<?= htmlspecialchars($statusIcons[$status] ?? 'bi-circle') ?>"
                                    <?= $statusFilter === $status ? 'selected' : '' ?>>
                                <?= htmlspecialchars(ucfirst($status)) ?>
                            </option>
                        <?php endforeach; ?>
                    </select>

                </div>

            </form>

        </div>

    </div>

    <div data-program-results>
    <!-- RINGKASAN -->
    <div class="row g-3 mb-3 no-print">

        <div class="col-md">

            <div
                class="card shadow-sm border-0 summary-card h-100"
            >

                <div class="card-body">

                    <small class="text-muted">
                        Jumlah Program
                    </small>

                    <div class="summary-number" data-program-summary="programs">
                        <?= number_format($jumlahProgram) ?>
                    </div>

                </div>

            </div>

        </div>

        <div class="col-md">

            <div
                class="card shadow-sm border-0 summary-card h-100"
            >

                <div class="card-body">

                    <small class="text-muted">
                        Jumlah Peserta
                    </small>

                    <div class="summary-number" data-program-summary="participants">
                        <?= number_format($jumlahPeserta) ?>
                    </div>

                </div>

            </div>

        </div>

        <div class="col-md">

            <div
                class="card shadow-sm border-0 summary-card h-100"
            >

                <div class="card-body">

                    <small class="text-muted">
                        Jumlah Peruntukan
                    </small>

                    <div class="summary-number" data-program-summary="allocation">
                        RM <?= number_format(
                            $jumlahPeruntukan,
                            2
                        ) ?>
                    </div>

                </div>

            </div>

        </div>

        <div class="col-md">

            <div
                class="card shadow-sm border-0 summary-card h-100"
            >

                <div class="card-body">

                    <small class="text-muted">
                        Jumlah Perbelanjaan
                    </small>

                    <div class="summary-number" data-program-summary="spending">
                        RM <?= number_format(
                            $jumlahPerbelanjaan,
                            2
                        ) ?>
                    </div>

                </div>

            </div>

        </div>

        <div class="col-md">

            <div
                class="card shadow-sm border-0 summary-card h-100"
            >

                <div class="card-body">

                    <small class="text-muted">
                        Dana Wakalah
                    </small>

                    <div class="summary-number" data-program-summary="wakalah">
                        RM <?= number_format(
                            $jumlahDanaWakalah,
                            2
                        ) ?>
                    </div>

                </div>

            </div>

        </div>

    </div>

    <!-- JADUAL LAPORAN -->
    <div class="content-card program-report-card">

        <div class="sku-table-header">
            <div>
                <h5>
                    Program Bahagian Pembangunan Asnaf
                    <?= htmlspecialchars($tajukTahun) ?>
                </h5>

                <span>
                    Tempoh:
                    <?= htmlspecialchars(date('d/m/Y', strtotime($tarikhDari))) ?>
                    hingga
                    <?= htmlspecialchars(date('d/m/Y', strtotime($tarikhHingga))) ?>
                    |
                    Unit: <?= htmlspecialchars($namaUnitDipilih) ?>
                </span>
            </div>
            <span class="sku-record-count"><?= count($rows) ?> rekod</span>
        </div>

        <div class="table-card program-report-table-card">

            <div class="table-responsive report-table-wrapper">

                <table
                    class="table table-report mb-0"
                >

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

                            <th class="col-peserta">
                                PESERTA
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

                            <th class="col-action" aria-label="Tindakan"></th>

                        </tr>

                    </thead>

                    <tbody>

                    <?php if (!$rows): ?>

                        <tr>

                            <td
                                colspan="8"
                                class="text-center text-muted py-4"
                            >
                                Tiada program dijumpai
                                berdasarkan filter yang dipilih.
                            </td>

                        </tr>

                    <?php else: ?>

                        <?php foreach ($rows as $index => $row): ?>

                            <tr
                                class="program-report-row"
                                data-program-row
                                data-program-participants="<?= (int)($row['bil_peserta_paparan'] ?? 0) ?>"
                                data-program-allocation="<?= number_format((float)($row['peruntukan_rm'] ?? 0), 2, '.', '') ?>"
                                data-program-spending="<?= number_format((float)($row['perbelanjaan_rm'] ?? 0), 2, '.', '') ?>"
                                data-program-wakalah="<?= number_format((float)($row['dana_wakalah_rm'] ?? 0), 2, '.', '') ?>"
                                tabindex="0"
                                aria-selected="false"
                            >

                                <td class="center">

                                    <strong>
                                        <?= $index + 1 ?>
                                    </strong>

                                </td>

                                <td class="center">

                                    <?php
                                    $namaUnit = formatProgramReportText(
                                        $row['nama_unit'] ?? null
                                    );
                                    $unitBadgeColor = $reportUnitBadgeColors[
                                        strtoupper(trim($namaUnit))
                                    ] ?? 'blue';
                                    ?>
                                    <span class="badge status-badge budget-unit-badge bpa-dashboard-card--<?= htmlspecialchars($unitBadgeColor) ?>">
                                        <?= htmlspecialchars($namaUnit) ?>
                                    </span>

                                </td>

                                <td>

                                    <?= nl2br(
                                        htmlspecialchars(
                                            formatProgramReportText(
                                                $row['nama_program']
                                                    ?? null
                                            )
                                        )
                                    ) ?>

                                    <div class="mt-2 no-print">

                                        <?= reportStatusBadge(
                                            $row['status']
                                                ?? ''
                                        ) ?>

                                    </div>

                                </td>

                                <td class="center">

                                    <?= number_format(
                                        (int)(
                                            $row['bil_peserta_paparan']
                                            ?? 0
                                        )
                                    ) ?>

                                </td>

                                <td class="money">

                                    <?= htmlspecialchars(number_format((float)($row['peruntukan_rm'] ?? 0), 2)) ?>

                                </td>

                                <td class="money">

                                    <?= htmlspecialchars(number_format((float)($row['perbelanjaan_rm'] ?? 0), 2)) ?>

                                </td>

                                <td class="money">

                                    <?= htmlspecialchars(number_format((float)($row['dana_wakalah_rm'] ?? 0), 2)) ?>

                                </td>

                                <td class="center col-action">
                                    <?php
                                    $unitCode = strtoupper(trim((string)($row['nama_unit'] ?? '')));
                                    $programViewUnits = ['UPP', 'UAK', 'UPU', 'UPA', 'ULK'];
                                    if (in_array($unitCode, $programViewUnits, true)):
                                        $viewUrl = '/bpa/' . strtolower($unitCode) . '/program_view?id=' . (int)$row['program_id'];
                                    ?>
                                        <a class="program-detail-action"
                                           href="<?= htmlspecialchars($viewUrl, ENT_QUOTES, 'UTF-8') ?>"
                                           aria-label="Lihat perincian program"
                                           title="Lihat perincian">
                                            <i class="bi bi-eye" aria-hidden="true"></i>
                                        </a>
                                    <?php endif; ?>
                                </td>

                            </tr>

                        <?php endforeach; ?>

                    <?php endif; ?>

                    </tbody>

                </table>

            </div>

        </div>

    </div>

</div>

</div>

<script
    src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"
></script>

</body>
</html>