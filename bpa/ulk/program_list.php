<?php
require_once __DIR__ . '/../init.php';
require_login();

$name = htmlspecialchars($_SESSION['user']['user_nama'] ?? 'User');
$role = $_SESSION['user']['role'] ?? 'staff';
$unit_id_session = $_SESSION['user']['unit_id'] ?? null;

$isEditor = ($role === 'editor' || $role === 'admin');
$isStaffOnly = !$isEditor;

// Dapatkan unit_id ULK (ikut DB)
$stmtU = $pdo->prepare("SELECT unit_id FROM unit WHERE nama_unit='ULK' LIMIT 1");
$stmtU->execute();
$ulk = $stmtU->fetch(PDO::FETCH_ASSOC);
if (!$ulk) die("Unit ULK belum wujud dalam table unit.");
$ulk_id = (int)$ulk['unit_id'];

// editor/staff mesti ULK (admin boleh masuk mana-mana)
if ($role !== 'admin' && (int)$unit_id_session !== $ulk_id && !has_bpa_unit_view_permission('ULK')) {
    header("Location: /bpa/dashboard.php?error=" . urlencode("Akaun anda bukan ULK."));
    exit;
}

// Filters
$tahun = trim($_GET['tahun'] ?? date('Y'));
$statusFilter = $_GET['status'] ?? '';
$q = trim($_GET['q'] ?? '');

if (!ctype_digit($tahun)) $tahun = date('Y');

$msg = $_GET['msg'] ?? '';

// Delete (admin/editor sahaja)
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['delete_id'])) {

    if (!$isEditor) {
        header("Location: program_list.php?msg=" . urlencode("Staff tidak dibenarkan delete."));
        exit;
    }

    $deleteId = (int)$_POST['delete_id'];

    try {
        // pastikan delete hanya program ULK
        $stmt = $pdo->prepare("DELETE FROM program WHERE program_id=? AND unit_id=?");
        $stmt->execute([$deleteId, $ulk_id]);

        $msg = "Program berjaya dipadam.";
    } catch (Throwable $e) {
        $msg = "Gagal padam: " . $e->getMessage();
    }

    $params = $_GET;
    $params['msg'] = $msg;
    header("Location: program_list.php?" . http_build_query($params));
    exit;
}

// Query data
$sql = "
SELECT
  p.program_id,
  p.tahun,
  p.nama_program,
  p.tarikh_mula,
  p.tarikh_tamat,
  p.tempoh_kontrak,
  p.peruntukan_rm,
  p.perbelanjaan_rm,
  p.dana_wakalah_rm,
  p.status,
  pud.tarikh_masuk,
  pud.tarikh_tamat_pengajian
FROM program p
LEFT JOIN program_ulk_detail pud ON pud.program_id = p.program_id
WHERE p.unit_id = :unit_id
  AND p.tahun = :tahun
";
$params = [
    ':unit_id' => $ulk_id,
    ':tahun' => (int)$tahun
];

if (in_array($statusFilter, ['draft','aktif','selesai','batal'], true)) {
    $sql .= " AND p.status = :status ";
    $params[':status'] = $statusFilter;
}
if ($q !== '') {
    $sql .= " AND (p.nama_program LIKE :q) ";
    $params[':q'] = "%$q%";
}

$sql .= " ORDER BY COALESCE(pud.tarikh_masuk, p.tarikh_mula, '9999-12-31') ASC, p.program_id DESC ";

$stmt = $pdo->prepare($sql);
$stmt->execute($params);
$rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

// Tahun dropdown (daripada program ULK)
$yearsStmt = $pdo->prepare("SELECT DISTINCT tahun FROM program WHERE unit_id=? ORDER BY tahun DESC");
$yearsStmt->execute([$ulk_id]);
$years = $yearsStmt->fetchAll(PDO::FETCH_COLUMN);

