<?php
require_once __DIR__ . '/../init.php';
require_login();

$user = $_SESSION['user'] ?? [];
$role = $user['role'] ?? 'staff';
$unitIdLogin = $user['unit_id'] ?? null;
$name = htmlspecialchars($user['user_nama'] ?? 'User');

$units = $pdo->query("SELECT unit_id, nama_unit FROM unit ORDER BY nama_unit")->fetchAll(PDO::FETCH_ASSOC);

$tahun = trim($_GET['tahun'] ?? date('Y'));
$scope = $_GET['scope_type'] ?? 'ALL';
$unitFilter = $_GET['unit_id'] ?? '';
$q = trim($_GET['q'] ?? '');

if (!ctype_digit((string)$tahun)) $tahun = date('Y');
if (!in_array($scope, ['ALL','BPA','UNIT'], true)) $scope = 'ALL';

$bulanSemasa = (int)date('n');

if ($role === 'admin' && $_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['delete_id'])) {
    $deleteId = filter_var($_POST['delete_id'], FILTER_VALIDATE_INT);
    $isAjaxRequest = ($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '') === 'XMLHttpRequest';

    if (!$deleteId || $deleteId < 1) {
        if ($isAjaxRequest) {
            http_response_code(400);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode(['success' => false, 'message' => 'Rekod SKU tidak sah.']);
            exit;
        }
        $msg = "Rekod SKU tidak sah.";
    } else {
        try {
            $delete = $pdo->prepare("DELETE FROM sku_aktiviti WHERE sku_aktiviti_id=?");
            $delete->execute([$deleteId]);
            $deleted = $delete->rowCount() > 0;
            $msg = $deleted ? "SKU berjaya dipadam." : "Rekod SKU tidak ditemui.";

            if ($isAjaxRequest) {
                if (!$deleted) http_response_code(404);
                header('Content-Type: application/json; charset=utf-8');
                echo json_encode(['success' => $deleted, 'message' => $msg]);
                exit;
            }
        } catch (Throwable $e) {
            if ($isAjaxRequest) {
                http_response_code(500);
                header('Content-Type: application/json; charset=utf-8');
                echo json_encode(['success' => false, 'message' => 'Gagal padam SKU.']);
                exit;
            }
            $msg = "Gagal padam SKU: " . $e->getMessage();
        }
    }

    $params = $_GET;
    $params['msg'] = $msg;
    header("Location: sku_list.php?" . http_build_query($params));
    exit;
}
$msg = $_GET['msg'] ?? '';

function includeSidebarSkuPage(string $role, $unitIdLogin): void {
    if ($role === 'admin') {
        $p = __DIR__ . '/sidebar.php';
        if (file_exists($p)) require $p;
        return;
    }

    $map = [
        1 => 'uak',
        2 => 'upu',
        3 => 'upa',
        4 => 'ulk',
    ];

    $folder = $map[(int)$unitIdLogin] ?? null;
    if (!$folder) return;

    if ($role === 'editor') {
        $p = __DIR__ . "/../{$folder}/sidebar_editor.php";
        if (file_exists($p)) require $p;
        return;
    }

    $p = __DIR__ . "/../{$folder}/sidebar_staff.php";
    if (file_exists($p)) require $p;
}

