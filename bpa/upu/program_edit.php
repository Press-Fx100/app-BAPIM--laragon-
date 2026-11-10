<?php
require_once __DIR__ . '/../init.php';
require_login();

$name = htmlspecialchars($_SESSION['user']['user_nama'] ?? 'User');
$role = $_SESSION['user']['role'] ?? '';
$unit_id_session = $_SESSION['user']['unit_id'] ?? null;

if (isset($bpaCanEdit) ? !$bpaCanEdit : $role === 'staff') {
    header("Location: /bpa/upu/program_list.php?msg=" . urlencode("Staff tidak dibenarkan edit program."));
    exit;
}

// Dapatkan unit_id UPU
$stmtU = $pdo->prepare("SELECT unit_id FROM unit WHERE nama_unit='UPU' LIMIT 1");
$stmtU->execute();
$upu = $stmtU->fetch(PDO::FETCH_ASSOC);
if (!$upu) die("Unit UPU belum wujud dalam table unit.");
$upu_id = (int)$upu['unit_id'];

// editor hanya boleh UPU
if ($role === 'editor' && (int)$unit_id_session !== $upu_id) {
    header("Location: /bpa/dashboard.php?error=" . urlencode("Anda bukan editor UPU."));
    exit;
}

// ambil program_id
$id = $_GET['id'] ?? '';
if (!ctype_digit($id)) {
    header("Location: /bpa/upu/program_list.php?msg=" . urlencode("ID tidak sah."));
    exit;
}
$program_id = (int)$id;

$err = '';
$ok  = '';

// Load program + detail (UPU sahaja)
$stmt = $pdo->prepare("
    SELECT p.*,
           d.kuota, d.sektor_perniagaan_peserta,
           d.jumlah_peserta_pendapatan_bawah_10k,
           d.jumlah_peserta_pendapatan_atas_10k,
           d.jumlah_peserta_bayar_zakat
    FROM program p
    LEFT JOIN program_upu_detail d ON d.program_id = p.program_id
    WHERE p.program_id = ? AND p.unit_id = ?
    LIMIT 1
");
$stmt->execute([$program_id, $upu_id]);
$program = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$program) {
    header("Location: /bpa/upu/program_list.php?msg=" . urlencode("Program tidak dijumpai."));
    exit;
}

$formYear = (int)($program['tahun'] ?? date('Y'));

