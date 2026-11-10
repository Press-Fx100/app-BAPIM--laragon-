<?php
require_once __DIR__ . '/../init.php';
require_login();

if (!isset($_SESSION['user'])) {
    header("Location: /bpa/login.php");
    exit;
}

$name   = htmlspecialchars($_SESSION['user']['user_nama'] ?? 'User');
$role   = $_SESSION['user']['role'] ?? 'staff';
$unitId = $_SESSION['user']['unit_id'] ?? null;

// ===== Dapatkan unit_id UPU (ikut DB) =====
$stmtU = $pdo->prepare("SELECT unit_id FROM unit WHERE nama_unit='UPU' LIMIT 1");
$stmtU->execute();
$upu = $stmtU->fetch(PDO::FETCH_ASSOC);
if (!$upu) die("Unit UPU belum wujud dalam table unit.");
$UPU_UNIT_ID = (int)$upu['unit_id'];

// ===== Guard: selain admin mesti UPU sahaja =====
if ($role !== 'admin') {
    if ((int)$unitId !== $UPU_UNIT_ID && !has_bpa_unit_view_permission('UPU')) {
        header("Location: /bpa/dashboard.php?error=" . urlencode("Akaun anda bukan UPU."));
        exit;
    }
}

// ===== Tahun =====
$requestedYear = $_GET['tahun'] ?? null;
$requestedYear = is_scalar($requestedYear) && ctype_digit((string)$requestedYear)
    ? (int)$requestedYear
    : null;
$tahun = $requestedYear ?? (int)date('Y');

