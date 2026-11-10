<?php
require_once __DIR__ . '/../init.php';
require_login();

$name = htmlspecialchars($_SESSION['user']['user_nama'] ?? 'Admin');

$availableYears = $pdo->query("
  SELECT tahun FROM program WHERE tahun IS NOT NULL
  UNION
  SELECT tahun FROM bajet WHERE tahun IS NOT NULL
  UNION
  SELECT tahun FROM sku_aktiviti WHERE tahun IS NOT NULL
  ORDER BY tahun DESC
")->fetchAll(PDO::FETCH_COLUMN);
$availableYears = array_map('intval', $availableYears);

$requestedYear = $_GET['tahun'] ?? null;
$requestedYear = is_scalar($requestedYear) && ctype_digit((string)$requestedYear)
  ? (int)$requestedYear
  : null;
$tahun = in_array($requestedYear, $availableYears, true)
  ? $requestedYear
  : ($availableYears[0] ?? (int)date('Y'));
$bulanSemasa = (int)date('n');

/* ===============================
   HELPER
=================================*/
function fmtNumberNice($n){
  if ($n === null) return '-';
  $n = (float)$n;
  if (abs($n - round($n)) < 0.00001) return (string)intval(round($n));
  return rtrim(rtrim(number_format($n, 2, '.', ''), '0'), '.');
}
function safe($s){ return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8'); }

/* ===============================
   SUMMARY DATA
=================================*/

// Total program tahun semasa (SEMUA unit)
$stmt = $pdo->prepare("SELECT COUNT(*) FROM program WHERE tahun=?");
$stmt->execute([$tahun]);
$totalProgram = (int)$stmt->fetchColumn();

// Total peruntukan rasmi (SEMUA unit)
$stmt = $pdo->prepare("SELECT COALESCE(SUM(jumlah_peruntukan_rm),0) FROM bajet WHERE tahun=?");
$stmt->execute([$tahun]);
$totalPeruntukan = (float)$stmt->fetchColumn();

// Total belanja PERUNTUKAN sahaja
$stmt = $pdo->prepare("
  SELECT COALESCE(SUM(perbelanjaan_rm),0)
  FROM program
  WHERE tahun=?
");
$stmt->execute([$tahun]);
$totalBelanja = (float)$stmt->fetchColumn();

// Total dana wakalah sahaja
$stmt = $pdo->prepare("
  SELECT COALESCE(SUM(dana_wakalah_rm),0)
  FROM program
  WHERE tahun=?
");
$stmt->execute([$tahun]);
$totalWakalah = (float)$stmt->fetchColumn();

// Total baki = peruntukan - belanja peruntukan sahaja
$totalBaki = $totalPeruntukan - $totalBelanja;

// % penggunaan bajet = belanja peruntukan / peruntukan
$percentBajet = $totalPeruntukan > 0 ? ($totalBelanja / $totalPeruntukan * 100) : 0;

// Paparan %: kalau kecil sangat, bagi 3 decimal supaya nampak naik
$pctDecimals = ($percentBajet > 0 && $percentBajet < 1) ? 3 : 1;
$pctDisplay  = number_format($percentBajet, $pctDecimals);

/* ===============================
   CHARTS DATA
=================================*/

// Program ikut unit (untuk chart)
$unitDataStmt = $pdo->prepare("
  SELECT u.nama_unit, u.unit_id, COUNT(p.program_id) AS total
  FROM unit u
  LEFT JOIN program p
    ON p.unit_id = u.unit_id
   AND p.tahun = :tahun
  GROUP BY u.unit_id, u.nama_unit
  ORDER BY u.unit_id ASC
");
$unitDataStmt->execute([':tahun'=>$tahun]);
$unitData = $unitDataStmt->fetchAll(PDO::FETCH_ASSOC);
$bpaChartPalette = ['#60A5FA','#FB923C','#34D399','#A78BFA','#F472B6','#FACC15','#22D3EE','#F87171'];
$bpaStatusColors = [
  'draft' => $bpaChartPalette[0],
  'aktif' => $bpaChartPalette[1],
  'selesai' => $bpaChartPalette[2],
  'batal' => $bpaChartPalette[3]
];

// Status program chart
$statusRows = $pdo->prepare("
  SELECT status, COUNT(*) AS total
  FROM program
  WHERE tahun = :tahun
  GROUP BY status
");
$statusRows->execute([':tahun'=>$tahun]);
$statusData = $statusRows->fetchAll(PDO::FETCH_KEY_PAIR);

/* ===============================
   SKU SECTION (Admin View)
=================================*/

// SKU BPA
$stmt = $pdo->prepare("
  SELECT sku_aktiviti_id, bil, nama_aktiviti, jenis_sasaran, sasaran_nilai, sasaran_unit,
         peruntukan_paparan_rm, sasaran_rm, scope_type, unit_id, cara_kira_pencapaian, manual_semasa_nilai
  FROM sku_aktiviti
  WHERE tahun = :tahun AND scope_type='BPA'
  ORDER BY bil ASC
");
$stmt->execute([':tahun'=>$tahun]);
$skuBPA = $stmt->fetchAll(PDO::FETCH_ASSOC);

// SKU UNIT grouped by unit
$units = $pdo->query("SELECT unit_id, nama_unit, keterangan FROM unit ORDER BY unit_id ASC")->fetchAll(PDO::FETCH_ASSOC);
$stmt = $pdo->prepare("
  SELECT sku_aktiviti_id, unit_id, bil, nama_aktiviti, jenis_sasaran, sasaran_nilai, sasaran_unit,
         peruntukan_paparan_rm, sasaran_rm, scope_type, cara_kira_pencapaian, manual_semasa_nilai
  FROM sku_aktiviti
  WHERE tahun = :tahun AND scope_type='UNIT'
  ORDER BY unit_id ASC, bil ASC
");
$stmt->execute([':tahun'=>$tahun]);
$skuUNITraw = $stmt->fetchAll(PDO::FETCH_ASSOC);

$skuUNIT = [];
foreach ($skuUNITraw as $r) {
  $uid = (int)$r['unit_id'];
  $skuUNIT[$uid][] = $r;
}

// Function kira progress SKU (mirror logic sku_list.php)
function calcSkuProgress(PDO $pdo, array $sku, int $tahun, ?int $unitIdFilter, int $bulanSemasa){
  $skuId = (int)$sku['sku_aktiviti_id'];
  $jenis = $sku['jenis_sasaran'] ?? 'BILANGAN';
  $cara  = $sku['cara_kira_pencapaian'] ?? 'COUNT_PROGRAM';
  $scope = $sku['scope_type'] ?? 'ALL';
  $sasaranNilai = (float)($sku['sasaran_nilai'] ?? 0);

  $semasa = 0;
  $pct = 0;

  if ($jenis === 'PERATUS_BAJET') {
    // IKUT LOGIK SKU_LIST:
    // BPA = semua program selesai bahagian
    // UNIT = semua program selesai unit itu
    if ($scope === 'BPA') {
      $stmt = $pdo->prepare("
        SELECT COALESCE(SUM(COALESCE(p.perbelanjaan_rm,0)),0)
        FROM program p
        WHERE p.status = 'selesai'
          AND p.tahun = :tahun
          AND (p.tarikh_mula IS NULL OR MONTH(p.tarikh_mula) <= :bulan)
      ");
      $stmt->execute([
        ':tahun' => $tahun,
        ':bulan' => $bulanSemasa
      ]);
    } else {
      $stmt = $pdo->prepare("
        SELECT COALESCE(SUM(COALESCE(p.perbelanjaan_rm,0)),0)
        FROM program p
        WHERE p.status = 'selesai'
          AND p.tahun = :tahun
          AND p.unit_id = :unit_id
          AND (p.tarikh_mula IS NULL OR MONTH(p.tarikh_mula) <= :bulan)
      ");
      $stmt->execute([
        ':tahun' => $tahun,
        ':unit_id' => $unitIdFilter,
        ':bulan' => $bulanSemasa
      ]);
    }

    $semasa = (float)$stmt->fetchColumn();

    $targetRm = ($sku['sasaran_rm'] !== null) ? (float)$sku['sasaran_rm'] : 0;
    if ($targetRm > 0) {
      $pct = ($semasa / $targetRm) * 100;
    } else {
      $pct = 0;
    }

  } else {
    if ($cara === 'SUM_PESERTA') {
      $params = [
        ':tahun' => $tahun,
        ':sku_id' => $skuId,
        ':bulan' => $bulanSemasa
      ];
      $whereUnit = '';

      if ($unitIdFilter !== null) {
        $whereUnit = " AND p.unit_id = :unit_id ";
        $params[':unit_id'] = $unitIdFilter;
      }

      $stmt = $pdo->prepare("
        SELECT COALESCE(SUM(
          CASE
            WHEN p.unit_id = 4 THEN COALESCE(ud.jumlah_peserta_semasa, 0)
            ELSE COALESCE(p.bil_peserta, 0)
          END
        ),0)
        FROM program p
        LEFT JOIN program_ulk_detail ud ON ud.program_id = p.program_id
        WHERE p.status = 'selesai'
          AND p.tahun = :tahun
          AND p.sku_aktiviti_id = :sku_id
          AND (p.tarikh_mula IS NULL OR MONTH(p.tarikh_mula) <= :bulan)
          $whereUnit
      ");
      $stmt->execute($params);
      $semasa = (float)$stmt->fetchColumn();

    } elseif ($cara === 'SUM_RM') {
      $params = [
        ':tahun' => $tahun,
        ':sku_id' => $skuId,
        ':bulan' => $bulanSemasa
      ];
      $whereUnit = '';

      if ($unitIdFilter !== null) {
        $whereUnit = " AND p.unit_id = :unit_id ";
        $params[':unit_id'] = $unitIdFilter;
      }

      $stmt = $pdo->prepare("
        SELECT COALESCE(SUM(COALESCE(p.perbelanjaan_rm,0)),0)
        FROM program p
        WHERE p.status = 'selesai'
          AND p.tahun = :tahun
          AND p.sku_aktiviti_id = :sku_id
          AND (p.tarikh_mula IS NULL OR MONTH(p.tarikh_mula) <= :bulan)
          $whereUnit
      ");
      $stmt->execute($params);
      $semasa = (float)$stmt->fetchColumn();

    } elseif ($cara === 'MANUAL') {
      $semasa = ($sku['manual_semasa_nilai'] === null) ? null : (float)$sku['manual_semasa_nilai'];

    } else {
      // default COUNT_PROGRAM
      $params = [
        ':tahun' => $tahun,
        ':sku_id' => $skuId,
        ':bulan' => $bulanSemasa
      ];
      $whereUnit = '';

      if ($unitIdFilter !== null) {
        $whereUnit = " AND p.unit_id = :unit_id ";
        $params[':unit_id'] = $unitIdFilter;
      }

      $stmt = $pdo->prepare("
        SELECT COUNT(*)
        FROM program p
        WHERE p.status = 'selesai'
          AND p.tahun = :tahun
          AND p.sku_aktiviti_id = :sku_id
          AND (p.tarikh_mula IS NULL OR MONTH(p.tarikh_mula) <= :bulan)
          $whereUnit
      ");
      $stmt->execute($params);
      $semasa = (float)$stmt->fetchColumn();
    }

    if ($semasa === null) {
      $pct = 0;
    } else {
      $pct = ($sasaranNilai > 0) ? (($semasa / $sasaranNilai) * 100) : 0;
    }
  }

  if ($pct < 0) $pct = 0;
  if ($pct > 150) $pct = 150;

  return [$semasa, $pct];
}
?>
<!DOCTYPE html>
<html lang="ms">
<head>
<meta charset="UTF-8">
<title>Dashboard Admin BPA</title>
<meta name="viewport" content="width=device-width, initial-scale=1">

<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/css/font-awesome.min.css">
<?php if (!defined('BPA_RENDER_IN_APP_SHELL') || !BPA_RENDER_IN_APP_SHELL): ?>
<script src="/js/chart.umd.min.js"></script>
<?php endif; ?>

<style>
body{background:#f4f6f8;padding-top:70px;}
.kpi-card{
  border-radius:16px;
  color:#fff;
  padding:18px;
  min-height:136px;
  display:flex;
  flex-direction:column;
  justify-content:center;
}
.kpi-card.sm{
  padding:14px;
  min-height:136px;
}
.gradient-blue{background:linear-gradient(135deg,#1e3c72,#2a5298);}
.gradient-green{background:linear-gradient(135deg,#11998e,#38ef7d);}
.gradient-orange{background:linear-gradient(135deg,#f7971e,#ffd200); color:#1f1f1f;}
.gradient-dark{background:linear-gradient(135deg,#232526,#414345);}
.gradient-purple{background:linear-gradient(135deg,#6d28d9,#9333ea);}
.kpi-number{font-size:28px;font-weight:800;}
.kpi-number.sm{font-size:22px;font-weight:800;}
.kpi-sub{
  font-size:12px;
  font-weight:600;
  line-height:1.35;
  margin-top:6px;
}
.card{border-radius:16px;}
.small-muted{font-size:12px;color:#6c757d;}
.sku-card{border:1px solid #eef0f3;}
.sku-title{font-weight:800;font-size:14px; line-height:1.2;}
.badge-soft{background:#eef2ff;color:#3730a3;border-radius:999px;padding:6px 10px;font-size:12px;}
.progress{height:10px;border-radius:999px;}
.progress-bar{border-radius:999px;}
.miniChartWrap{width:90px;height:90px;margin:auto;}

/* KPI 1 baris: 3 besar + 2 kecil */
.kpi-row{ display:flex; gap:12px; flex-wrap:wrap; }
.kpi-big{ flex:1 1 0; min-width:240px; }
.kpi-small{ flex:0 0 200px; }
@media (min-width: 992px){
  .kpi-row{ flex-wrap:nowrap; }
  .kpi-small{ flex:0 0 180px; }
}
</style>
</head>
<body>

<?php include __DIR__ . '/sidebar.php'; ?>

<div class="container mt-4">

  <div class="d-flex justify-content-between align-items-center mb-3 bpa-admin-toolbar">
    <div class="bpa-admin-heading">
      <h4 class="fw-bold mb-0">Dashboard Admin BPA (<?= (int)$tahun ?>)</h4>
      <div class="small-muted">Ringkasan bajet + program + SKU (auto dari data)</div>
    </div>

    <div class="bpa-admin-tools">
      <form class="bpa-admin-year-form" method="get">
        <label class="visually-hidden" for="bpa-dashboard-year">Tahun dashboard</label>
        <input id="bpa-dashboard-year" name="tahun" type="number"
               class="form-control bpa-admin-year-select" aria-label="Pilih tahun dashboard"
               value="<?= $tahun ?>"
               <?= $availableYears ? 'min="' . min($availableYears) . '" max="' . max($availableYears) . '"' : 'disabled' ?>
               step="1" inputmode="numeric"
               data-current-year="<?= $tahun ?>"
               data-available-years="<?= safe(json_encode($availableYears)) ?>">
      </form>
      <nav class="bpa-admin-actions" aria-label="Pautan dashboard BPA">
        <a class="bpa-admin-action bpa-admin-action--sku" href="/bpa/admin/sku_list"
           data-app-navigation>
          <span class="bpa-admin-action-icon"><i class="bi bi-bullseye" aria-hidden="true"></i></span>
          <span>SKU</span>
        </a>
        <a class="bpa-admin-action bpa-admin-action--budget" href="/bpa/admin/bajet_list"
           data-app-navigation>
          <span class="bpa-admin-action-icon"><i class="bi bi-cash-coin" aria-hidden="true"></i></span>
          <span>Bajet</span>
        </a>
        <a class="bpa-admin-action bpa-admin-action--program" href="/bpa/laporan/program_list"
           data-app-navigation>
          <span class="bpa-admin-action-icon"><i class="bi bi-file-earmark-text" aria-hidden="true"></i></span>
          <span>Program</span>
        </a>
        <a class="bpa-admin-action bpa-admin-action--pdf"
           href="/bpa/admin/dashboard_admin_export_pdf.php?tahun=<?= $tahun ?>">
          <span class="bpa-admin-action-icon"><i class="bi bi-file-earmark-pdf-fill" aria-hidden="true"></i></span>
          <span>PDF</span>
        </a>
      </nav>
    </div>
  </div>

  <!-- KPI (1 baris) -->
  <div class="kpi-row mb-4">
    <div class="kpi-big">
      <div class="kpi-card gradient-green shadow">
        <div>Total Peruntukan</div>
        <div class="kpi-number">RM <?= number_format($totalPeruntukan,2) ?></div>
      </div>
    </div>

    <div class="kpi-big">
      <div class="kpi-card gradient-orange shadow">
        <div>Total Belanja</div>
        <div class="kpi-number" style="font-size:22px;">RM <?= number_format($totalBelanja,2) ?></div>
        <div class="kpi-sub">Dana Wakalah: RM <?= number_format($totalWakalah,2) ?></div>
      </div>
    </div>

    <div class="kpi-big">
      <div class="kpi-card gradient-purple shadow">
        <div>Total Baki Peruntukan</div>
        <div class="kpi-number">RM <?= number_format($totalBaki,2) ?></div>
      </div>
    </div>

    <div class="kpi-small">
      <div class="kpi-card sm gradient-dark shadow">
        <div>% Penggunaan Bajet</div>
        <div class="kpi-number sm"><?= $pctDisplay ?>%</div>
      </div>
    </div>

    <div class="kpi-small">
      <div class="kpi-card sm gradient-blue shadow">
        <div>Total Program</div>
        <div class="kpi-number sm"><?= (int)$totalProgram ?></div>
      </div>
    </div>
  </div>

  <!-- CHARTS -->
  <div class="row g-3 mb-4 bpa-admin-chart-grid">
    <div class="col-xl-4 d-flex">
      <div class="content-card chart-card bpa-admin-chart-card">
        <div class="card-header-custom">
          <div>
            <h5>Agihan Program Mengikut Unit</h5>
            <span>Bilangan program mengikut unit bagi tahun <?= (int)$tahun ?>.</span>
          </div>
        </div>
        <div class="pie-wrapper">
            <canvas id="unitChart"></canvas>
            <div class="pie-center">
              <div class="pie-center-label">Jumlah Program</div>
              <div class="pie-center-number"><?= number_format((int)array_sum(array_column($unitData, 'total'))) ?></div>
            </div>
        </div>
        <div class="chart-legend bpa-admin-chart-legend">
          <?php foreach ($unitData as $index => $unit): ?>
            <div class="legend-item">
              <span class="legend-dot" style="background-color:<?= safe($bpaChartPalette[$index % count($bpaChartPalette)]) ?>"></span>
              <span><?= safe($unit['nama_unit']) ?></span>
              <span class="legend-count"><?= (int)$unit['total'] ?></span>
            </div>
          <?php endforeach; ?>
        </div>
      </div>
    </div>

    <div class="col-xl-8 d-flex">
      <div class="content-card chart-card bpa-admin-chart-card">
        <div class="card-header-custom">
          <div>
            <h5>Status Program</h5>
            <span>Bilangan program mengikut status.</span>
          </div>
        </div>
        <div class="chart-wrapper">
            <canvas id="statusChart"></canvas>
        </div>
      </div>
    </div>
  </div>

  <!-- SKU SECTION -->
  <div class="card shadow-sm border-0 sku-dashboard">
    <div class="card-body">
      <div class="sku-dashboard-heading d-flex justify-content-between align-items-center gap-3">
        <div>
          <h5 class="fw-bold mb-1">SKU Dashboard</h5>
          <div class="small-muted">Pantau kemajuan KPI Bahagian Pembangunan Asnaf.</div>
        </div>
      </div>

      <section class="sku-dashboard-section" aria-labelledby="sku-bpa-heading">
        <div class="sku-section-heading">
          <span class="sku-unit-badge bpa-dashboard-card--red" id="sku-bpa-heading">
            <span class="sku-section-count"><?= count($skuBPA) ?> SKU</span>
            <span class="sku-badge-separator" aria-hidden="true">|</span>
            <span>Bahagian Pembangunan Asnaf</span>
          </span>
        </div>
        <div class="sku-section-content">

              <?php if (!$skuBPA): ?>
                <div class="text-muted">Tiada SKU BPA untuk tahun ini.</div>
              <?php else: ?>
                <div class="row g-3">
                  <?php foreach ($skuBPA as $s):
                    [$semasa, $pct] = calcSkuProgress($pdo, $s, $tahun, null, $bulanSemasa);

                    $sasaranTxt = fmtNumberNice($s['sasaran_nilai']) . " " . safe($s['sasaran_unit'] ?? '');
                    $semasaTxt  = ($s['jenis_sasaran']==='PERATUS_BAJET')
                                  ? ("Belanja: RM " . number_format((float)$semasa,2))
                                  : (fmtNumberNice($semasa) . " " . safe($s['sasaran_unit'] ?? ''));

                    $canvasId = "sku_bpa_" . (int)$s['sku_aktiviti_id'];
                  ?>
                  <div class="col-lg-6">
                    <div class="card sku-card shadow-sm sku-progress-card">
                      <div class="card-body">
                        <div class="d-flex justify-content-between gap-3 sku-card-layout">
                          <div class="sku-card-details">
                            <div class="d-flex align-items-center gap-2 mb-1">
                              <span class="badge-soft">BIL <?= (int)$s['bil'] ?></span>
                              <span class="badge bg-dark"><?= safe($s['jenis_sasaran']) ?></span>
                            </div>
                            <div class="sku-title"><?= nl2br(safe($s['nama_aktiviti'])) ?></div>

                            <div class="mt-2 small-muted">
                              <div><b>Sasaran:</b> <?= $sasaranTxt ?></div>
                              <div><b>Semasa:</b> <?= $semasaTxt ?></div>
                            </div>

                            <div class="mt-2">
                              <div class="d-flex justify-content-between small-muted">
                                <span>Progress</span>
                                <span><b><?= number_format($pct,1) ?>%</b></span>
                              </div>
                              <div class="progress">
                                <div class="progress-bar bg-success sku-progress-bar" data-progress="<?= min(100,$pct) ?>"></div>
                              </div>
                              <?php if ($pct > 100): ?>
                                <div class="sku-target-exceeded mt-2">
                                  <i class="bi bi-check-circle-fill" aria-hidden="true"></i>
                                  <span>Melebihi sasaran (<?= number_format($pct,1) ?>%)</span>
                                </div>
                              <?php endif; ?>
                            </div>
                          </div>

                          <div class="text-center sku-chart">
                            <div class="miniChartWrap">
                              <canvas id="<?= $canvasId ?>"></canvas>
                            </div>
                            <div class="small-muted mt-1">Pencapaian</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <?php endforeach; ?>
                </div>
              <?php endif; ?>

        </div>
      </section>

      <?php
      $unitSkuBadgeColors = ['UPU' => 'blue', 'ULK' => 'purple', 'UAK' => 'green', 'UPA' => 'yellow'];
      ?>
      <?php foreach ($units as $u):
        $uid = (int)$u['unit_id'];
        $uname = $u['nama_unit'];
        $unitFullName = trim((string)($u['keterangan'] ?? '')) ?: $uname;
        $list = $skuUNIT[$uid] ?? [];
        if (!$list) continue;
        $unitCode = strtoupper((string)$uname);
        $badgeColor = $unitSkuBadgeColors[$unitCode] ?? 'blue';
      ?>
        <section class="sku-unit-group" aria-labelledby="sku-unit-<?= $uid ?>-heading">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <span class="sku-unit-badge bpa-dashboard-card--<?= $badgeColor ?>" id="sku-unit-<?= $uid ?>-heading">
              <span class="sku-section-count"><?= count($list) ?> SKU</span>
              <span class="sku-badge-separator" aria-hidden="true">|</span>
              <span><?= safe($unitFullName) ?></span>
            </span>
          </div>

          <div class="row g-3">
              <?php foreach ($list as $s):
                [$semasa, $pct] = calcSkuProgress($pdo, $s, $tahun, $uid, $bulanSemasa);
                $sasaranTxt = fmtNumberNice($s['sasaran_nilai']) . " " . safe($s['sasaran_unit'] ?? '');
                $semasaTxt = ($s['jenis_sasaran'] === 'PERATUS_BAJET')
                  ? ("Belanja: RM " . number_format((float)$semasa, 2))
                  : (fmtNumberNice($semasa) . " " . safe($s['sasaran_unit'] ?? ''));
                $canvasId = "sku_unit_" . (int)$s['sku_aktiviti_id'];
              ?>
                <div class="col-lg-6">
                  <div class="card sku-card shadow-sm sku-progress-card">
                    <div class="card-body">
                      <div class="d-flex justify-content-between gap-3 sku-card-layout">
                        <div class="sku-card-details">
                          <div class="d-flex align-items-center gap-2 mb-1">
                            <span class="badge-soft">BIL <?= (int)$s['bil'] ?></span>
                            <span class="badge bg-primary"><?= safe($s['jenis_sasaran']) ?></span>
                          </div>
                          <div class="sku-title"><?= nl2br(safe($s['nama_aktiviti'])) ?></div>
                          <div class="mt-2 small-muted">
                            <div><b>Sasaran:</b> <?= $sasaranTxt ?></div>
                            <div><b>Semasa:</b> <?= $semasaTxt ?></div>
                          </div>
                          <div class="mt-2">
                            <div class="d-flex justify-content-between small-muted">
                              <span>Progress</span>
                              <span><b><?= number_format($pct, 1) ?>%</b></span>
                            </div>
                            <div class="progress">
                              <div class="progress-bar bg-success sku-progress-bar" data-progress="<?= min(100, $pct) ?>"></div>
                            </div>
                            <?php if ($pct > 100): ?>
                              <div class="sku-target-exceeded mt-2">
                                <i class="bi bi-check-circle-fill" aria-hidden="true"></i>
                                <span>Melebihi sasaran (<?= number_format($pct, 1) ?>%)</span>
                              </div>
                            <?php endif; ?>
                          </div>
                        </div>
                        <div class="text-center sku-chart">
                          <div class="miniChartWrap">
                            <canvas id="<?= $canvasId ?>"></canvas>
                          </div>
                          <div class="small-muted mt-1">Pencapaian</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              <?php endforeach; ?>
          </div>
        </section>
      <?php endforeach; ?>

    </div>
  </div>

</div>

<script>
const bpaChartTooltipBlur = {
  id:'bpaChartTooltipBlur',
  afterDraw(chart) {
    const tooltip = chart.tooltip;
    const canvas = chart.canvas;
    const wrapper = canvas.parentElement;
    let tooltipElement = wrapper.querySelector('.bpa-admin-chart-tooltip');

    if (!tooltipElement) {
      tooltipElement = document.createElement('div');
      tooltipElement.className = 'bpa-admin-chart-tooltip';
      tooltipElement.setAttribute('role', 'tooltip');
      wrapper.appendChild(tooltipElement);
    }

    if (!tooltip || tooltip.opacity === 0) {
      tooltipElement.style.opacity = '0';
      return;
    }

    tooltipElement.replaceChildren();
    tooltip.title.forEach((titleText, index) => {
      const title = document.createElement('div');
      title.className = 'bpa-admin-chart-tooltip-title';
      title.textContent = titleText;
      if (index === tooltip.title.length - 1 && tooltip.body.length) {
        title.style.marginBottom = '4px';
      }
      tooltipElement.appendChild(title);
    });

    tooltip.body.forEach((bodyItem, index) => {
      const point = tooltip.dataPoints[index];
      bodyItem.lines.forEach(lineText => {
        const row = document.createElement('div');
        row.className = 'bpa-admin-chart-tooltip-row';
        if (tooltip.options.displayColors && point) {
          const marker = document.createElement('span');
          marker.className = 'bpa-admin-chart-tooltip-marker';
          marker.style.backgroundColor = Array.isArray(point.dataset.backgroundColor)
            ? point.dataset.backgroundColor[point.dataIndex]
            : point.dataset.backgroundColor;
          row.appendChild(marker);
        }

        const text = document.createElement('span');
        text.textContent = lineText;
        row.appendChild(text);
        tooltipElement.appendChild(row);
      });
    });

    const canvasRect = canvas.getBoundingClientRect();
    const wrapperRect = wrapper.getBoundingClientRect();
    tooltipElement.style.left = `${canvasRect.left - wrapperRect.left + tooltip.x}px`;
    tooltipElement.style.top = `${canvasRect.top - wrapperRect.top + tooltip.y}px`;
    tooltipElement.style.opacity = '1';
  }
};

// ===== UNIT DOUGHNUT =====
new Chart(document.getElementById('unitChart'),{
  type:'doughnut',
  data:{
    labels:[
      <?php foreach($unitData as $u){ echo "'".safe($u['nama_unit'])."',"; } ?>
    ],
    datasets:[{
      data:[
        <?php foreach($unitData as $u){ echo (int)$u['total'].","; } ?>
      ],
      backgroundColor:<?= json_encode(array_slice($bpaChartPalette, 0, count($unitData))) ?>,
      borderWidth:3,
      borderColor:'#fff',
      hoverOffset:12,
      clip:false
    }]
  },
  options:{
    responsive:true,
    maintainAspectRatio:false,
    layout:{ padding:14 },
    cutout:'64%',
    animation:{ duration:1100, animateRotate:true, animateScale:false },
    plugins:{
      legend:{ display:false },
      tooltip:{
        enabled:true,
        backgroundColor:'rgba(0,0,0,0)',
        titleColor:'rgba(255,255,255,0)',
        bodyColor:'rgba(255,255,255,0)',
        displayColors:false,
        borderColor:'rgba(0,0,0,0)',
        borderWidth:0,
        caretSize:0,
        padding:6,
        callbacks:{
          label:context => {
            const total = context.dataset.data.reduce((sum, value) => sum + value, 0);
            const percentage = total ? (context.parsed / total * 100).toFixed(1) : '0.0';
            return `Peratusan: ${percentage}% (${context.parsed.toLocaleString()})`;
          }
        }
      }
    }
  },
  plugins:[bpaChartTooltipBlur]
});

// ===== STATUS BAR =====
const maxStatusValue = Math.max(
  <?= (int)($statusData['draft'] ?? 0) ?>,
  <?= (int)($statusData['aktif'] ?? 0) ?>,
  <?= (int)($statusData['selesai'] ?? 0) ?>,
  <?= (int)($statusData['batal'] ?? 0) ?>
);

const stepSize = maxStatusValue >= 2 ? 2 : 1;

new Chart(document.getElementById('statusChart'),{
  type:'bar',
  data:{
    labels:['Draft','Aktif','Selesai','Batal'],
    datasets:[{
      label:'Bil Program',
      data:[
        <?= (int)($statusData['draft'] ?? 0) ?>,
        <?= (int)($statusData['aktif'] ?? 0) ?>,
        <?= (int)($statusData['selesai'] ?? 0) ?>,
        <?= (int)($statusData['batal'] ?? 0) ?>
      ],
      backgroundColor:<?= json_encode(array_values($bpaStatusColors)) ?>,
      borderWidth:0
    }]
  },
  options:{
    responsive:true,
    maintainAspectRatio:false,
    animation:{ duration:1300, easing:'easeOutCubic' },
    plugins:{
      legend:{ display:false },
      tooltip:{
        enabled:true,
        backgroundColor:'rgba(0,0,0,0)',
        titleColor:'rgba(255,255,255,0)',
        bodyColor:'rgba(255,255,255,0)',
        displayColors:false,
        borderColor:'rgba(0,0,0,0)',
        borderWidth:0,
        caretSize:0,
        padding:6,
        callbacks:{
          label:context => `Bilangan: ${context.parsed.y.toLocaleString()}`
        }
      }
    },
    scales:{
      x:{
        grid:{ display:false },
        ticks:{ color:'#7288ae' }
      },
      y:{
        beginAtZero:true,
        ticks:{
          stepSize: stepSize,
          precision:0,
          color:'#7288ae'
        },
        grid:{ color:'#e7ebf2' },
        border:{ display:false }
      }
    }
  },
  plugins:[bpaChartTooltipBlur]
});

// ===== MINI CHARTS FOR EACH SKU =====
const skuProgressRingPlugin = {
  id: 'skuProgressRing',
  afterDatasetsDraw(chart) {
    const progress = chart.$skuProgress || 0;
    const arc = chart.getDatasetMeta(0).data[0];
    if (!arc) return;

    const context = chart.ctx;
    if (progress <= 0) return;
    context.save();
    context.beginPath();
    context.arc(
      arc.x,
      arc.y,
      (arc.innerRadius + arc.outerRadius) / 2,
      arc.startAngle,
      arc.startAngle + (Math.PI * 2 * progress / 100)
    );
    context.lineWidth = arc.outerRadius - arc.innerRadius;
    context.lineCap = 'butt';
    context.strokeStyle = '#22c55e';
    context.stroke();
    context.restore();
  }
};

function animateSkuProgressRing(chart, target, isCurrent) {
  const duration = 1200;
  const startTime = performance.now();
  const animate = currentTime => {
    if (!isCurrent()) return;

    const elapsed = Math.min(1, (currentTime - startTime) / duration);
    const eased = 1 - Math.pow(1 - elapsed, 3);
    chart.$skuProgress = target * eased;
    chart.draw();
    if (elapsed < 1) requestAnimationFrame(animate);
  };
  requestAnimationFrame(animate);
}

function makeMiniChart(canvasId, pct){
  const done = Math.max(0, Math.min(100, pct));

  const el = document.getElementById(canvasId);
  if(!el) return;

  const card = el.closest('.sku-progress-card');
  if (!card) return;

  const progressBar = card.querySelector('.sku-progress-bar');
  let chart = null;
  let isVisible = false;
  let animationToken = 0;

  const animateProgressBar = token => {
    if (!progressBar) return;

    progressBar.style.width = '0%';
    const target = Number(progressBar.dataset.progress) || 0;
    const duration = 1200;
    const startTime = performance.now();
    const animate = currentTime => {
      if (!isVisible || token !== animationToken) return;

      const progress = Math.min(1, (currentTime - startTime) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      progressBar.style.width = `${target * eased}%`;

      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  };

  const startAnimation = () => {
    isVisible = true;
    const currentToken = ++animationToken;
    animateProgressBar(currentToken);

    if (!chart) {
      chart = new Chart(el, {
        type: 'doughnut',
        data: {
          datasets: [{
            data: [100],
            backgroundColor: ['#e5e7eb'],
            borderWidth: 0
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          events: [],
          cutout: '72%',
          plugins: { legend: { display: false }, tooltip: { enabled: false } }
        },
        plugins: [skuProgressRingPlugin]
      });
    }

    chart.$skuProgress = 0;
    chart.draw();
    animateSkuProgressRing(
      chart,
      done,
      () => isVisible && currentToken === animationToken
    );
  };

  const resetAnimation = () => {
    isVisible = false;
    animationToken += 1;
    if (progressBar) progressBar.style.width = '0%';
    if (chart) {
      chart.$skuProgress = 0;
      chart.draw();
    }
  };

  if (!('IntersectionObserver' in window)) {
    startAnimation();
    return;
  }

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) startAnimation();
      else resetAnimation();
    });
  }, { threshold:0.2 });
  observer.observe(card);
}

<?php
foreach ($skuBPA as $s) {
  [$semasa, $pct] = calcSkuProgress($pdo, $s, $tahun, null, $bulanSemasa);
  $cid = "sku_bpa_" . (int)$s['sku_aktiviti_id'];
  echo "makeMiniChart('{$cid}', " . (float)$pct . ");\n";
}
foreach ($skuUNITraw as $s) {
  $uid = (int)$s['unit_id'];
  [$semasa, $pct] = calcSkuProgress($pdo, $s, $tahun, $uid, $bulanSemasa);
  $cid = "sku_unit_" . (int)$s['sku_aktiviti_id'];
  echo "makeMiniChart('{$cid}', " . (float)$pct . ");\n";
}
?>
</script>

<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
<script>
(() => {
  const yearInput = document.getElementById('bpa-dashboard-year');
  if (!yearInput || yearInput.disabled) return;

  yearInput.addEventListener('change', () => {
    const availableYears = JSON.parse(yearInput.dataset.availableYears);
    const currentYear = Number(yearInput.dataset.currentYear);
    const requestedYear = Number(yearInput.value);
    let nextYear = requestedYear;

    if (!availableYears.includes(requestedYear)) {
      const direction = requestedYear > currentYear ? 1 : -1;
      const candidates = availableYears
        .filter(year => direction > 0 ? year > currentYear : year < currentYear)
        .sort((a, b) => direction * (a - b));
      nextYear = candidates[0] ?? currentYear;
    }

    yearInput.value = String(nextYear);
    if (nextYear !== currentYear) yearInput.form.submit();
  });
})();
</script>
</body>
</html>