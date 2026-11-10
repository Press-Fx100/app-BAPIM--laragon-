<?php
require_once __DIR__ . '/../init.php';
require_login();

$name = htmlspecialchars($_SESSION['user']['user_nama'] ?? 'User');
$role = $_SESSION['user']['role'] ?? '';
$unit_id_session = $_SESSION['user']['unit_id'] ?? null;

// Dapatkan unit_id UPA
$stmtU = $pdo->prepare("SELECT unit_id FROM unit WHERE nama_unit='UPA' LIMIT 1");
$stmtU->execute();
$upa = $stmtU->fetch(PDO::FETCH_ASSOC);
if (!$upa) die("Unit UPA belum wujud dalam table unit.");
$upa_id = (int)$upa['unit_id'];

// editor hanya boleh UPA
if ($role === 'editor' && (int)$unit_id_session !== $upa_id) {
    header("Location: /bpa/dashboard.php?error=" . urlencode("Anda bukan editor UPA."));
    exit;
}

// ambil id
$id = $_GET['id'] ?? '';
if (!ctype_digit($id)) {
    header("Location: /bpa/upa/program_list.php?msg=" . urlencode("ID tidak sah."));
    exit;
}
$program_id = (int)$id;

// Load program + detail UPA
$stmt = $pdo->prepare("
    SELECT p.*,
           d.bil_peserta_daftar_ssm,
           d.bil_peserta_mula_niaga,
           s.bil AS sku_bil,
           s.nama_aktiviti AS sku_nama
    FROM program p
    LEFT JOIN program_upa_detail d ON d.program_id = p.program_id
    LEFT JOIN sku_aktiviti s ON s.sku_aktiviti_id = p.sku_aktiviti_id
    WHERE p.program_id = ? AND p.unit_id = ?
    LIMIT 1
");
$stmt->execute([$program_id, $upa_id]);
$program = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$program) {
    header("Location: /bpa/upa/program_list.php?msg=" . urlencode("Program tidak dijumpai."));
    exit;
}

function fmtDate($d){
  return $d ? date('d/m/Y', strtotime($d)) : '-';
}

function formatTarikhTempoh($mula, $tamat, $tempoh) {
    $mulaF = $mula ? date('d/m/Y', strtotime($mula)) : '';
    $tamatF = $tamat ? date('d/m/Y', strtotime($tamat)) : '';

    if ($mulaF && $tamatF) return $mulaF . " - " . $tamatF;
    if ($mulaF && !$tamatF && $tempoh) return $mulaF . " (Tempoh: " . $tempoh . ")";
    if ($mulaF && !$tamatF) return $mulaF;
    if (!$mulaF && $tempoh) return "Tempoh: " . $tempoh;
    return "-";
}

$tarikhTempoh = formatTarikhTempoh($program['tarikh_mula'], $program['tarikh_tamat'], $program['tempoh_kontrak']);
?>
<!DOCTYPE html>
<html lang="ms">
<head>
  <meta charset="UTF-8">
  <title>View Program UPA</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
  <style>
    body { background:#f4f6f8; padding-top:70px; }
    .offcanvas { width:290px; }
    .kv { font-size:14px; }
    .kv .k { color:#6c757d; font-size:12px; text-transform:uppercase; letter-spacing:.4px; }
    .kv .v { font-weight:600; }
    .money { font-variant-numeric: tabular-nums; }
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
      <h4 class="fw-bold mb-0">Maklumat Program UPA</h4>
      <small class="text-muted">Paparan detail penuh program</small>
    </div>
    <div>
      <a href="/bpa/upa/program_list.php" class="btn btn-outline-secondary">⬅ Kembali Senarai</a>
      <?php if (isset($bpaCanEdit) ? $bpaCanEdit : $role !== 'staff'): ?>
        <a href="/bpa/upa/program_edit.php?id=<?= $program_id ?>" class="btn btn-primary">✏️ Edit</a>
      <?php endif; ?>
    </div>
  </div>

  <div class="card shadow-sm border-0 mb-3">
    <div class="card-body">

      <h5 class="fw-bold mb-2"><?= htmlspecialchars($program['nama_program']) ?></h5>
      <div class="mb-3">
        <span class="badge bg-dark"><?= htmlspecialchars($program['status']) ?></span>
        <span class="badge bg-secondary">Tahun <?= (int)$program['tahun'] ?></span>
      </div>

      <div class="row g-3">
        <div class="col-md-3 kv">
          <div class="k">NK / JKB</div>
          <div class="v"><?= htmlspecialchars($program['nk_jkb'] ?? '-') ?></div>
        </div>

        <div class="col-md-3 kv">
          <div class="k">Tarikh/Tempoh</div>
          <div class="v"><?= htmlspecialchars($tarikhTempoh) ?></div>
        </div>

        <div class="col-md-3 kv">
          <div class="k">Tempat</div>
          <div class="v"><?= htmlspecialchars($program['tempat'] ?? '-') ?></div>
        </div>

        <div class="col-md-3 kv">
          <div class="k">Kerjasama/Konsultan</div>
          <div class="v"><?= htmlspecialchars($program['kerjasama_konsultan'] ?? '-') ?></div>
        </div>

        <div class="col-md-3 kv">
          <div class="k">Bil. Peserta</div>
          <div class="v"><?= $program['bil_peserta'] !== null ? (int)$program['bil_peserta'] : '-' ?></div>
        </div>

        <div class="col-md-3 kv">
          <div class="k">Daftar SSM</div>
          <div class="v"><?= (int)($program['bil_peserta_daftar_ssm'] ?? 0) ?></div>
        </div>

        <div class="col-md-3 kv">
          <div class="k">Mula Niaga</div>
          <div class="v"><?= (int)($program['bil_peserta_mula_niaga'] ?? 0) ?></div>
        </div>

        <div class="col-md-3 kv">
          <div class="k">Link SKU</div>
          <div class="v">
            <?php if (!empty($program['sku_aktiviti_id'])): ?>
              [<?= (int)$program['sku_bil'] ?>] <?= htmlspecialchars($program['sku_nama'] ?? '') ?>
            <?php else: ?>
              <span class="text-muted">Luar SKU</span>
            <?php endif; ?>
          </div>
        </div>
      </div>

      <hr>

      <div class="row g-3">
        <div class="col-md-4 kv">
          <div class="k">Peruntukan (RM)</div>
          <div class="v money"><?= number_format((float)$program['peruntukan_rm'], 2) ?></div>
        </div>
        <div class="col-md-4 kv">
          <div class="k">Perbelanjaan (RM)</div>
          <div class="v money"><?= number_format((float)$program['perbelanjaan_rm'], 2) ?></div>
        </div>
        <div class="col-md-4 kv">
          <div class="k">Dana Wakalah (RM)</div>
          <div class="v money"><?= number_format((float)$program['dana_wakalah_rm'], 2) ?></div>
        </div>
      </div>

      <hr>

      <div class="kv">
        <div class="k">Catatan</div>
        <div class="v"><?= nl2br(htmlspecialchars($program['catatan'] ?? '-')) ?></div>
      </div>

    </div>
  </div>

</div>

<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>