// Tahun dropdown (gabung program + sku UPU + bajet UPU)
$years = $pdo->prepare("
    SELECT tahun FROM (
        SELECT DISTINCT tahun FROM program WHERE unit_id = :unit_id
        UNION
        SELECT DISTINCT tahun FROM sku_aktiviti WHERE unit_id = :unit_id AND scope_type='UNIT'
        UNION
        SELECT DISTINCT tahun FROM bajet WHERE unit_id = :unit_id
    ) x
    ORDER BY tahun DESC
");
$years->execute([':unit_id' => $UPU_UNIT_ID]);
$years = array_map('intval', $years->fetchAll(PDO::FETCH_COLUMN));
$tahun = in_array($requestedYear, $years, true) ? $requestedYear : ($years[0] ?? (int)date('Y'));
if (!$years) $years = [$tahun];

// ===== Helpers =====
function fmtNumberNice($n){
    if ($n === null) return '-';
    $n = (float)$n;
    if (abs($n - round($n)) < 0.00001) return (string)intval(round($n));
    return rtrim(rtrim(number_format($n, 2, '.', ''), '0'), '.');
}
function fmtDate($d){
    if (!$d) return '-';
    return date('d/m/Y', strtotime($d));
}
function badgeStatus($s){
    $map = [
        'draft'   => 'secondary',
        'aktif'   => 'primary',
        'selesai' => 'success',
        'batal'   => 'danger',
    ];
    $c = $map[$s] ?? 'secondary';
    $s = htmlspecialchars((string)$s);
    return "<span class='badge status-badge bg-$c text-uppercase'>$s</span>";
}

// ===== KPI Program (Tahun dipilih) =====
$stmt = $pdo->prepare("
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status='selesai' THEN 1 ELSE 0 END) AS selesai,
      SUM(CASE WHEN status='aktif' THEN 1 ELSE 0 END) AS aktif,
      SUM(CASE WHEN status='draft' THEN 1 ELSE 0 END) AS draft,
      SUM(CASE WHEN status='batal' THEN 1 ELSE 0 END) AS batal,
      COALESCE(SUM(bil_peserta),0) AS total_peserta,
      COALESCE(SUM(peruntukan_rm),0) AS total_peruntukan_program,
      COALESCE(SUM(perbelanjaan_rm),0) AS total_belanja,
      COALESCE(SUM(dana_wakalah_rm),0) AS total_wakalah
    FROM program
    WHERE unit_id = :unit_id AND tahun = :tahun
");
$stmt->execute([':unit_id'=>$UPU_UNIT_ID, ':tahun'=>$tahun]);
$sum = $stmt->fetch(PDO::FETCH_ASSOC) ?: [
    'total'=>0,'selesai'=>0,'aktif'=>0,'draft'=>0,'batal'=>0,
    'total_peserta'=>0,'total_peruntukan_program'=>0,'total_belanja'=>0,'total_wakalah'=>0
];

// ===== BAJET RASMI UPU =====
$stmtBajet = $pdo->prepare("
    SELECT
      COALESCE(SUM(jumlah_peruntukan_rm),0) AS total_peruntukan_bajet,
      COALESCE(SUM(jumlah_dana_wakalah_rm),0) AS total_wakalah_bajet
    FROM bajet
    WHERE unit_id = :unit_id AND tahun = :tahun
");
$stmtBajet->execute([':unit_id'=>$UPU_UNIT_ID, ':tahun'=>$tahun]);
$bajetSum = $stmtBajet->fetch(PDO::FETCH_ASSOC) ?: [
    'total_peruntukan_bajet' => 0,
    'total_wakalah_bajet' => 0
];

$totalPeruntukanBajet = (float)$bajetSum['total_peruntukan_bajet'];
$totalBelanjaBajet    = (float)$sum['total_belanja'];   // perbelanjaan_rm sahaja
$totalWakalahUnit     = (float)$sum['total_wakalah'];   // paparan asing
$totalBakiBajet       = $totalPeruntukanBajet - $totalBelanjaBajet;
$percentBajetUnit     = $totalPeruntukanBajet > 0 ? ($totalBelanjaBajet / $totalPeruntukanBajet * 100) : 0;

// ===== Program terkini (10) =====
$stmt = $pdo->prepare("
    SELECT program_id, nama_program, tarikh_mula, tarikh_tamat, status, bil_peserta, peruntukan_rm, perbelanjaan_rm, dana_wakalah_rm, updated_at
    FROM program
    WHERE unit_id = :unit_id AND tahun = :tahun
    ORDER BY updated_at DESC
    LIMIT 10
");
$stmt->execute([':unit_id'=>$UPU_UNIT_ID, ':tahun'=>$tahun]);
$latestPrograms = $stmt->fetchAll(PDO::FETCH_ASSOC);

// ===== Program akan datang (30 hari) =====
$stmt = $pdo->prepare("
    SELECT program_id, nama_program, tarikh_mula, tarikh_tamat, status, bil_peserta
    FROM program
    WHERE unit_id = :unit_id
      AND tarikh_mula IS NOT NULL
      AND tarikh_mula >= CURDATE()
      AND tarikh_mula <= DATE_ADD(CURDATE(), INTERVAL 30 DAY)
      AND status <> 'batal'
    ORDER BY tarikh_mula ASC
    LIMIT 10
");
$stmt->execute([':unit_id'=>$UPU_UNIT_ID]);
$upcomingPrograms = $stmt->fetchAll(PDO::FETCH_ASSOC);

// ===== SKU UPU + Progress =====
$stmt = $pdo->prepare("
    SELECT
      sku_aktiviti_id, bil, nama_aktiviti, jenis_sasaran, sasaran_nilai, sasaran_unit,
      peruntukan_paparan_rm, sasaran_rm
    FROM sku_aktiviti
    WHERE tahun = :tahun AND scope_type='UNIT' AND unit_id = :unit_id
    ORDER BY bil ASC
");
$stmt->execute([':tahun'=>$tahun, ':unit_id'=>$UPU_UNIT_ID]);
$skus = $stmt->fetchAll(PDO::FETCH_ASSOC);

$skuProgress = [];
foreach ($skus as $sku) {

    $skuId = (int)$sku['sku_aktiviti_id'];
    $jenis = $sku['jenis_sasaran'];
    $sasaranNilai = (float)$sku['sasaran_nilai'];
    $sasaranUnit  = strtolower(trim((string)($sku['sasaran_unit'] ?? '')));

    $semasa = 0;
    $actualPct = 0.0;

    // PERATUS_BAJET: kira guna semua program UPU (bukan ikut sku_id)
    if ($jenis === 'PERATUS_BAJET') {
        $stmtB = $pdo->prepare("
            SELECT COALESCE(SUM(perbelanjaan_rm),0) AS total_belanja
            FROM program
            WHERE unit_id = :unit_id AND tahun = :tahun
        ");
        $stmtB->execute([':unit_id'=>$UPU_UNIT_ID, ':tahun'=>$tahun]);
        $b = $stmtB->fetch(PDO::FETCH_ASSOC) ?: ['total_belanja'=>0];

        $totalBel = (float)$b['total_belanja'];

        // guna sasaran_rm jika ada, kalau tak ada guna bajet rasmi unit
        $targetRm = !empty($sku['sasaran_rm'])
            ? (float)$sku['sasaran_rm']
            : $totalPeruntukanBajet;

        $actualPct = ($targetRm > 0) ? ($totalBel / $targetRm * 100.0) : 0.0;
        $semasa = $totalBel;

    } else {
        // selain bajet:
        // jika sasaran unit ada perkataan "program" => COUNT program selesai
        // selain itu => SUM bil_peserta program selesai
        if (strpos($sasaranUnit, 'program') !== false) {
            $stmtC = $pdo->prepare("
                SELECT COUNT(*) AS c
                FROM program
                WHERE unit_id = :unit_id AND tahun = :tahun AND sku_aktiviti_id = :sku_id AND status='selesai'
            ");
            $stmtC->execute([':unit_id'=>$UPU_UNIT_ID, ':tahun'=>$tahun, ':sku_id'=>$skuId]);
            $semasa = (int)($stmtC->fetchColumn() ?? 0);
        } else {
            $stmtS = $pdo->prepare("
                SELECT COALESCE(SUM(bil_peserta),0) AS s
                FROM program
                WHERE unit_id = :unit_id AND tahun = :tahun AND sku_aktiviti_id = :sku_id AND status='selesai'
            ");
            $stmtS->execute([':unit_id'=>$UPU_UNIT_ID, ':tahun'=>$tahun, ':sku_id'=>$skuId]);
            $semasa = (int)($stmtS->fetchColumn() ?? 0);
        }

        $actualPct = ($sasaranNilai > 0) ? ($semasa / $sasaranNilai * 100.0) : 0.0;
    }

    $skuProgress[] = [
        'sku' => $sku,
        'semasa' => $semasa,
        'actual_pct' => $actualPct
    ];
}
?>
<!DOCTYPE html>
<html lang="ms">
<head>
  <meta charset="UTF-8">
  <title>Dashboard UPU</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
  <style>
    body { background:#f4f6f8; padding-top:70px; }
    .offcanvas { width:290px; }
    .card-kpi .kpi-number{ font-size:26px; font-weight:800; }
    .small-muted{ font-size:12px; color:#6c757d; }
    .table thead th{ background:#e9a47f; border:1px solid #000 !important; text-align:center; vertical-align:middle; }
    .table tbody td{ border:1px solid #000 !important; vertical-align:top; font-size:13px; }
  </style>
</head>
<body>

<?php
if ($role === 'admin') {
    require_once __DIR__ . '/../admin/sidebar.php';
} elseif ($role === 'editor') {
    require_once __DIR__ . '/sidebar_editor.php';
} else {
    require_once __DIR__ . '/sidebar_staff.php';
}
?>

<div class="container mt-4">

  <div class="d-flex justify-content-between align-items-center mb-3 bpa-unit-dashboard-toolbar">
    <div>
      <h4 class="fw-bold mb-0">Dashboard UPU</h4>
      <div class="small-muted">Ringkasan program + progress SKU UPU (<?= (int)$tahun ?>)</div>
    </div>

    <div class="bpa-unit-dashboard-tools">
      <form class="d-flex gap-2 bpa-unit-dashboard-year-form" method="get">
        <label class="visually-hidden" for="bpa-unit-dashboard-year">Tahun dashboard UPU</label>
        <input id="bpa-unit-dashboard-year" name="tahun" type="number"
               class="form-control bpa-admin-year-select" aria-label="Pilih tahun dashboard UPU"
               value="<?= $tahun ?>" min="<?= min($years) ?>" max="<?= max($years) ?>"
               step="1" inputmode="numeric" data-current-year="<?= $tahun ?>"
               data-available-years="<?= htmlspecialchars(json_encode($years), ENT_QUOTES, 'UTF-8') ?>">
        <input type="hidden" name="unit" value="UPU">
      </form>
      <nav class="bpa-admin-actions bpa-unit-dashboard-actions" aria-label="Pautan dashboard UPU">
        <a class="bpa-admin-action bpa-admin-action--program" href="/bpa/laporan/program_list?unit=UPU" data-app-navigation>
          <span class="bpa-admin-action-icon"><i class="bi bi-file-earmark-text" aria-hidden="true"></i></span>
          <span>Program</span>
        </a>
      </nav>
    </div>
  </div>

  <!-- KPI Cards -->
  <div class="row g-3 mb-3">
    <div class="col-md-3">
      <div class="card shadow-sm border-0 card-kpi">
        <div class="card-body">
          <div class="small-muted">Jumlah Program (<?= (int)$tahun ?>)</div>
          <div class="kpi-number"><?= (int)$sum['total'] ?></div>
          <div class="small-muted">Selesai: <?= (int)$sum['selesai'] ?> | Aktif: <?= (int)$sum['aktif'] ?></div>
        </div>
      </div>
    </div>

    <div class="col-md-3">
      <div class="card shadow-sm border-0 card-kpi">
        <div class="card-body">
          <div class="small-muted">Jumlah Peserta</div>
          <div class="kpi-number"><?= (int)$sum['total_peserta'] ?></div>
          <div class="small-muted">Berdasarkan Bilangan Peserta </div>
        </div>
      </div>
    </div>

    <div class="col-md-3">
      <div class="card shadow-sm border-0 card-kpi">
        <div class="card-body">
          <div class="small-muted">Total Belanja Bajet (RM)</div>
          <div class="kpi-number"><?= number_format($totalBelanjaBajet, 2) ?></div>
          <div class="small-muted">Dana Wakalah: RM <?= number_format($totalWakalahUnit, 2) ?></div>
        </div>
      </div>
    </div>

    <div class="col-md-3">
      <div class="card shadow-sm border-0 card-kpi">
        <div class="card-body">
          <div class="small-muted">Total Peruntukan Bajet (RM)</div>
          <div class="kpi-number"><?= number_format($totalPeruntukanBajet, 2) ?></div>
          <div class="small-muted">% Guna Bajet: <?= number_format($percentBajetUnit, 1) ?>%</div>
        </div>
      </div>
    </div>
  </div>

  <!-- KPI tambahan bajet -->
  <div class="row g-3 mb-3">
    <div class="col-md-6">
      <div class="card shadow-sm border-0 card-kpi">
        <div class="card-body">
          <div class="small-muted">Total Baki Bajet (RM)</div>
          <div class="kpi-number"><?= number_format($totalBakiBajet, 2) ?></div>
          <div class="small-muted">Tidak ditolak Dana Wakalah</div>
        </div>
      </div>
    </div>

    <div class="col-md-6">
      <div class="card shadow-sm border-0 card-kpi">
        <div class="card-body">
          <div class="small-muted">Dana Wakalah Unit (RM)</div>
          <div class="kpi-number"><?= number_format($totalWakalahUnit, 2) ?></div>
          <div class="small-muted">Tidak ditolak dalam baki bajet</div>
        </div>
      </div>
    </div>
  </div>

  <!-- SKU Progress -->
  <div class="card shadow-sm border-0 mb-3">
    <div class="card-body">
      <div class="bpa-unit-card-header">
        <h5>Progress SKU UPU (<?= (int)$tahun ?>)</h5>
        <span>Sasaran dan pencapaian SKU bagi tahun dipilih.</span>
      </div>

      <?php if (!$skuProgress): ?>
        <div class="text-muted">Tiada SKU UPU untuk tahun ini.</div>
      <?php else: ?>
        <div class="table-responsive">
          <table class="table table-bordered mb-0">
            <thead>
              <tr>
                <th style="width:60px;">BIL</th>
                <th>AKTIVITI</th>
                <th style="width:180px;">SASARAN</th>
                <th style="width:220px;">SEMASA</th>
                <th style="width:140px;">PENCAPAIAN</th>
              </tr>
            </thead>
            <tbody>
            <?php foreach ($skuProgress as $p):
                $s = $p['sku'];
                $sem = $p['semasa'];
                $pct = (float)$p['actual_pct'];

                $sasaranTxt = fmtNumberNice($s['sasaran_nilai']) . " " . htmlspecialchars($s['sasaran_unit'] ?? '');

                if ($s['jenis_sasaran'] === 'PERATUS_BAJET') {
                    $semasaTxt = "Belanja: RM " . number_format((float)$sem, 2);
                } else {
                    $unitSem = trim((string)($s['sasaran_unit'] ?? ''));
                    if ($unitSem === '') $unitSem = 'unit';
                    $semasaTxt = fmtNumberNice($sem) . " " . htmlspecialchars($unitSem);
                }
            ?>
              <tr>
                <td class="text-center fw-bold"><?= (int)$s['bil'] ?></td>
                <td>
                  <?= nl2br(htmlspecialchars($s['nama_aktiviti'])) ?>
                </td>
                <td class="text-center">
                  <?= $sasaranTxt ?>
                  <?php if ($s['jenis_sasaran'] === 'PERATUS_BAJET' && !empty($s['sasaran_rm'])): ?>
                    <div class="small-muted">RM <?= number_format((float)$s['sasaran_rm'], 2) ?></div>
                  <?php endif; ?>
                </td>
                <td class="text-center"><?= $semasaTxt ?></td>
                <td class="text-center<?= $pct > 100 ? ' bpa-sku-achievement-over' : '' ?>"><?= number_format($pct, 1) ?>%</td>
              </tr>
            <?php endforeach; ?>
            </tbody>
          </table>
        </div>
      <?php endif; ?>
    </div>
  </div>

  <!-- Latest + Upcoming -->
  <div class="row g-3">
    <div class="col-lg-6">
      <div class="card shadow-sm border-0">
        <div class="card-body">
          <div class="bpa-unit-card-header">
            <h5>10 Program Terkini (<?= (int)$tahun ?>)</h5>
            <span>Program terkini untuk tahun dipilih.</span>
          </div>

          <?php if (!$latestPrograms): ?>
            <div class="text-muted">Tiada program untuk tahun ini.</div>
          <?php else: ?>
            <div class="table-responsive">
              <table class="table table-bordered mb-0">
                <thead>
                  <tr>
                    <th>Program</th>
                    <th style="width:115px;">Tarikh</th>
                    <th style="width:90px;">Status</th>
                    <th style="width:95px;">Peserta</th>
                  </tr>
                </thead>
                <tbody>
                <?php foreach ($latestPrograms as $pr): ?>
                  <tr>
                    <td>
                      <?= htmlspecialchars($pr['nama_program']) ?>
                      <div class="small-muted">ID: <?= (int)$pr['program_id'] ?></div>
                    </td>
                    <td class="text-center">
                      <?= fmtDate($pr['tarikh_mula']) ?>
                      <?php if (!empty($pr['tarikh_tamat'])): ?>
                        <div class="small-muted">- <?= fmtDate($pr['tarikh_tamat']) ?></div>
                      <?php endif; ?>
                    </td>
                    <td class="text-center"><?= badgeStatus($pr['status']) ?></td>
                    <td class="text-center"><?= (int)($pr['bil_peserta'] ?? 0) ?></td>
                  </tr>
                <?php endforeach; ?>
                </tbody>
              </table>
            </div>
          <?php endif; ?>
        </div>
      </div>
    </div>

    <div class="col-lg-6">
      <div class="card shadow-sm border-0">
        <div class="card-body">
          <div class="bpa-unit-card-header">
            <h5>Program Akan Datang</h5>
            <span>Program yang dijadualkan bermula dalam 30 hari akan datang.</span>
          </div>

          <?php if (!$upcomingPrograms): ?>
            <div class="text-muted">Tiada program akan datang dalam 30 hari.</div>
          <?php else: ?>
            <div class="table-responsive">
              <table class="table table-bordered mb-0">
                <thead>
                  <tr>
                    <th>Program</th>
                    <th style="width:115px;">Tarikh</th>
                    <th style="width:90px;">Status</th>
                    <th style="width:95px;">Peserta</th>
                  </tr>
                </thead>
                <tbody>
                <?php foreach ($upcomingPrograms as $pr): ?>
                  <tr>
                    <td><?= htmlspecialchars($pr['nama_program']) ?></td>
                    <td class="text-center"><?= fmtDate($pr['tarikh_mula']) ?></td>
                    <td class="text-center"><?= badgeStatus($pr['status']) ?></td>
                    <td class="text-center"><?= (int)($pr['bil_peserta'] ?? 0) ?></td>
                  </tr>
                <?php endforeach; ?>
                </tbody>
              </table>
            </div>
          <?php endif; ?>
        </div>
      </div>
    </div>
  </div>

</div>

<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
<script>
(() => {
  const yearInput = document.getElementById('bpa-unit-dashboard-year');
  if (!yearInput) return;

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