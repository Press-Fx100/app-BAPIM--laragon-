<?php
require_once __DIR__ . '/../init.php';
require_login();

$user = $_SESSION['user'] ?? [];
$name = htmlspecialchars($user['user_nama'] ?? 'Admin');
$canManageBudget = strtolower((string)($user['role'] ?? '')) === 'admin'
    || (int)($user['access_level'] ?? 0) <= 1;

// dropdown unit
$units = $pdo->query("SELECT unit_id, nama_unit FROM unit ORDER BY nama_unit")
             ->fetchAll(PDO::FETCH_ASSOC);

// Filters
$tahun = trim($_GET['tahun'] ?? date('Y'));
$unitFilter = $_GET['unit_id'] ?? '';
$q = trim($_GET['q'] ?? '');

// Validate tahun
if (!ctype_digit((string)$tahun)) $tahun = date('Y');
$tahunInt = (int)$tahun;

// Delete action
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['delete_id'])) {
    require_admin();
    $deleteId = filter_var($_POST['delete_id'], FILTER_VALIDATE_INT);
    $isAjaxRequest = ($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '') === 'XMLHttpRequest';

    if (!$deleteId || $deleteId < 1) {
        if ($isAjaxRequest) {
            http_response_code(400);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode(['success' => false, 'message' => 'Rekod bajet tidak sah.']);
            exit;
        }
        header("Location: bajet_list.php?" . http_build_query($_GET));
        exit;
    }

    try {
        $yearStmt = $pdo->prepare("SELECT tahun FROM bajet WHERE bajet_id = ?");
        $yearStmt->execute([$deleteId]);
        $deletedYear = $yearStmt->fetchColumn();

        $delete = $pdo->prepare("DELETE FROM bajet WHERE bajet_id=?");
        $delete->execute([$deleteId]);
        $deleted = $delete->rowCount() > 0;
        $msg = $deleted ? "Bajet berjaya dipadam." : "Rekod bajet tidak ditemui.";

        if ($isAjaxRequest) {
            $fallbackYear = null;
            if ($deleted && $deletedYear !== false) {
                $remaining = $pdo->prepare("SELECT COUNT(*) FROM bajet WHERE tahun = ?");
                $remaining->execute([(int)$deletedYear]);

                if ((int)$remaining->fetchColumn() === 0) {
                    $availableYears = $pdo->query("SELECT DISTINCT tahun FROM bajet ORDER BY tahun DESC")
                        ->fetchAll(PDO::FETCH_COLUMN);
                    $currentYear = (int)date('Y');
                    $availableYears = array_map('intval', $availableYears);

                    if (in_array($currentYear, $availableYears, true)) {
                        $fallbackYear = $currentYear;
                    } else {
                        $previousYears = array_values(array_filter(
                            $availableYears,
                            static fn (int $year): bool => $year < $currentYear
                        ));
                        $fallbackYear = $previousYears[0] ?? ($availableYears[0] ?? $currentYear);
                    }
                }
            }

            if (!$deleted) {
                http_response_code(404);
            }
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode([
                'success' => $deleted,
                'message' => $msg,
                'fallbackYear' => $fallbackYear
            ]);
            exit;
        }
    } catch (Throwable $e) {
        if ($isAjaxRequest) {
            http_response_code(500);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode(['success' => false, 'message' => 'Gagal padam bajet.']);
            exit;
        }
        $msg = "Gagal padam bajet.";
    }

    $params = $_GET;
    $params['msg'] = $msg;
    header("Location: bajet_list.php?" . http_build_query($params));
    exit;
}

$msg = trim((string)($_GET['msg'] ?? ''));

/**
 * ==========================
 * QUERY (AUTO UPDATE)
 * - Peruntukan: dari table bajet (rasmi)
 * - Perbelanjaan: SUM(perbelanjaan_rm) dari program (HANYA bajet/peruntukan)
 * - Dana Wakalah: SUM(dana_wakalah_rm) dari program (asing, info sahaja)
 * - Baki Bajet: peruntukan - perbelanjaan (TIDAK tolak wakalah)
 * ==========================
 */
