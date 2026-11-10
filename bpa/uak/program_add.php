<?php
require_once __DIR__ . '/../init.php';
require_login();

$role = $_SESSION['user']['role'] ?? '';
$unit_id_session = $_SESSION['user']['unit_id'] ?? null;

// staff tak boleh tambah
if ($role === 'staff') {
    header("Location: /bpa/uak/dashboard.php?error=" . urlencode("Staff tidak dibenarkan tambah program."));
    exit;
}

$name = htmlspecialchars($_SESSION['user']['user_nama'] ?? 'User');

// Dapatkan unit_id untuk UAK (lebih selamat)
$stmtU = $pdo->prepare("SELECT unit_id FROM unit WHERE nama_unit='UAK' LIMIT 1");
$stmtU->execute();
$uak = $stmtU->fetch(PDO::FETCH_ASSOC);
if (!$uak) die("Unit UAK belum wujud dalam table unit.");

$uak_id = (int)$uak['unit_id'];

// editor hanya boleh unit sendiri
if ($role === 'editor' && (int)$unit_id_session !== $uak_id) {
    header("Location: /bpa/dashboard.php?error=" . urlencode("Anda bukan editor UAK."));
    exit;
}

$err = '';
$ok  = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {

    $tahun = (int)($_POST['tahun'] ?? date('Y'));
    if ($tahun < 2000 || $tahun > 2100) $tahun = (int)date('Y');

    $nama_program = trim($_POST['nama_program'] ?? '');
    $nk_jkb = trim($_POST['nk_jkb'] ?? '');

    $tarikh_mula  = trim($_POST['tarikh_mula'] ?? '');
    $tarikh_tamat = trim($_POST['tarikh_tamat'] ?? '');

    $tempoh_kontrak = trim($_POST['tempoh_kontrak'] ?? ''); // contoh: 3 tahun

    $tempat = trim($_POST['tempat'] ?? '');
    $kerjasama = trim($_POST['kerjasama_konsultan'] ?? '');

    $bil_peserta_raw = trim($_POST['bil_peserta'] ?? '');
    $bil_peserta = ($bil_peserta_raw === '' ? null : (ctype_digit($bil_peserta_raw) ? (int)$bil_peserta_raw : null));

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
    if ($nama_program === '') {
        $err = "Nama program wajib diisi.";
    }

    // Tarikh/Tempoh kontrak: mesti ada salah satu
    if (!$err) {
        $hasTarikhMula = ($tarikh_mula !== '');
        $hasTempoh = ($tempoh_kontrak !== '');

        if (!$hasTarikhMula && !$hasTempoh) {
            $err = "Sila isi sama ada Tarikh Mula atau Tempoh Kontrak.";
        }
    }

    if (!$err && $tarikh_mula !== '' && $tarikh_tamat !== '' && $tarikh_tamat < $tarikh_mula) {
        $err = "Tarikh tamat tak boleh lebih awal dari tarikh mula.";
    }

    if (!$err && $bil_peserta_raw !== '' && $bil_peserta === null) {
        $err = "Bilangan peserta mesti nombor.";
    }

    if (!$err && ($peruntukan_rm === null || $peruntukan_rm < 0)) {
        $err = "Peruntukan mesti nombor (tak boleh negatif).";
    }
    if (!$err && ($perbelanjaan_rm === null || $perbelanjaan_rm < 0)) {
        $err = "Perbelanjaan mesti nombor (tak boleh negatif).";
    }
    if (!$err && ($dana_wakalah_rm === null || $dana_wakalah_rm < 0)) {
        $err = "Dana wakalah mesti nombor (tak boleh negatif).";
    }

    // ===== INSERT =====
    if (!$err) {
        try {
            $stmt = $pdo->prepare("
                INSERT INTO program
                (unit_id, sku_aktiviti_id, tahun, nama_program, nk_jkb,
                 tarikh_mula, tarikh_tamat, tempoh_kontrak,
                 tempat, kerjasama_konsultan, bil_peserta,
                 peruntukan_rm, perbelanjaan_rm, dana_wakalah_rm,
                 status, catatan)
                VALUES
                (:unit_id, :sku_aktiviti_id, :tahun, :nama_program, :nk_jkb,
                 :tarikh_mula, :tarikh_tamat, :tempoh_kontrak,
                 :tempat, :kerjasama, :bil_peserta,
                 :peruntukan, :perbelanjaan, :wakalah,
                 :status, :catatan)
            ");
            $stmt->execute([
                ':unit_id' => $uak_id,
                ':sku_aktiviti_id' => $sku_aktiviti_id,
                ':tahun' => $tahun,
                ':nama_program' => $nama_program,
                ':nk_jkb' => ($nk_jkb === '' ? null : $nk_jkb),
                ':tarikh_mula' => ($tarikh_mula === '' ? null : $tarikh_mula),
                ':tarikh_tamat' => ($tarikh_tamat === '' ? null : $tarikh_tamat),
                ':tempoh_kontrak' => ($tempoh_kontrak === '' ? null : $tempoh_kontrak),
                ':tempat' => ($tempat === '' ? null : $tempat),
                ':kerjasama' => ($kerjasama === '' ? null : $kerjasama),
                ':bil_peserta' => $bil_peserta,
                ':peruntukan' => $peruntukan_rm,
                ':perbelanjaan' => $perbelanjaan_rm,
                ':wakalah' => $dana_wakalah_rm,
                ':status' => $status,
                ':catatan' => ($catatan === '' ? null : $catatan),
            ]);

            $ok = "Program UPK berjaya ditambah!";
            $_POST = [];
        } catch (Throwable $e) {
            $err = "Gagal tambah program: " . $e->getMessage();
        }
    }
}

// Load SKU list based on form year
$formYear = (int)($_POST['tahun'] ?? date('Y'));
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
  <title>Tambah Program UAK</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
  <style>
    body { background-color:#f4f6f8; padding-top:70px; }
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
      <h4 class="fw-bold mb-0">Tambah Program UAK</h4>
      <small class="text-muted">Tarikh pelaksanaan / tempoh kontrak</small>
    </div>
    <div>
      <a href="/bpa/uak/dashboard.php" class="btn btn-outline-dark">Dashboard</a>
    </div>
  </div>

  <?php if ($err): ?>
    <div class="alert alert-danger"><?= htmlspecialchars($err) ?></div>
  <?php endif; ?>
  <?php if ($ok): ?>
    <div class="alert alert-success"><?= htmlspecialchars($ok) ?></div>
  <?php endif; ?>

  <div class="card shadow-sm border-0">
    <div class="card-body">
      <form method="post" class="row g-3">

        <div class="col-md-2">
          <label class="form-label">Tahun</label>
          <input type="number" name="tahun" class="form-control" min="2000" max="2100"
                 value="<?= htmlspecialchars($_POST['tahun'] ?? date('Y')) ?>" required>
        </div>

        <div class="col-md-6">
          <label class="form-label">Nama Program</label>
          <input type="text" name="nama_program" class="form-control" required
                 value="<?= htmlspecialchars($_POST['nama_program'] ?? '') ?>">
        </div>

        <div class="col-md-4">
          <label class="form-label">NK / JKB</label>
          <input type="text" name="nk_jkb" class="form-control"
                 value="<?= htmlspecialchars($_POST['nk_jkb'] ?? '') ?>">
        </div>

        <div class="col-md-3">
          <label class="form-label">Tarikh Mula</label>
          <input type="date" name="tarikh_mula" class="form-control"
                 value="<?= htmlspecialchars($_POST['tarikh_mula'] ?? '') ?>">
        </div>

        <div class="col-md-3">
          <label class="form-label">Tarikh Tamat</label>
          <input type="date" name="tarikh_tamat" class="form-control"
                 value="<?= htmlspecialchars($_POST['tarikh_tamat'] ?? '') ?>">
        </div>

        <div class="col-md-6">
          <label class="form-label">Tempoh Kontrak (optional)</label>
          <input type="text" name="tempoh_kontrak" class="form-control"
                 placeholder="Contoh: 3 tahun / 6 bulan / 12 minggu"
                 value="<?= htmlspecialchars($_POST['tempoh_kontrak'] ?? '') ?>">
          <small class="text-muted">Isi jika program jenis kontrak/tempoh. Kalau ada tarikh, boleh biar kosong.</small>
        </div>

        <div class="col-md-6">
          <label class="form-label">Tempat</label>
          <input type="text" name="tempat" class="form-control"
                 value="<?= htmlspecialchars($_POST['tempat'] ?? '') ?>">
        </div>

        <div class="col-md-6">
          <label class="form-label">Kerjasama / Konsultan</label>
          <input type="text" name="kerjasama_konsultan" class="form-control"
                 value="<?= htmlspecialchars($_POST['kerjasama_konsultan'] ?? '') ?>">
        </div>

        <div class="col-md-3">
          <label class="form-label">Bilangan Peserta</label>
          <input type="number" name="bil_peserta" class="form-control" min="0"
                 value="<?= htmlspecialchars($_POST['bil_peserta'] ?? '') ?>">
        </div>

        <div class="col-md-3">
          <label class="form-label">Peruntukan (RM)</label>
          <input type="number" step="0.01" name="peruntukan_rm" class="form-control"
                 value="<?= htmlspecialchars($_POST['peruntukan_rm'] ?? '') ?>">
        </div>

        <div class="col-md-3">
          <label class="form-label">Perbelanjaan (RM)</label>
          <input type="number" step="0.01" name="perbelanjaan_rm" class="form-control"
                 value="<?= htmlspecialchars($_POST['perbelanjaan_rm'] ?? '') ?>">
        </div>

        <div class="col-md-3">
          <label class="form-label">Dana Wakalah (RM)</label>
          <input type="number" step="0.01" name="dana_wakalah_rm" class="form-control"
                 value="<?= htmlspecialchars($_POST['dana_wakalah_rm'] ?? '') ?>">
        </div>

        <div class="col-md-6">
          <label class="form-label">Link ke SKU Aktiviti (optional)</label>
          <select name="sku_aktiviti_id" class="form-select">
            <option value="">-- Luar SKU (tidak dikira) --</option>
            <?php foreach ($skuList as $s): ?>
              <option value="<?= (int)$s['sku_aktiviti_id'] ?>"
                <?= ((string)($_POST['sku_aktiviti_id'] ?? '') === (string)$s['sku_aktiviti_id']) ? 'selected' : '' ?>>
                [<?= (int)$s['bil'] ?>] <?= htmlspecialchars(mb_strimwidth($s['nama_aktiviti'], 0, 90, '...')) ?>
              </option>
            <?php endforeach; ?>
          </select>
          <small class="text-muted">Pilih jika program termasuk kiraan SKU.</small>
        </div>

        <div class="col-md-3">
          <label class="form-label">Status</label>
          <?php $st = $_POST['status'] ?? 'draft'; ?>
          <select name="status" class="form-select">
            <option value="draft" <?= $st==='draft'?'selected':'' ?>>draft</option>
            <option value="aktif" <?= $st==='aktif'?'selected':'' ?>>aktif</option>
            <option value="selesai" <?= $st==='selesai'?'selected':'' ?>>selesai</option>
            <option value="batal" <?= $st==='batal'?'selected':'' ?>>batal</option>
          </select>
        </div>

        <div class="col-12">
          <label class="form-label">Catatan</label>
          <textarea name="catatan" class="form-control" rows="2"><?= htmlspecialchars($_POST['catatan'] ?? '') ?></textarea>
        </div>

        <div class="col-12">
          <button class="btn btn-primary">Simpan Program</button>
          <a href="/bpa/uak/program_list.php" class="btn btn-outline-secondary">📋 Senarai Program</a>
          <a href="/bpa/uak/dashboard.php" class="btn btn-outline-dark">Dashboard</a>
        </div>

      </form>
    </div>
  </div>

</div>

<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>