$sql = "
SELECT
  s.sku_aktiviti_id,
  s.tahun,
  s.scope_type,
  s.unit_id,
  u.nama_unit,
  s.bil,
  s.nama_aktiviti,
  s.peruntukan_paparan_rm,
  s.jenis_sasaran,
  s.cara_kira_pencapaian,
  s.sasaran_nilai,
  s.sasaran_unit,
  s.sasaran_rm,
  s.anggaran_akhir_tahun,
  s.manual_semasa_nilai,
  s.catatan,

  (
    SELECT COUNT(*)
    FROM program p
    WHERE p.status = 'selesai'
      AND p.tahun = s.tahun
      AND (p.tarikh_mula IS NULL OR MONTH(p.tarikh_mula) <= :bulan)
      AND (
            (
              s.jenis_sasaran = 'PERATUS_BAJET'
              AND s.scope_type = 'BPA'
            )
            OR
            (
              s.jenis_sasaran = 'PERATUS_BAJET'
              AND s.scope_type = 'UNIT'
              AND p.unit_id = s.unit_id
            )
            OR
            (
              s.jenis_sasaran <> 'PERATUS_BAJET'
              AND p.sku_aktiviti_id = s.sku_aktiviti_id
            )
          )
  ) AS semasa_count_program,

  (
    SELECT COALESCE(SUM(
      CASE
        WHEN p.unit_id = 4 THEN COALESCE(ud.jumlah_peserta_semasa, 0)
        ELSE COALESCE(p.bil_peserta, 0)
      END
    ),0)
    FROM program p
    LEFT JOIN program_ulk_detail ud ON ud.program_id = p.program_id
    WHERE p.status = 'selesai'
      AND p.tahun = s.tahun
      AND (p.tarikh_mula IS NULL OR MONTH(p.tarikh_mula) <= :bulan)
      AND (
            (
              s.jenis_sasaran = 'PERATUS_BAJET'
              AND s.scope_type = 'BPA'
            )
            OR
            (
              s.jenis_sasaran = 'PERATUS_BAJET'
              AND s.scope_type = 'UNIT'
              AND p.unit_id = s.unit_id
            )
            OR
            (
              s.jenis_sasaran <> 'PERATUS_BAJET'
              AND p.sku_aktiviti_id = s.sku_aktiviti_id
            )
          )
  ) AS semasa_sum_peserta,

  (
    SELECT COALESCE(SUM(COALESCE(ud.jumlah_peserta_pendapatan_atas_10k,0)),0)
    FROM program p
    LEFT JOIN program_upu_detail ud ON ud.program_id = p.program_id
    WHERE p.status = 'selesai'
      AND p.tahun = s.tahun
      AND (p.tarikh_mula IS NULL OR MONTH(p.tarikh_mula) <= :bulan)
      AND p.sku_aktiviti_id = s.sku_aktiviti_id
) AS semasa_sum_peserta_10k,

(
    SELECT COALESCE(SUM(COALESCE(ud.jumlah_peserta_bayar_zakat,0)),0)
    FROM program p
    LEFT JOIN program_upu_detail ud ON ud.program_id = p.program_id
    WHERE p.status = 'selesai'
      AND p.tahun = s.tahun
      AND (p.tarikh_mula IS NULL OR MONTH(p.tarikh_mula) <= :bulan)
      AND p.sku_aktiviti_id = s.sku_aktiviti_id
) AS semasa_sum_peserta_zakat,

  (
    SELECT COALESCE(SUM(COALESCE(p.perbelanjaan_rm,0)),0)
    FROM program p
    WHERE p.status = 'selesai'
      AND p.tahun = s.tahun
      AND (p.tarikh_mula IS NULL OR MONTH(p.tarikh_mula) <= :bulan)
      AND (
            (
              s.jenis_sasaran = 'PERATUS_BAJET'
              AND s.scope_type = 'BPA'
            )
            OR
            (
              s.jenis_sasaran = 'PERATUS_BAJET'
              AND s.scope_type = 'UNIT'
              AND p.unit_id = s.unit_id
            )
            OR
            (
              s.jenis_sasaran <> 'PERATUS_BAJET'
              AND p.sku_aktiviti_id = s.sku_aktiviti_id
            )
          )
  ) AS semasa_sum_rm

FROM sku_aktiviti s
LEFT JOIN unit u ON u.unit_id = s.unit_id
WHERE s.tahun = :tahun
";
$params = [
    ':tahun' => (int)$tahun,
    ':bulan' => $bulanSemasa
];

if ($unitFilter === 'BPA' || ($unitFilter === '' && $scope === 'BPA')) {
    $sql .= " AND s.scope_type = 'BPA' ";
} elseif (
    $unitFilter === 'UNIT' ||
    ($unitFilter === '' && $scope === 'UNIT') ||
    ctype_digit((string)$unitFilter)
) {
    $sql .= " AND s.scope_type = 'UNIT' ";
    if (ctype_digit((string)$unitFilter)) {
        $sql .= " AND s.unit_id = :unit_id ";
        $params[':unit_id'] = (int)$unitFilter;
    }
}

