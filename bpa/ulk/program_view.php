<?php
require_once __DIR__ . '/../init.php';
require_login();

$name = htmlspecialchars($_SESSION['user']['user_nama'] ?? 'User');
$role = $_SESSION['user']['role'] ?? '';
$unit_id_session = $_SESSION['user']['unit_id'] ?? null;

$stmtU = $pdo->prepare("SELECT unit_id FROM unit WHERE nama_unit='ULK' LIMIT 1");
$stmtU->execute();
$ulk = $stmtU->fetch(PDO::FETCH_ASSOC);
if (!$ulk) die("Unit ULK belum wujud dalam table unit.");
$ulk_id = (int)$ulk['unit_id'];

if ($role === 'editor' && (int)$unit_id_session !== $ulk_id) {
    header("Location: /bpa/dashboard.php?error=" . urlencode("Anda bukan editor ULK."));
    exit;
}

$id = $_GET['id'] ?? '';
if (!ctype_digit($id)) {
    header("Location: /bpa/ulk/program_list.php?msg=" . urlencode("ID tidak sah."));
    exit;
}
$program_id = (int)$id;

$stmt = $pdo->prepare("
    SELECT p.*,
           d.kuota,
           d.jumlah_sedia_ada,
           d.siri_batch,
           d.tarikh_masuk,
           d.tarikh_tamat_pengajian,
           d.tempoh_pengajian,
           d.tempat_pengajian,
           d.tarikh_mula_lanjutan,
           d.tarikh_tamat_lanjutan,
           d.jumlah_peserta_semasa,
           d.baki_jumlah_peserta,
           d.jumlah_peserta_bekerja,
           d.jumlah_peserta_tarik_diri,
           d.peruntukan_semasa_rm,
           d.baki_belanja_rm,
           s.bil AS sku_bil,
           s.nama_aktiviti AS sku_nama
    FROM program p
    LEFT JOIN program_ulk_detail d ON d.program_id = p.program_id
    LEFT JOIN sku_aktiviti s ON s.sku_aktiviti_id = p.sku_aktiviti_id
    WHERE p.program_id = ? AND p.unit_id = ?
    LIMIT 1
");
$stmt->execute([$program_id, $ulk_id]);
$program = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$program) {
    header("Location: /bpa/ulk/program_list.php?msg=" . urlencode("Program tidak dijumpai."));
    exit;
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

$tarikhTempoh = formatTarikhTempoh(
    $program['tarikh_mula'] ?? null,
    $program['tarikh_tamat'] ?? null,
    $program['tempoh_kontrak'] ?? null
);

$tarikhLanjutan = formatTarikhTempoh(
    $program['tarikh_mula_lanjutan'] ?? null,
    $program['tarikh_tamat_lanjutan'] ?? null,
    ''
);
?>
<!DOCTYPE html>
<html lang="ms">
<head>
  <meta charset="UTF-8">
  <title>View Program ULK</title>
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
      <h4 class="fw-bold mb-0">Maklumat Program ULK</h4>
      <small class="text-muted">Paparan detail penuh program</small>
    </div>
    <div>
      <a href="/bpa/ulk/program_list.php" class="btn btn-outline-secondary">⬅ Kembali Senarai</a>
      <?php if (isset($bpaCanEdit) ? $bpaCanEdit : $role !== 'staff'): ?>
        <a href="/bpa/ulk/program_edit.php?id=<?= $program_id ?>" class="btn btn-primary">✏️ Edit</a>
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
          <div class="k">Tarikh Kontrak Asal</div>
          <div class="v"><?= htmlspecialchars($tarikhTempoh) ?></div>
        </div>

        <div class="col-md-3 kv">
          <div class="k">Tarikh Lanjutan</div>
          <div class="v"><?= htmlspecialchars($tarikhLanjutan) ?></div>
        </div>

        <div class="col-md-3 kv">
          <div class="k">Tempoh Pengajian</div>
          <div class="v"><?= htmlspecialchars($program['tempoh_pengajian'] ?? '-') ?></div>
        </div>

        <div class="col-md-3 kv">
          <div class="k">Tempat Pengajian</div>
          <div class="v"><?= htmlspecialchars($program['tempat_pengajian'] ?? '-') ?></div>
        </div>

        <div class="col-md-3 kv">
          <div class="k">Kerjasama/Konsultan</div>
          <div class="v"><?= htmlspecialchars($program['kerjasama_konsultan'] ?? '-') ?></div>
        </div>

        <div class="col-md-12 kv">
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

      <h6 class="fw-bold mb-2">📌 Maklumat Kemasukan</h6>
      <div class="row g-3">
        <div class="col-md-3 kv">
          <div class="k">Siri / Batch</div>
          <div class="v"><?= htmlspecialchars($program['siri_batch'] ?? '-') ?></div>
        </div>

        <div class="col-md-3 kv">
          <div class="k">Tarikh Masuk</div>
          <div class="v">
           <?= !empty($program['tarikh_masuk']) ? date('d/m/Y', strtotime($program['tarikh_masuk'])) : '-' ?>
          </div>
        </div>

        <div class="col-md-3 kv">
          <div class="k">Tarikh Tamat </div>
          <div class="v">
           <?= !empty($program['tarikh_tamat_pengajian']) ? date('d/m/Y', strtotime($program['tarikh_tamat_pengajian'])) : '-' ?>
           </div>
        </div>

        <div class="col-md-2 kv">
          <div class="k">Kuota</div>
          <div class="v"><?= $program['kuota'] !== null ? (int)$program['kuota'] : '-' ?></div>
        </div>

        <div class="col-md-2 kv">
          <div class="k">Jumlah Sedia Ada</div>
          <div class="v"><?= (int)($program['jumlah_sedia_ada'] ?? 0) ?></div>
        </div>

        <div class="col-md-3 kv">
          <div class="k">Jumlah Lapor Diri Tahun Semasa</div>
          <div class="v"><?= (int)($program['jumlah_peserta_semasa'] ?? 0) ?></div>
        </div>

        <div class="col-md-2 kv">
          <div class="k">Baki Peserta Diperlukan</div>
          <div class="v"><?= (int)($program['baki_jumlah_peserta'] ?? 0) ?></div>
        </div>

        <div class="col-md-3 kv">
          <div class="k">Jumlah Peserta Bekerja</div>
          <div class="v"><?= (int)($program['jumlah_peserta_bekerja'] ?? 0) ?></div>
        </div>

        <div class="col-md-3 kv">
          <div class="k">Jumlah Peserta Tarik Diri</div>
          <div class="v"><?= (int)($program['jumlah_peserta_tarik_diri'] ?? 0) ?></div>
        </div>
      </div>

      <hr>

      <h6 class="fw-bold mb-2">💰 Peruntukan & Perbelanjaan</h6>
      <div class="row g-3">
        <div class="col-md-3 kv">
          <div class="k">Peruntukan Kontrak (RM)</div>
          <div class="v money"><?= number_format((float)($program['peruntukan_rm'] ?? 0), 2) ?></div>
        </div>

        <div class="col-md-3 kv">
          <div class="k">Peruntukan Semasa (RM)</div>
          <div class="v money"><?= number_format((float)($program['peruntukan_semasa_rm'] ?? 0), 2) ?></div>
        </div>

        <div class="col-md-3 kv">
          <div class="k">Perbelanjaan (RM)</div>
          <div class="v money"><?= number_format((float)($program['perbelanjaan_rm'] ?? 0), 2) ?></div>
        </div>

        <div class="col-md-3 kv">
          <div class="k">Baki Belanja (RM)</div>
          <div class="v money"><?= number_format((float)($program['baki_belanja_rm'] ?? 0), 2) ?></div>
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