$sql = "
SELECT
  b.bajet_id,
  b.tahun,
  b.unit_id,
  COALESCE(u.nama_unit, 'BPA') AS nama_unit,

  COALESCE(b.jumlah_peruntukan_rm,0) AS jumlah_peruntukan_rm,

  -- perbelanjaan dari bajet/peruntukan sahaja
  COALESCE(SUM(COALESCE(p.perbelanjaan_rm,0)),0) AS jumlah_perbelanjaan_rm,

  -- dana wakalah (asing, tidak masuk baki bajet)
  COALESCE(SUM(COALESCE(p.dana_wakalah_rm,0)),0) AS wakalah_rm,

  -- baki bajet = peruntukan - perbelanjaan (bajet sahaja)
  (
    COALESCE(b.jumlah_peruntukan_rm,0)
    - COALESCE(SUM(COALESCE(p.perbelanjaan_rm,0)),0)
  ) AS baki_rm,

  b.catatan,
  b.created_at
FROM bajet b
LEFT JOIN unit u ON u.unit_id = b.unit_id
LEFT JOIN program p
  ON p.unit_id = b.unit_id
 AND p.tahun   = b.tahun
WHERE b.tahun = :tahun
";
$params = [':tahun' => $tahunInt];

if ($unitFilter !== '' && ctype_digit((string)$unitFilter)) {
    $sql .= " AND b.unit_id = :unit_id ";
    $params[':unit_id'] = (int)$unitFilter;
}

if ($q !== '') {
    $sql .= " AND (b.catatan LIKE :q OR COALESCE(u.nama_unit, 'BPA') LIKE :q) ";
    $params[':q'] = "%$q%";
}

$sql .= "
GROUP BY
  b.bajet_id, b.tahun, b.unit_id, u.nama_unit,
  b.jumlah_peruntukan_rm, b.catatan, b.created_at
ORDER BY COALESCE(u.nama_unit, 'BPA') ASC
";

$stmt = $pdo->prepare($sql);
$stmt->execute($params);
$rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

// Tahun dropdown
$years = $pdo->query("SELECT DISTINCT tahun FROM bajet ORDER BY tahun DESC")
             ->fetchAll(PDO::FETCH_COLUMN);

// Summary keseluruhan
$totalPeruntukanAll = 0.0;
$totalBelanjaAll    = 0.0; // belanja bajet sahaja
$totalWakalahAll    = 0.0; // wakalah asing
$unitBadgeColors = ['BPA' => 'red', 'UPU' => 'blue', 'ULK' => 'purple', 'UAK' => 'green', 'UPA' => 'yellow'];