if ($q !== '') {
    $sql .= " AND s.nama_aktiviti LIKE :q ";
    $params[':q'] = "%$q%";
}

$sql .= " ORDER BY s.scope_type ASC, s.bil ASC ";

$stmt = $pdo->prepare($sql);
$stmt->execute($params);
$rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
$hasSkuNotes = false;
foreach ($rows as $row) {
    if (trim((string)($row['catatan'] ?? '')) !== '') {
        $hasSkuNotes = true;
        break;
    }
}
$showSkuActions = $role === 'admin' || $hasSkuNotes;

$years = $pdo->query("SELECT DISTINCT tahun FROM sku_aktiviti ORDER BY tahun DESC")->fetchAll(PDO::FETCH_COLUMN);

function formatSasaranNombor($nilai) {
    if ($nilai === null) return '';
    $v = (float)$nilai;
    if (abs($v - round($v)) < 0.00001) return (string)intval(round($v));
    return rtrim(rtrim(number_format($v, 2, '.', ''), '0'), '.');
}

function formatPercent($v) {
    if ($v === null) return '-';
    if (abs($v - round($v)) < 0.00001) return (string)intval(round($v)) . '%';
    return rtrim(rtrim(number_format((float)$v, 2, '.', ''), '0'), '.') . '%';
}

function getSemasaNilai(array $r) {
    $jenis = $r['jenis_sasaran'] ?? 'BILANGAN';
    $cara  = $r['cara_kira_pencapaian'] ?? 'COUNT_PROGRAM';

    if ($jenis === 'PERATUS_BAJET') {
        if ($cara === 'MANUAL') {
            return ($r['manual_semasa_nilai'] === null ? null : (float)$r['manual_semasa_nilai']);
        }
        return (float)($r['semasa_sum_rm'] ?? 0);
    }

    if ($cara === 'SUM_PESERTA') return (float)($r['semasa_sum_peserta'] ?? 0);
    if ($cara === 'SUM_RM') return (float)($r['semasa_sum_rm'] ?? 0);
    if ($cara === 'SUM_PESERTA_10K') return (float)($r['semasa_sum_peserta_10k'] ?? 0);
    if ($cara === 'SUM_PESERTA_ZAKAT') return (float)($r['semasa_sum_peserta_zakat'] ?? 0);
    if ($cara === 'MANUAL') return ($r['manual_semasa_nilai'] === null ? null : (float)$r['manual_semasa_nilai']);

    return (float)($r['semasa_count_program'] ?? 0);
}