if ($_SERVER['REQUEST_METHOD'] === 'POST') {

    $tahun = (int)($_POST['tahun'] ?? $program['tahun'] ?? date('Y'));
    if ($tahun < 2000 || $tahun > 2100) $tahun = (int)($program['tahun'] ?? date('Y'));

    $nama_program = trim($_POST['nama_program'] ?? '');
    $nk_jkb = trim($_POST['nk_jkb'] ?? '');

    $tarikh_mula  = trim($_POST['tarikh_mula'] ?? '');
    $tarikh_tamat = trim($_POST['tarikh_tamat'] ?? '');
    $tempoh_kontrak = trim($_POST['tempoh_kontrak'] ?? '');

    $tempat = trim($_POST['tempat'] ?? '');
    $kerjasama = trim($_POST['kerjasama_konsultan'] ?? '');

    $bil_peserta_raw = trim($_POST['bil_peserta'] ?? '');
    $bil_peserta = ($bil_peserta_raw === '' ? null : (ctype_digit($bil_peserta_raw) ? (int)$bil_peserta_raw : null));

    // UPU detail
    $kuota_raw = trim($_POST['kuota'] ?? '');
    $kuota = ($kuota_raw === '' ? null : (ctype_digit($kuota_raw) ? (int)$kuota_raw : null));

    $sektor = trim($_POST['sektor_perniagaan_peserta'] ?? '');

    $bawah10_raw = trim($_POST['jumlah_peserta_pendapatan_bawah_10k'] ?? '0');
    $atas10_raw  = trim($_POST['jumlah_peserta_pendapatan_atas_10k'] ?? '0');
    $zakat_raw   = trim($_POST['jumlah_peserta_bayar_zakat'] ?? '0');

    $bawah10 = (ctype_digit($bawah10_raw) ? (int)$bawah10_raw : null);
    $atas10  = (ctype_digit($atas10_raw) ? (int)$atas10_raw : null);
    $zakat   = (ctype_digit($zakat_raw) ? (int)$zakat_raw : null);

    $peruntukan_raw = trim($_POST['peruntukan_rm'] ?? '');
    $peruntukan_rm = ($peruntukan_raw === '' ? 0 : (is_numeric($peruntukan_raw) ? (float)$peruntukan_raw : null));

    $perbelanjaan_raw = trim($_POST['perbelanjaan_rm'] ?? '');
    $perbelanjaan_rm = ($perbelanjaan_raw === '' ? 0 : (is_numeric($perbelanjaan_raw) ? (float)$perbelanjaan_raw : null));

    $wakalah_raw = trim($_POST['dana_wakalah_rm'] ?? '');
    $dana_wakalah_rm = ($wakalah_raw === '' ? 0 : (is_numeric($wakalah_raw) ? (float)$wakalah_raw : null));

    $status = $_POST['status'] ?? 'draft';
    if (!in_array($status, ['draft','aktif','selesai','batal'], true)) $status = 'draft';

    $catatan = trim($_POST['catatan'] ?? '');

    $sku_aktiviti_id_raw = $_POST['sku_aktiviti_id'] ?? '';
    $sku_aktiviti_id = ($sku_aktiviti_id_raw === '' ? null : (ctype_digit($sku_aktiviti_id_raw) ? (int)$sku_aktiviti_id_raw : null));

    // ===== VALIDATION =====
    if ($nama_program === '') $err = "Nama program wajib diisi.";

    // wajib tarikh mula atau tempoh kontrak
    if (!$err) {
        if ($tarikh_mula === '' && $tempoh_kontrak === '') {
            $err = "Sila isi sama ada Tarikh Mula atau Tempoh Kontrak.";
        }
    }
    if (!$err && $tarikh_mula !== '' && $tarikh_tamat !== '' && $tarikh_tamat < $tarikh_mula) {
        $err = "Tarikh tamat tak boleh lebih awal dari tarikh mula.";
    }

    if (!$err && $bil_peserta_raw !== '' && $bil_peserta === null) $err = "Bil. peserta mesti nombor.";
    if (!$err && $kuota_raw !== '' && $kuota === null) $err = "Kuota mesti nombor.";

    if (!$err && $bawah10 === null) $err = "Jumlah pendapatan <10K mesti nombor.";
    if (!$err && $atas10 === null)  $err = "Jumlah pendapatan 10K dan ke atas mesti nombor.";
    if (!$err && $zakat === null)   $err = "Jumlah peserta bayar zakat mesti nombor.";

    if (!$err && ($peruntukan_rm === null || $peruntukan_rm < 0)) $err = "Peruntukan mesti nombor (tak boleh negatif).";
    if (!$err && ($perbelanjaan_rm === null || $perbelanjaan_rm < 0)) $err = "Perbelanjaan mesti nombor (tak boleh negatif).";
    if (!$err && ($dana_wakalah_rm === null || $dana_wakalah_rm < 0)) $err = "Dana wakalah mesti nombor (tak boleh negatif).";

    if (!$err) {
        try {
            $pdo->beginTransaction();

            // Update table program
            $stmt1 = $pdo->prepare("
                UPDATE program
                SET
                  tahun = :tahun,
                  sku_aktiviti_id = :sku_aktiviti_id,
                  nama_program = :nama_program,
                  nk_jkb = :nk_jkb,
                  tarikh_mula = :tarikh_mula,
                  tarikh_tamat = :tarikh_tamat,
                  tempoh_kontrak = :tempoh_kontrak,
                  tempat = :tempat,
                  kerjasama_konsultan = :kerjasama,
                  bil_peserta = :bil_peserta,
                  peruntukan_rm = :peruntukan,
                  perbelanjaan_rm = :perbelanjaan,
                  dana_wakalah_rm = :wakalah,
                  status = :status,
                  catatan = :catatan
                WHERE program_id = :program_id AND unit_id = :unit_id
            ");
            $stmt1->execute([
                ':tahun' => $tahun,
                ':sku_aktiviti_id' => $sku_aktiviti_id,
                ':nama_program' => $nama_program,
                ':nk_jkb' => ($nk_jkb===''?null:$nk_jkb),
                ':tarikh_mula' => ($tarikh_mula===''?null:$tarikh_mula),
                ':tarikh_tamat' => ($tarikh_tamat===''?null:$tarikh_tamat),
                ':tempoh_kontrak' => ($tempoh_kontrak===''?null:$tempoh_kontrak),
                ':tempat' => ($tempat===''?null:$tempat),
                ':kerjasama' => ($kerjasama===''?null:$kerjasama),
                ':bil_peserta' => $bil_peserta,
                ':peruntukan' => $peruntukan_rm,
                ':perbelanjaan' => $perbelanjaan_rm,
                ':wakalah' => $dana_wakalah_rm,
                ':status' => $status,
                ':catatan' => ($catatan===''?null:$catatan),
                ':program_id' => $program_id,
                ':unit_id' => $upu_id,
            ]);

            // Upsert detail table
            $stmt2 = $pdo->prepare("
                INSERT INTO program_upu_detail
                  (program_id, kuota, sektor_perniagaan_peserta, jumlah_peserta_pendapatan_bawah_10k, jumlah_peserta_pendapatan_atas_10k, jumlah_peserta_bayar_zakat)
                VALUES
                  (:program_id, :kuota, :sektor, :bawah10, :atas10, :zakat)
                ON DUPLICATE KEY UPDATE
                  kuota = VALUES(kuota),
                  sektor_perniagaan_peserta = VALUES(sektor_perniagaan_peserta),
                  jumlah_peserta_pendapatan_bawah_10k = VALUES(jumlah_peserta_pendapatan_bawah_10k),
                  jumlah_peserta_pendapatan_atas_10k = VALUES(jumlah_peserta_pendapatan_atas_10k),
                  jumlah_peserta_bayar_zakat = VALUES(jumlah_peserta_bayar_zakat)
            ");
            $stmt2->execute([
                ':program_id' => $program_id,
                ':kuota' => $kuota,
                ':sektor' => ($sektor===''?null:$sektor),
                ':bawah10' => $bawah10,
                ':atas10' => $atas10,
                ':zakat' => $zakat,
            ]);

            $pdo->commit();
            $ok = "Program berjaya dikemaskini.";

            // reload
            $stmt = $pdo->prepare("
                SELECT p.*,
                       d.kuota, d.sektor_perniagaan_peserta,
                       d.jumlah_peserta_pendapatan_bawah_10k,
                       d.jumlah_peserta_pendapatan_atas_10k,
                       d.jumlah_peserta_bayar_zakat
                FROM program p
                LEFT JOIN program_upu_detail d ON d.program_id = p.program_id
                WHERE p.program_id = ? AND p.unit_id = ?
                LIMIT 1
            ");
            $stmt->execute([$program_id, $upu_id]);
            $program = $stmt->fetch(PDO::FETCH_ASSOC);

        } catch (Throwable $e) {
            $pdo->rollBack();
            $err = "Gagal update: " . $e->getMessage();
        }
    }

    $formYear = $tahun;
}

// SKU list ikut tahun form
$stmtSku = $pdo->prepare("
    SELECT sku_aktiviti_id, bil, nama_aktiviti
    FROM sku_aktiviti
    WHERE tahun = :tahun
    ORDER BY bil ASC
");
$stmtSku->execute([':tahun' => $formYear]);
$skuList = $stmtSku->fetchAll(PDO::FETCH_ASSOC);
?>
<!DOCTYPE html>
<html lang="ms">
<head>
  <meta charset="UTF-8">
  <title>Edit Program UPU</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
  <style>
    body { background:#f4f6f8; padding-top:70px; }
    .offcanvas { width:290px; }
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
      <h4 class="fw-bold mb-0">Edit Program UPU</h4>
      <small class="text-muted">Kemaskini program + detail peserta UPU</small>
    </div>
    <div>
      <a href="/bpa/upu/program_list.php" class="btn btn-outline-dark">⬅ Kembali Senarai</a>
      <a href="/bpa/upu/program_view.php?id=<?= $program_id ?>" class="btn btn-outline-info">🔍 View</a>
    </div>
  </div>

  <?php if ($err): ?><div class="alert alert-danger"><?= htmlspecialchars($err) ?></div><?php endif; ?>
  <?php if ($ok): ?><div class="alert alert-success"><?= htmlspecialchars($ok) ?></div><?php endif; ?>

  <div class="card shadow-sm border-0">
    <div class="card-body">
      <form method="post" class="row g-3">

        <div class="col-md-2">
          <label class="form-label">Tahun</label>
          <input type="number" name="tahun" class="form-control" min="2000" max="2100"
                 value="<?= htmlspecialchars($program['tahun'] ?? date('Y')) ?>" required>
        </div>

        <div class="col-md-7">
          <label class="form-label">Nama Program</label>
          <input type="text" name="nama_program" class="form-control" required
                 value="<?= htmlspecialchars($program['nama_program'] ?? '') ?>">
        </div>

        <div class="col-md-3">
          <label class="form-label">NK / JKB</label>
          <input type="text" name="nk_jkb" class="form-control"
                 value="<?= htmlspecialchars($program['nk_jkb'] ?? '') ?>">
        </div>

        <div class="col-md-3">
          <label class="form-label">Tarikh Mula</label>
          <input type="date" name="tarikh_mula" class="form-control"
                 value="<?= htmlspecialchars($program['tarikh_mula'] ?? '') ?>">
        </div>

        <div class="col-md-3">
          <label class="form-label">Tarikh Tamat</label>
          <input type="date" name="tarikh_tamat" class="form-control"
                 value="<?= htmlspecialchars($program['tarikh_tamat'] ?? '') ?>">
        </div>

        <div class="col-md-6">
          <label class="form-label">Tempoh Kontrak (optional)</label>
          <input type="text" name="tempoh_kontrak" class="form-control"
                 placeholder="Contoh: 3 tahun / 6 bulan"
                 value="<?= htmlspecialchars($program['tempoh_kontrak'] ?? '') ?>">
        </div>

        <div class="col-md-6">
          <label class="form-label">Tempat</label>
          <input type="text" name="tempat" class="form-control"
                 value="<?= htmlspecialchars($program['tempat'] ?? '') ?>">
        </div>

        <div class="col-md-6">
          <label class="form-label">Kerjasama / Konsultan</label>
          <input type="text" name="kerjasama_konsultan" class="form-control"
                 value="<?= htmlspecialchars($program['kerjasama_konsultan'] ?? '') ?>">
        </div>

        <div class="col-md-3">
          <label class="form-label">Kuota</label>
          <input type="number" name="kuota" class="form-control" min="0"
                 value="<?= htmlspecialchars($program['kuota'] ?? '') ?>">
        </div>

        <div class="col-md-3">
          <label class="form-label">Bil. Peserta</label>
          <input type="number" name="bil_peserta" class="form-control" min="0"
                 value="<?= htmlspecialchars($program['bil_peserta'] ?? '') ?>">
        </div>

        <div class="col-md-6">
          <label class="form-label">Sektor Perniagaan Peserta (Jumlah)</label>
          <input type="text" name="sektor_perniagaan_peserta" class="form-control"
                 value="<?= htmlspecialchars($program['sektor_perniagaan_peserta'] ?? '') ?>">
        </div>

        <div class="col-md-3">
          <label class="form-label">Peserta Pendapatan bawah  10K</label>
          <input type="number" name="jumlah_peserta_pendapatan_bawah_10k" class="form-control" min="0"
                 value="<?= htmlspecialchars($program['jumlah_peserta_pendapatan_bawah_10k'] ?? 0) ?>">
        </div>

        <div class="col-md-3">
          <label class="form-label">Peserta Pendapatan 10K dan Ke Atas</label>
          <input type="number" name="jumlah_peserta_pendapatan_atas_10k" class="form-control" min="0"
                 value="<?= htmlspecialchars($program['jumlah_peserta_pendapatan_atas_10k'] ?? 0) ?>">
        </div>

        <div class="col-md-3">
          <label class="form-label">Peserta Bayar Zakat</label>
          <input type="number" name="jumlah_peserta_bayar_zakat" class="form-control" min="0"
                 value="<?= htmlspecialchars($program['jumlah_peserta_bayar_zakat'] ?? 0) ?>">
        </div>

        <div class="col-md-4">
          <label class="form-label">Peruntukan (RM)</label>
          <input type="number" step="0.01" name="peruntukan_rm" class="form-control"
                 value="<?= htmlspecialchars($program['peruntukan_rm'] ?? 0) ?>">
        </div>

        <div class="col-md-4">
          <label class="form-label">Perbelanjaan (RM)</label>
          <input type="number" step="0.01" name="perbelanjaan_rm" class="form-control"
                 value="<?= htmlspecialchars($program['perbelanjaan_rm'] ?? 0) ?>">
        </div>

        <div class="col-md-4">
          <label class="form-label">Dana Wakalah (RM)</label>
          <input type="number" step="0.01" name="dana_wakalah_rm" class="form-control"
                 value="<?= htmlspecialchars($program['dana_wakalah_rm'] ?? 0) ?>">
        </div>

        <div class="col-md-6">
          <label class="form-label">Link ke SKU Aktiviti (optional)</label>
          <select name="sku_aktiviti_id" class="form-select">
            <option value="">-- Luar SKU (tidak dikira) --</option>
            <?php foreach ($skuList as $s): ?>
              <?php $selected = ((string)($program['sku_aktiviti_id'] ?? '') === (string)$s['sku_aktiviti_id']) ? 'selected' : ''; ?>
              <option value="<?= (int)$s['sku_aktiviti_id'] ?>" <?= $selected ?>>
                [<?= (int)$s['bil'] ?>] <?= htmlspecialchars(mb_strimwidth($s['nama_aktiviti'],0,90,'...')) ?>
              </option>
            <?php endforeach; ?>
          </select>
        </div>

        <div class="col-md-3">
          <label class="form-label">Status</label>
          <?php $st = $program['status'] ?? 'draft'; ?>
          <select name="status" class="form-select">
            <option value="draft" <?= $st==='draft'?'selected':'' ?>>draft</option>
            <option value="aktif" <?= $st==='aktif'?'selected':'' ?>>aktif</option>
            <option value="selesai" <?= $st==='selesai'?'selected':'' ?>>selesai</option>
            <option value="batal" <?= $st==='batal'?'selected':'' ?>>batal</option>
          </select>
        </div>

        <div class="col-12">
          <label class="form-label">Catatan</label>
          <textarea name="catatan" class="form-control" rows="2"><?= htmlspecialchars($program['catatan'] ?? '') ?></textarea>
        </div>

        <div class="col-12">
          <button class="btn btn-primary">Simpan Perubahan</button>
          <a href="/bpa/upu/program_list.php" class="btn btn-outline-secondary">📋 Senarai</a>
          <a href="/bpa/upu/dashboard.php" class="btn btn-outline-dark">Dashboard</a>
        </div>

      </form>
    </div>
  </div>

</div>

<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>