foreach ($rows as $r) {
    $totalPeruntukanAll += (float)$r['jumlah_peruntukan_rm'];
    $totalBelanjaAll    += (float)$r['jumlah_perbelanjaan_rm']; // ✅ bukan campur wakalah
    $totalWakalahAll    += (float)$r['wakalah_rm'];
}
?>
<!DOCTYPE html>
<html lang="ms">
<head>
  <meta charset="UTF-8">
  <title>Senarai Bajet</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
  <style>
    body { background-color:#f4f6f8; padding-top:70px; }
    .offcanvas { width:290px; }
    .money { text-align:right; font-variant-numeric: tabular-nums; }
    .badge-soft { font-size: 12px; }
    .summary-card { border-radius: 14px; }
    .budget-note-dialog {
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
    .budget-note-dialog::backdrop { background:rgba(15,23,42,.52); backdrop-filter:blur(2px); }
    .budget-note-dialog__header {
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:16px;
      padding:16px 20px;
      border-bottom:1px solid #e6e9ef;
      background:#fbfcff;
    }
    .budget-note-dialog__header h2 { margin:0; color:#202632; font-size:16px; font-weight:700; }
    .budget-note-dialog__close {
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
    .budget-note-dialog__close:hover { color:#202632; background:#f1f5f9; }
    .budget-note-dialog__body {
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
    .budget-note-dialog__body p { margin:0; }
  </style>
</head>
<body>

<?php include __DIR__ . '/sidebar.php'; ?>

<div class="container mt-4" data-bpa-list-page="budget">

  <div class="d-flex justify-content-between align-items-center mb-3 budget-page-header">
    <div>
      <h4 class="fw-bold mb-0" data-budget-year-title>Bajet BPA (<?= (int)$tahun ?>)</h4>
      <small class="text-muted">
        Bajet tahunan mengikut unit (Perbelanjaan & Wakalah auto kira dari Program)
      </small>
    </div>
    <div class="budget-page-actions" aria-label="Tindakan senarai bajet">
      <?php if ($canManageBudget): ?>
        <a href="/bpa/admin/bajet_add.php" class="budget-list-action budget-list-action--primary">
          <span class="budget-list-action-icon"><i class="bi bi-plus-lg" aria-hidden="true"></i></span>
          <span>Tambah</span>
        </a>
      <?php endif; ?>
      <a href="/bpa/admin/dashboard_admin.php" data-app-navigation class="budget-list-action">
        <span class="budget-list-action-icon"><i class="bi bi-grid-1x2" aria-hidden="true"></i></span>
        <span>Dashboard</span>
      </a>
    </div>
  </div>

  <?php if ($msg !== ''): ?>
    <div hidden data-bpa-app-alert="<?= htmlspecialchars($msg, ENT_QUOTES, 'UTF-8') ?>"
         data-bpa-app-alert-type="<?= str_starts_with($msg, 'Gagal') ? 'danger' : 'success' ?>"></div>
  <?php endif; ?>

  <div class="content-card mb-4 dataset-page-header budget-filter-card">
    <div class="budget-filter-heading">
      <h4>Carian Bajet</h4>
      <p>Cari rekod bajet dan tapis mengikut tahun atau unit.</p>
    </div>
    <div class="budget-filter-controls">
      <form method="get" class="budget-filter-toolbar search-toolbar-group" data-budget-filter-form role="search">
        <div class="search-box budget-search-box">
          <i class="bi bi-search" aria-hidden="true"></i>
          <input type="search" id="budgetSearch" name="q" value="<?= htmlspecialchars($q) ?>"
                 placeholder="Cari catatan atau nama unit..." aria-label="Cari bajet">
        </div>

        <div class="toolbar-group toolbar-control-cluster budget-filter-group" role="group" aria-label="Penapis bajet">
          <label class="visually-hidden" for="budgetYearFilter">Tapis mengikut tahun</label>
          <select id="budgetYearFilter" name="tahun" class="budget-filter-select" data-icon="bi-calendar3" data-icon-only="true" aria-label="Pilih tahun">
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

          <label class="visually-hidden" for="budgetUnitFilter">Tapis mengikut unit</label>
          <select id="budgetUnitFilter" name="unit_id" class="budget-filter-select budget-filter-select--unit" data-icon="bi-diagram-3" data-icon-only="true" aria-label="Pilih unit">
            <option value="" data-icon="bi-diagram-3">Semua Unit</option>
            <?php
              $unitIcons = [
                'UAK' => 'bi-moon-stars',
                'UPU' => 'bi-briefcase',
                'ULK' => 'bi-mortarboard',
                'UPA' => 'bi-tree',
              ];
            ?>
            <?php foreach ($units as $un): ?>
              <?php $unitIcon = $unitIcons[strtoupper((string)$un['nama_unit'])] ?? 'bi-building'; ?>
              <option value="<?= (int)$un['unit_id'] ?>" data-icon="<?= htmlspecialchars($unitIcon) ?>" <?= ((string)$unitFilter === (string)$un['unit_id']) ? 'selected' : '' ?>>
                <?= htmlspecialchars($un['nama_unit']) ?>
              </option>
            <?php endforeach; ?>
          </select>
        </div>
      </form>
    </div>
  </div>

  <!-- Summary -->
  <div class="row g-3 mb-3 budget-summary-cards">
    <div class="col-md-4">
      <div class="card shadow-sm border-0 summary-card">
        <div class="card-body">
          <div class="text-muted small">Jumlah Peruntukan (RM)</div>
          <div class="fw-bold fs-5">RM <?= number_format($totalPeruntukanAll, 2) ?></div>
        </div>
      </div>
    </div>

    <div class="col-md-4">
      <div class="card shadow-sm border-0 summary-card">
        <div class="card-body">
          <div class="text-muted small">Jumlah Perbelanjaan Bajet (RM)</div>
          <div class="fw-bold fs-5">RM <?= number_format($totalBelanjaAll, 2) ?></div>
        </div>
      </div>
    </div>

    <div class="col-md-4">
      <div class="card shadow-sm border-0 summary-card">
        <div class="card-body">
          <div class="text-muted small">Jumlah Dana Wakalah (RM)</div>
          <div class="fw-bold fs-5">RM <?= number_format($totalWakalahAll, 2) ?></div>
        </div>
      </div>
    </div>
  </div>

  <!-- Table -->
  <div class="card shadow-sm border-0 budget-table-card">
    <div class="budget-table-header">
      <div>
        <h5>Senarai Bajet</h5>
        <span>Peruntukan, perbelanjaan dan baki mengikut unit bagi tahun <?= (int)$tahun ?>.</span>
      </div>
      <span class="budget-record-count"><?= count($rows) ?> rekod</span>
    </div>
    <div class="card-body">
      <div class="table-responsive budget-table-responsive">
        <table class="table table-striped align-middle budget-table">
          <thead>
            <tr>
              <th>Tahun</th>
              <th>Unit</th>
              <th class="text-end">Peruntukan (RM)</th>
              <th class="text-end">Perbelanjaan Bajet (RM)</th>
              <th class="text-end">Dana Wakalah (RM)</th>
              <th class="text-end">Baki Bajet (RM)</th>
              <th aria-label="Tindakan"></th>
            </tr>
          </thead>
          <tbody>
            <?php if (!$rows): ?>
              <tr>
                <td colspan="7" class="text-center text-muted py-4">Tiada data bajet.</td>
              </tr>
            <?php else: ?>
              <?php foreach ($rows as $r): ?>
                <?php
                  $baki = (float)$r['baki_rm'];
                  $bakiBadge = $baki < 0 ? 'bg-danger' : ($baki == 0.0 ? 'bg-dark' : 'bg-success');
                  $unitBadgeColor = $unitBadgeColors[strtoupper((string)$r['nama_unit'])] ?? 'blue';
                ?>
                <tr>
                  <td><?= (int)$r['tahun'] ?></td>

                  <td>
                    <span class="badge status-badge budget-unit-badge bpa-dashboard-card--<?= $unitBadgeColor ?>"><?= htmlspecialchars($r['nama_unit']) ?></span>
                  </td>

                  <td class="money"><?= number_format((float)$r['jumlah_peruntukan_rm'], 2) ?></td>

                  <!-- ✅ perbelanjaan bajet sahaja -->
                  <td class="money"><?= number_format((float)$r['jumlah_perbelanjaan_rm'], 2) ?></td>

                  <!-- wakalah asing -->
                  <td class="money"><?= number_format((float)$r['wakalah_rm'], 2) ?></td>

                  <!-- ✅ baki bajet = peruntukan - belanja bajet -->
                  <td class="money">
                    <span class="badge status-badge <?= $bakiBadge ?> badge-soft">
                      <?= number_format($baki, 2) ?>
                    </span>
                  </td>

                  <td class="text-center">
                    <div class="budget-row-actions">
                      <?php
                        $catatan = trim((string)($r['catatan'] ?? ''));
                        $noteDialogId = 'budget-note-dialog-' . (int)$r['bajet_id'];
                      ?>
                      <?php if ($catatan !== ''): ?>
                        <button type="button" class="budget-row-action budget-note-action"
                                aria-label="Lihat catatan bajet" title="Lihat catatan"
                                data-budget-note-open="<?= htmlspecialchars($noteDialogId) ?>">
                          <i class="bi bi-three-dots" aria-hidden="true"></i>
                        </button>
                      <?php endif; ?>

                      <?php if ($canManageBudget): ?>
                        <a class="budget-row-action" aria-label="Edit bajet" title="Edit"
                           data-app-navigation
                           href="/bpa/admin/bajet_edit.php?id=<?= (int)$r['bajet_id'] ?>"><i class="bi bi-pencil" aria-hidden="true"></i></a>
                        <form method="post" data-budget-delete-form>
                          <input type="hidden" name="delete_id" value="<?= (int)$r['bajet_id'] ?>">
                          <button class="budget-row-action budget-row-action--delete" type="submit"
                                  aria-label="Padam bajet" title="Padam">
                            <i class="bi bi-trash3" aria-hidden="true"></i>
                          </button>
                        </form>
                      <?php endif; ?>

                      <?php if ($catatan !== ''): ?>
                        <dialog class="budget-note-dialog" id="<?= htmlspecialchars($noteDialogId) ?>"
                                aria-labelledby="<?= htmlspecialchars($noteDialogId) ?>-title">
                          <header class="budget-note-dialog__header">
                            <h2 id="<?= htmlspecialchars($noteDialogId) ?>-title">Catatan Bajet</h2>
                            <button type="button" class="budget-note-dialog__close"
                                    aria-label="Tutup catatan" data-budget-note-close>&times;</button>
                          </header>
                          <div class="budget-note-dialog__body">
                            <p><?= nl2br(htmlspecialchars($catatan)) ?></p>
                          </div>
                        </dialog>
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
    <div class="budget-table-note">
      <i class="bi bi-info-circle" aria-hidden="true"></i>
      <span><b>Perbelanjaan Bajet</b> dikira daripada <b>Perbelanjaan Program</b>.
      <b>Dana Wakalah</b> dipaparkan sebagai maklumat berasingan dan <b>tidak ditolak</b> dalam baki bajet.</span>
    </div>
  </div>

</div>

<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>