function kiraPeratusSemasa(array $r) {
    $jenis = $r['jenis_sasaran'] ?? 'BILANGAN';

    $semasa = getSemasaNilai($r);
    if ($semasa === null) return null;

    if ($jenis === 'PERATUS_BAJET') {
        $targetRm = ($r['sasaran_rm'] !== null) ? (float)$r['sasaran_rm'] : 0;

        if ($targetRm <= 0) {
            return null;
        }

        return ($semasa / $targetRm) * 100;
    }

    $target = (float)($r['sasaran_nilai'] ?? 0);
    if ($target <= 0) return null;

    return ($semasa / $target) * 100;
}
?>
<!DOCTYPE html>
<html lang="ms">
<head>
  <meta charset="UTF-8">
  <title>SKU BPA</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">

  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/css/font-awesome.min.css">

  <style>
    body { background-color:#f4f6f8; padding-top:70px; }
    .offcanvas { width:290px; }

    .sku-table{ width:100%; table-layout: fixed; border-collapse: collapse; }
    .sku-table thead th{
      background:#e9a47f;
      color:#000;
      border:1px solid #000 !important;
      text-align:center;
      vertical-align:middle;
      font-weight:700;
      font-size:12px;
      padding:8px 6px;
      white-space:normal;
    }
    .sku-table tbody td{
      border:1px solid #000 !important;
      vertical-align:top;
      font-size:12px;
      padding:8px 6px;
      white-space:normal;
      word-break: break-word;
      overflow-wrap: anywhere;
    }

    .sku-table:not(.sku-table--actions) .w-bil{ width:5%; }
    .sku-table:not(.sku-table--actions) .w-aktiviti{ width:35%; }
    .sku-table:not(.sku-table--actions) .w-peruntukan{ width:16%; }
    .sku-table:not(.sku-table--actions) .w-sasaran{ width:13%; }
    .sku-table:not(.sku-table--actions) .w-pencapaian{ width:19%; }
    .sku-table:not(.sku-table--actions) .w-anggaran{ width:12%; }
    .sku-table--actions .w-bil{ width:5%; }
    .sku-table--actions .w-aktiviti{ width:28%; }
    .sku-table--actions .w-peruntukan{ width:15%; }
    .sku-table--actions .w-sasaran{ width:12%; }
    .sku-table--actions .w-pencapaian{ width:17%; }
    .sku-table--actions .w-anggaran{ width:9%; }
    .sku-table--actions .w-tindakan{ width:14%; }
    .sku-table .w-tindakan .budget-row-actions{
      display:flex;
      justify-content:flex-end;
      width:100%;
    }
    .sku-table .w-tindakan .budget-row-actions > .budget-row-action,
    .sku-table .w-tindakan .budget-row-actions > form{
      flex:0 0 32px;
    }

    .money{ text-align:right; font-variant-numeric: tabular-nums; }
    .center{ text-align:center; }
    .scope-mini{ font-size:11px; color:#6c757d; margin-top:4px; }
    .scope-mini.scope-mini--badge{
      display:inline-flex;
      align-items:center;
      min-height:24px;
      padding:0 9px;
      border:0;
      border-radius:5px;
      background:#e2e8f0;
      color:#475569;
      font-size:10px;
      font-weight:600;
      letter-spacing:.3px;
      line-height:1.2;
      text-transform:uppercase;
    }
    .scope-mini.scope-mini--badge.bpa-dashboard-card--red{
      background:#fff0f1 !important;
      color:#d93848 !important;
    }
    .scope-mini.scope-mini--badge.bpa-dashboard-card--blue{
      background:#edf5ff !important;
      color:#3478d4 !important;
    }
    .scope-mini.scope-mini--badge.bpa-dashboard-card--purple{
      background:#f4efff !important;
      color:#8251c8 !important;
    }
    .scope-mini.scope-mini--badge.bpa-dashboard-card--green{
      background:#eaf8f1 !important;
      color:#26976a !important;
    }
    .scope-mini.scope-mini--badge.bpa-dashboard-card--yellow{
      background:#fff7df !important;
      color:#d39a10 !important;
    }
    .sub-mini{ font-size:11px; color:#6c757d; margin-top:3px; }

    .actions{
      display:flex;
      gap:6px;
      justify-content:center;
      align-items:center;
      flex-wrap:nowrap;
      white-space:nowrap;
    }
    .action-btn{
      display:inline-flex;
      align-items:center;
      justify-content:center;
      width:28px;
      height:28px;
      border:1px solid #ddd;
      border-radius:8px;
      text-decoration:none;
      background:#fff;
      padding:0;
    }
    .action-btn:hover{ background:#f1f3f5; }
    .action-del{ border-color:#f5c2c7; }
    .action-del:hover{ background:#f8d7da; }

    .sku-note-dialog{
      width:min(560px,calc(100vw - 32px));
      max-width:none;
      max-height:calc(100dvh - 40px);
      padding:0;
      overflow:hidden;
      border:1px solid #e2e8f0;
      border-radius:14px;
      color:#202632;
      background:#f5f7fb;
      box-shadow:0 24px 80px rgba(15,23,42,.24);
    }
    .sku-note-dialog::backdrop{ background:rgba(15,23,42,.52); backdrop-filter:blur(2px); }
    .sku-note-dialog__header{
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:16px;
      padding:16px 20px;
      border-bottom:1px solid #e6e9ef;
      background:#fbfcff;
    }
    .sku-note-dialog__header h2{ margin:0; color:#202632; font-size:16px; font-weight:700; }
    .sku-note-dialog__close{
      display:grid;
      width:32px;
      height:32px;
      flex:0 0 auto;
      place-items:center;
      border:1px solid #e6e9ef;
      border-radius:8px;
      color:#7b8494;
      background:#fff;
      font-size:20px;
      line-height:1;
    }
    .sku-note-dialog__close:hover{ color:#202632; background:#f1f5f9; }
    .sku-note-dialog__body{
      max-height:calc(100dvh - 140px);
      overflow:auto;
      padding:20px;
      color:#526078;
      text-align:left;
      font-size:13px;
      line-height:1.6;
      white-space:normal;
      overflow-wrap:anywhere;
    }
    .sku-note-dialog__body p{ margin:0; }

    .container{ max-width: 1400px; }

    .th-purple{
      background:#e6ddff !important;
    }
  </style>
</head>
<body>

<?php includeSidebarSkuPage($role, $unitIdLogin); ?>

<div class="container mt-4" data-bpa-list-page="sku" data-sku-admin="<?= $role === 'admin' ? 'true' : 'false' ?>">

  <div class="d-flex justify-content-between align-items-center mb-3 sku-page-header">
    <div>
      <h4 class="fw-bold mb-0" data-sku-year-title>SKU BPA (<?= (int)$tahun ?>)</h4>
      <small class="text-muted">
        Kiraan semasa hingga bulan <?= $bulanSemasa ?> (status program: <b>selesai</b>)
      </small>
    </div>
    <div class="sku-page-actions" aria-label="Tindakan senarai SKU">
      <?php if ($role === 'admin'): ?>
        <a href="/bpa/admin/sku_add.php" class="sku-list-action sku-list-action--primary">
          <span class="sku-list-action-icon"><i class="bi bi-plus-lg" aria-hidden="true"></i></span>
          <span>Tambah</span>
        </a>
      <?php endif; ?>

      <a class="sku-list-action sku-list-action--excel" data-sku-export
         href="/bpa/admin/sku_export_excel.php?<?= http_build_query($_GET) ?>">
        <span class="sku-list-action-icon"><i class="bi bi-file-earmark-spreadsheet" aria-hidden="true"></i></span>
        <span>Excel</span>
      </a>

      <a class="sku-list-action sku-list-action--pdf" data-sku-export
         href="/bpa/admin/sku_export_pdf.php?<?= http_build_query($_GET) ?>">
        <span class="sku-list-action-icon"><i class="bi bi-file-earmark-pdf-fill" aria-hidden="true"></i></span>
        <span>PDF</span>
      </a>

      <?php if ($role === 'admin'): ?>
        <a href="/bpa/admin/dashboard_admin.php" data-app-navigation class="sku-list-action">
          <span class="sku-list-action-icon"><i class="bi bi-grid-1x2" aria-hidden="true"></i></span>
          <span>Dashboard</span>
        </a>
      <?php else: ?>
        <a href="/bpa/admin/dashboard_admin.php" data-app-navigation class="sku-list-action">
          <span class="sku-list-action-icon"><i class="bi bi-grid-1x2" aria-hidden="true"></i></span>
          <span>Dashboard</span>
        </a>
      <?php endif; ?>
    </div>
  </div>

  <?php if ($msg): ?>
    <div hidden data-bpa-app-alert="<?= htmlspecialchars($msg, ENT_QUOTES, 'UTF-8') ?>"
         data-bpa-app-alert-type="<?= str_starts_with($msg, 'Gagal') ? 'danger' : 'success' ?>"></div>
  <?php endif; ?>

  <div class="content-card mb-4 dataset-page-header sku-filter-card">
    <div class="sku-filter-heading">
      <h4>Carian SKU</h4>
      <p>Cari aktiviti dan tapis mengikut tahun, skop atau unit.</p>
    </div>
    <div class="sku-filter-controls">
      <form method="get" class="sku-filter-toolbar search-toolbar-group" data-sku-filter-form role="search">
        <div class="search-box sku-search-box">
          <i class="bi bi-search" aria-hidden="true"></i>
          <input type="search" name="q" value="<?= htmlspecialchars($q) ?>"
                 placeholder="Cari nama aktiviti..." aria-label="Cari SKU">
        </div>

        <div class="toolbar-group toolbar-control-cluster sku-filter-group" role="group" aria-label="Penapis SKU">
          <label class="visually-hidden" for="skuYearFilter">Tapis mengikut tahun</label>
          <select id="skuYearFilter" name="tahun" class="sku-filter-select" data-icon="bi-calendar3" data-icon-only="true" aria-label="Pilih tahun">
            <?php if (!$years): ?>
              <option value="<?= htmlspecialchars($tahun) ?>"><?= htmlspecialchars($tahun) ?></option>
            <?php else: ?>
              <?php foreach ($years as $y): ?>
                <option value="<?= (int)$y ?>" <?= ((string)$tahun === (string)$y) ? 'selected' : '' ?>>
                  <?= (int)$y ?>
                </option>
              <?php endforeach; ?>
            <?php endif; ?>
          </select>

          <?php
            $unitIcons = [
              'UAK' => 'bi-moon-stars',
              'UPU' => 'bi-briefcase',
              'ULK' => 'bi-mortarboard',
              'UPA' => 'bi-tree',
            ];
            $selectedUnitFilter = $unitFilter !== ''
              ? (string)$unitFilter
              : ($scope === 'UNIT' ? 'UNIT' : ($scope === 'BPA' ? 'BPA' : ''));
          ?>
          <label class="visually-hidden" for="skuUnitFilter">Tapis mengikut unit</label>
          <select id="skuUnitFilter" name="unit_id" class="sku-filter-select sku-filter-select--unit" data-icon="bi-diagram-3" data-icon-only="true" aria-label="Pilih BPA atau unit">
            <option value="" data-icon="bi-diagram-3" <?= $selectedUnitFilter === '' ? 'selected' : '' ?>>Semua SKU</option>
            <option value="BPA" data-icon="bi-diagram-3" <?= $selectedUnitFilter === 'BPA' ? 'selected' : '' ?>>BPA</option>
            <?php foreach ($units as $un): ?>
              <?php $unitIcon = $unitIcons[strtoupper((string)$un['nama_unit'])] ?? 'bi-building'; ?>
              <option value="<?= (int)$un['unit_id'] ?>" data-icon="<?= htmlspecialchars($unitIcon) ?>" <?= $selectedUnitFilter === (string)$un['unit_id'] ? 'selected' : '' ?>>
                <?= htmlspecialchars($un['nama_unit']) ?>
              </option>
            <?php endforeach; ?>
          </select>
        </div>
      </form>
    </div>
  </div>

  <div class="card shadow-sm border-0 sku-table-card">
    <div class="sku-table-header">
      <div>
        <h5>Senarai SKU</h5>
        <span>Senarai aktiviti dan pencapaian bagi tahun <?= (int)$tahun ?>.</span>
      </div>
      <span class="sku-record-count"><?= count($rows) ?> rekod</span>
    </div>
    <div class="card-body">

      <div class="table-responsive sku-table-wrapper">
      <table class="table sku-table<?= $showSkuActions ? ' sku-table--actions' : '' ?> mb-0">
        <thead>
          <tr>
            <th class="w-bil">BIL.</th>
            <th class="w-aktiviti">AKTIVITI</th>
            <th class="w-peruntukan">PERUNTUKAN (RM)</th>
            <th class="w-sasaran">SASARAN</th>
            <th class="w-pencapaian th-purple">PENCAPAIAN SEMASA</th>
            <th class="w-anggaran">ANGGARAN</th>
            <?php if ($showSkuActions): ?>
              <th class="w-tindakan" aria-label="Tindakan"></th>
            <?php endif; ?>
          </tr>
        </thead>
        <tbody>
          <?php if (!$rows): ?>
            <tr>
              <td colspan="<?= $showSkuActions ? 7 : 6 ?>" class="text-center text-muted py-4">Tiada data SKU.</td>
            </tr>
          <?php else: ?>
            <?php foreach ($rows as $r): ?>
              <?php
                $semasa = getSemasaNilai($r);
                $peratus = kiraPeratusSemasa($r);

                $jumlahPaparan = '-';
                $cara = $r['cara_kira_pencapaian'] ?? 'COUNT_PROGRAM';
                $unitSasaran = trim((string)($r['sasaran_unit'] ?? ''));
                $jenis = $r['jenis_sasaran'] ?? '';

                if ($jenis === 'PERATUS_BAJET') {
                    $val = getSemasaNilai($r);
                    $jumlahPaparan = ($val === null) ? '-' : 'RM ' . number_format((float)$val, 2);
                } elseif ($cara === 'SUM_RM') {
                    $jumlahPaparan = 'RM ' . number_format((float)($r['semasa_sum_rm'] ?? 0), 2);
                } elseif ($cara === 'SUM_PESERTA') {
                    $jumlahPaparan = (string)intval((float)($r['semasa_sum_peserta'] ?? 0)) . ($unitSasaran ? " " . htmlspecialchars($unitSasaran) : '');
                } elseif ($cara === 'COUNT_PROGRAM') {
                    $jumlahPaparan = (string)intval((float)($r['semasa_count_program'] ?? 0)) . ($unitSasaran ? " " . htmlspecialchars($unitSasaran) : '');
                  } elseif ($cara === 'SUM_PESERTA_10K') {
                    $jumlahPaparan = (string)intval((float)($r['semasa_sum_peserta_10k'] ?? 0)) . ($unitSasaran ? " " . htmlspecialchars($unitSasaran) : '');

                } elseif ($cara === 'SUM_PESERTA_ZAKAT') {
                    $jumlahPaparan = (string)intval((float)($r['semasa_sum_peserta_zakat'] ?? 0)) . ($unitSasaran ? " " . htmlspecialchars($unitSasaran) : '');

                  } elseif ($cara === 'MANUAL') {
                    $jumlahPaparan = ($semasa === null) ? '-' : (formatSasaranNombor($semasa) . ($unitSasaran ? " " . htmlspecialchars($unitSasaran) : ''));
                }
              ?>
              <tr>
                <td class="center w-bil"><b><?= (int)$r['bil'] ?></b></td>

                <td class="w-aktiviti">
                  <?= nl2br(htmlspecialchars($r['nama_aktiviti'])) ?>
                  <?php
                    $scopeLabel = $r['scope_type'] === 'BPA'
                      ? 'BPA'
                      : trim((string)($r['nama_unit'] ?? '-'));
                    $scopeColor = [
                      'BPA' => 'red',
                      'UPU' => 'blue',
                      'ULK' => 'purple',
                      'UAK' => 'green',
                      'UPA' => 'yellow',
                    ][strtoupper($scopeLabel)] ?? null;
                  ?>
                  <div class="mt-2 no-print">
                    <span class="scope-mini scope-mini--badge<?= $scopeColor ? ' bpa-dashboard-card--' . $scopeColor : '' ?>">
                      <?= htmlspecialchars($scopeLabel) ?>
                    </span>
                  </div>
                </td>

                <td class="money w-peruntukan">
                  <?= ($r['peruntukan_paparan_rm'] !== null) ? number_format((float)$r['peruntukan_paparan_rm'], 2) : '-' ?>
                </td>

                <td class="center w-sasaran">
                  <?php
                    $sasaranNilaiTxt = formatSasaranNombor($r['sasaran_nilai']);
                    $sasaranUnitTxt = trim((string)($r['sasaran_unit'] ?? ''));
                    $sasaranIsPercent = $sasaranUnitTxt === '%';
                    echo htmlspecialchars($sasaranNilaiTxt . ($sasaranIsPercent ? '%' : ($sasaranUnitTxt ? " " . $sasaranUnitTxt : '')));

                    if (($r['jenis_sasaran'] ?? '') === 'PERATUS_BAJET' && !empty($r['sasaran_rm'])) {
                      echo "<div class='sub-mini sku-sasaran-rm'>RM " . number_format((float)$r['sasaran_rm'], 2) . "</div>";
                    }
                  ?>
                </td>

                <td class="center w-pencapaian">
                  <?php
                    if ($peratus === null) {
                      echo '-';
                    } else {
                      echo "<span class='sku-achievement-badge'>" . htmlspecialchars(formatPercent($peratus)) . "</span>";
                    }

                    if ($semasa !== null && ($r['jenis_sasaran'] ?? '') !== 'PERATUS_BAJET') {
                      echo "<div class='sub-mini'>Semasa:</div>";
                    }

                    if (($r['jenis_sasaran'] ?? '') === 'PERATUS_BAJET') {
                      $rmNow = getSemasaNilai($r);
                      echo "<div class='sub-mini'>Belanja:</div>";
                      echo "<div class='sub-mini sku-current-total'>RM " . number_format((float)$rmNow, 2) . "</div>";
                    }
                    if (($r['jenis_sasaran'] ?? '') !== 'PERATUS_BAJET') {
                      echo "<div class='sub-mini sku-current-total'>" . $jumlahPaparan . "</div>";
                    }
                  ?>
                </td>

                <td class="center w-anggaran">
                  <?= ($r['anggaran_akhir_tahun'] !== null) ? number_format((float)$r['anggaran_akhir_tahun'], 2) : '-' ?>
                </td>

                <?php if ($showSkuActions): ?>
                  <td class="center w-tindakan">
                    <div class="budget-row-actions">
                  <?php $catatan = trim((string)($r['catatan'] ?? '')); ?>
                  <?php if ($catatan !== ''): ?>
                    <?php $noteDialogId = 'sku-note-dialog-' . (int)$r['sku_aktiviti_id']; ?>
                    <button type="button" class="budget-row-action sku-note-action"
                            aria-label="Lihat catatan SKU" title="Lihat catatan"
                            data-sku-note-open="<?= htmlspecialchars($noteDialogId) ?>">
                      <i class="bi bi-three-dots" aria-hidden="true"></i>
                    </button>
                  <?php endif; ?>

                    <?php if ($role === 'admin'): ?>
                      <a class="budget-row-action" aria-label="Edit SKU" title="Edit"
                         data-app-navigation
                         href="/bpa/admin/sku_edit.php?id=<?= (int)$r['sku_aktiviti_id'] ?>">
                        <i class="bi bi-pencil" aria-hidden="true"></i>
                      </a>

                      <form method="post" data-sku-delete-form>
                        <input type="hidden" name="delete_id" value="<?= (int)$r['sku_aktiviti_id'] ?>">
                        <button type="submit" class="budget-row-action budget-row-action--delete"
                                aria-label="Padam SKU" title="Padam">
                          <i class="bi bi-trash3" aria-hidden="true"></i>
                        </button>
                      </form>
                    <?php endif; ?>

                    <?php if ($catatan !== ''): ?>
                      <dialog class="sku-note-dialog" id="<?= htmlspecialchars($noteDialogId) ?>"
                              aria-labelledby="<?= htmlspecialchars($noteDialogId) ?>-title">
                        <header class="sku-note-dialog__header">
                          <h2 id="<?= htmlspecialchars($noteDialogId) ?>-title">Catatan SKU</h2>
                          <button type="button" class="sku-note-dialog__close"
                                  aria-label="Tutup catatan" data-sku-note-close>&times;</button>
                        </header>
                        <div class="sku-note-dialog__body">
                          <p><?= nl2br(htmlspecialchars($catatan)) ?></p>
                        </div>
                      </dialog>
                    <?php endif; ?>
                    </div>
                  </td>
                <?php endif; ?>

              </tr>
            <?php endforeach; ?>
          <?php endif; ?>
        </tbody>
      </table>
      </div>

    </div>
  </div>

</div>

<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>