// Helper tarikh/tempoh
function formatTarikhTempoh($mula, $tamat, $tempoh) {
    $mula = $mula ? date('d/m/Y', strtotime($mula)) : '';
    $tamat = $tamat ? date('d/m/Y', strtotime($tamat)) : '';

    if ($mula && $tamat) return $mula . " - " . $tamat;
    if ($mula && !$tamat && $tempoh) return $mula . " (Tempoh: " . $tempoh . ")";
    if ($mula && !$tamat) return $mula;
    if (!$mula && $tempoh) return "Tempoh: " . $tempoh;
    return "-";
}
?>
<!DOCTYPE html>
<html lang="ms">
<head>
  <meta charset="UTF-8">
  <title>Program ULK</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">

  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
  <!-- FontAwesome -->
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/css/font-awesome.min.css">

  <style>
    body { background-color:#f4f6f8; padding-top:70px; }
    .offcanvas { width:290px; }

    /* style macam sheet */
    .table thead th{
      background:#e9a47f;
      color:#000;
      border:1px solid #000 !important;
      text-align:center;
      vertical-align:middle;
      font-weight:700;
      font-size:13px;
      padding:10px 8px;
      white-space:nowrap;
    }
    .table tbody td{
      border:1px solid #000 !important;
      vertical-align:top;
      font-size:13px;
      padding:10px 8px;
    }
    .money{ text-align:right; font-variant-numeric: tabular-nums; white-space:nowrap; }
    .center{ text-align:center; }
    .col-program{ min-width:420px; }
    .col-tindakan{ width:130px; text-align:center; white-space:nowrap; }

    /* actions icon sebaris */
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
      width:30px;
      height:30px;
      border:1px solid #ddd;
      border-radius:8px;
      text-decoration:none;
      background:#fff;
      padding:0;
    }
    .action-btn:hover{ background:#f1f3f5; }
    .action-del{ border-color:#f5c2c7; }
    .action-del:hover{ background:#f8d7da; }
  </style>
</head>
<body>

<?php
if ($role === 'editor') {
    require_once __DIR__ . '/sidebar_editor.php';
} elseif ($role === 'staff') {
    require_once __DIR__ . '/sidebar_staff.php';
} elseif ($role === 'admin') {
    require_once __DIR__ . '/../admin/sidebar.php';
}
?>

<div class="container mt-4">

  <div class="d-flex justify-content-between align-items-center mb-3">
    <div>
      <h4 class="fw-bold mb-0">Program ULK</h4>
      <small class="text-muted">Paparan ringkas (klik View untuk detail penuh)</small>
    </div>
    <div class="budget-page-actions" aria-label="Tindakan senarai program">
      <?php if ($isEditor): ?>
        <a href="/bpa/ulk/program_add.php" class="budget-list-action budget-list-action--primary">
          <span class="budget-list-action-icon"><i class="bi bi-plus-lg" aria-hidden="true"></i></span>
          <span>Tambah</span>
        </a>
      <?php endif; ?>
      <a href="/bpa/ulk/dashboard.php" class="budget-list-action">
        <span class="budget-list-action-icon"><i class="bi bi-grid-1x2" aria-hidden="true"></i></span>
        <span>Dashboard</span>
      </a>
    </div>
  </div>

  <?php if ($msg): ?>
    <div class="alert alert-info"><?= htmlspecialchars($msg) ?></div>
  <?php endif; ?>

  <!-- Filter -->
  <div class="card shadow-sm border-0 mb-3 filter-card program-filter-card no-print">
    <div class="card-body">
      <div class="program-filter-heading">
        <h5>Carian Program</h5>
        <p>Cari dan tapis program mengikut tahun atau status.</p>
      </div>
      <form method="get" class="search-toolbar-group program-filter-form" data-program-filter-form role="search">
        <div class="search-box program-search-box">
          <i class="bi bi-search" aria-hidden="true"></i>
          <input type="search" name="q" value="<?= htmlspecialchars($q) ?>"
                 placeholder="Cari nama program..." aria-label="Cari program" autocomplete="off">
        </div>

        <div class="toolbar-group toolbar-control-cluster program-filter-group" role="group" aria-label="Penapis program">
          <label class="visually-hidden" for="ulkProgramYearFilter">Tapis mengikut tahun</label>
          <select id="ulkProgramYearFilter" name="tahun" class="program-filter-select"
                  data-icon="bi-calendar3" data-icon-only="true" aria-label="Pilih tahun">
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

          <label class="visually-hidden" for="ulkProgramStatusFilter">Tapis mengikut status</label>
          <select id="ulkProgramStatusFilter" name="status" class="program-filter-select"
                  data-icon="bi-funnel" data-icon-only="true" aria-label="Pilih status">
            <option value="">-- Semua --</option>
            <?php foreach (['draft','aktif','selesai','batal'] as $s): ?>
              <option value="<?= $s ?>" <?= ($statusFilter===$s)?'selected':'' ?>><?= $s ?></option>
            <?php endforeach; ?>
          </select>
        </div>
      </form>
    </div>
  </div>

  <!-- Table -->
  <div class="card shadow-sm border-0 program-unit-table-card">
    <div class="sku-table-header">
      <div>
        <h5>Senarai Program ULK</h5>
        <span>Senarai program bagi tahun <?= htmlspecialchars((string)$tahun) ?>.</span>
      </div>
      <span class="sku-record-count"><?= count($rows) ?> rekod</span>
    </div>
    <div class="card-body">
      <div class="table-responsive program-unit-table-wrapper">
        <table class="table program-unit-table mb-0">
          <thead>
            <tr>
              <th style="width:60px;">BIL.</th>
              <th class="col-program">PROGRAM</th>
              <th style="width:220px;">TARIKH PELAKSANAAN / TEMPOH</th>
              <th style="width:140px;">PERUNTUKAN</th>
              <th style="width:140px;">PERBELANJAAN</th>
              <th style="width:140px;">DANA WAKALAH</th>
              <th class="col-tindakan" aria-label="Tindakan"></th>
            </tr>
          </thead>
          <tbody>
            <?php if (!$rows): ?>
              <tr>
                <td colspan="7" class="text-center text-muted py-4">Tiada program direkodkan.</td>
              </tr>
            <?php else: ?>
              <?php foreach ($rows as $i => $r): ?>
                <?php
                  $status = trim((string)($r['status'] ?? ''));
                  $statusKey = strtolower($status);
                  $statusClass = ['aktif' => 'primary', 'selesai' => 'success', 'batal' => 'danger'][$statusKey] ?? 'secondary';
                ?>
                <tr>
                  <td class="center"><b><?= $i+1 ?></b></td>

                  <td class="col-program">
                    <?= htmlspecialchars($r['nama_program']) ?>
                    <div class="mt-2">
                      <span class="status-badge bg-<?= $statusClass ?>"><?= htmlspecialchars(strtoupper($status)) ?></span>
                    </div>
                  </td>

                  <td class="center">
                    <?= htmlspecialchars(formatTarikhTempoh(
                        $r['tarikh_masuk'] ?? null,
                        $r['tarikh_tamat_pengajian'] ?? null,
                        $r['tempoh_kontrak'] ?? null
                    )) ?>
                  </td>

                  <td class="money"><?= number_format((float)$r['peruntukan_rm'], 2) ?></td>
                  <td class="money"><?= number_format((float)$r['perbelanjaan_rm'], 2) ?></td>
                  <td class="money"><?= number_format((float)$r['dana_wakalah_rm'], 2) ?></td>

                  <td class="col-tindakan">
                    <div class="budget-row-actions">
                      <a class="budget-row-action" href="/bpa/ulk/program_view.php?id=<?= (int)$r['program_id'] ?>"
                         title="View" aria-label="View program">
                        <i class="bi bi-eye" aria-hidden="true"></i>
                      </a>

                      <?php if (isset($bpaCanEdit) ? $bpaCanEdit : $isEditor): ?>
                        <a class="budget-row-action" href="/bpa/ulk/program_edit.php?id=<?= (int)$r['program_id'] ?>"
                           title="Edit" aria-label="Edit program">
                          <i class="bi bi-pencil" aria-hidden="true"></i>
                        </a>
                      <?php endif; ?>

                      <?php if ($isEditor): ?>
                        <form method="post">
                          <input type="hidden" name="delete_id" value="<?= (int)$r['program_id'] ?>">
                          <button type="submit" class="budget-row-action budget-row-action--delete"
                                  title="Delete" aria-label="Delete program"
                                  onclick="return confirm('Padam program ini?')">
                            <i class="bi bi-trash3" aria-hidden="true"></i>
                          </button>
                        </form>
                      <?php endif; ?>
                    </div>
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

<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>