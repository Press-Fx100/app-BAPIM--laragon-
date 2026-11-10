<?php
require_once __DIR__ . '/../init.php';
require_login();

$name = htmlspecialchars($_SESSION['user']['user_nama'] ?? 'User');
$role = $_SESSION['user']['role'] ?? '';
$unit_id_session = $_SESSION['user']['unit_id'] ?? null;

// staff tak boleh tambah
if ($role === 'staff') {
    header("Location: /bpa/upa/program_list.php?msg=" . urlencode("Staff tidak dibenarkan tambah program."));
    exit;
}

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

$err = '';
$ok  = '';

$tahun = (int)($_GET['tahun'] ?? date('Y'));
if ($tahun < 2000 || $tahun > 2100) $tahun = (int)date('Y');

// SKU list ikut tahun
$stmtSku = $pdo->prepare("
    SELECT sku_aktiviti_id, bil, nama_aktiviti
    FROM sku_aktiviti
    WHERE tahun = :tahun
    ORDER BY bil ASC
");
$stmtSku->execute([':tahun' => $tahun]);
$skuList = $stmtSku->fetchAll(PDO::FETCH_ASSOC);

// default form values
$form = [
  'tahun' => $tahun,
  'nama_program' => '',
  'nk_jkb' => '',
  'tarikh_mula' => '',
  'tarikh_tamat' => '',
  'tempoh_kontrak' => '',
  'tempat' => '',
  'kerjasama_konsultan' => '',
  'bil_peserta' => '',
  'bil_peserta_daftar_ssm' => 0,
  'bil_peserta_mula_niaga' => 0,
  'peruntukan_rm' => 0,
  'perbelanjaan_rm' => 0,
  'dana_wakalah_rm' => 0,
  'sku_aktiviti_id' => '',
  'status' => 'draft',
  'catatan' => '',
];

if ($_SERVER['REQUEST_METHOD'] === 'POST') {

    foreach ($form as $k => $v) {
        if (isset($_POST[$k])) $form[$k] = is_string($_POST[$k]) ? trim($_POST[$k]) : $_POST[$k];
    }

    $tahun = (int)($form['tahun'] ?? date('Y'));
    if ($tahun < 2000 || $tahun > 2100) $tahun = (int)date('Y');

    $nama_program = trim($form['nama_program']);
    $nk_jkb = trim($form['nk_jkb']);

    $tarikh_mula = trim($form['tarikh_mula']);
    $tarikh_tamat = trim($form['tarikh_tamat']);
    $tempoh_kontrak = trim($form['tempoh_kontrak']);

    $tempat = trim($form['tempat']);
    $kerjasama = trim($form['kerjasama_konsultan']);

    $bil_peserta_raw = trim($form['bil_peserta']);
    $bil_peserta = ($bil_peserta_raw === '' ? null : (ctype_digit($bil_peserta_raw) ? (int)$bil_peserta_raw : null));

    $daftar_raw = trim((string)$form['bil_peserta_daftar_ssm']);
    $mula_raw   = trim((string)$form['bil_peserta_mula_niaga']);
    $bil_daftar = (ctype_digit($daftar_raw) ? (int)$daftar_raw : null);
    $bil_mula   = (ctype_digit($mula_raw) ? (int)$mula_raw : null);

    $peruntukan_rm = ($form['peruntukan_rm']==='' ? 0 : (is_numeric($form['peruntukan_rm']) ? (float)$form['peruntukan_rm'] : null));
    $perbelanjaan_rm = ($form['perbelanjaan_rm']==='' ? 0 : (is_numeric($form['perbelanjaan_rm']) ? (float)$form['perbelanjaan_rm'] : null));
    $dana_wakalah_rm = ($form['dana_wakalah_rm']==='' ? 0 : (is_numeric($form['dana_wakalah_rm']) ? (float)$form['dana_wakalah_rm'] : null));

    $status = $form['status'] ?? 'draft';
    if (!in_array($status, ['draft','aktif','selesai','batal'], true)) $status='draft';

    $catatan = trim($form['catatan']);

    $sku_raw = $form['sku_aktiviti_id'] ?? '';
    $sku_aktiviti_id = ($sku_raw === '' ? null : (ctype_digit($sku_raw) ? (int)$sku_raw : null));

    // ===== validation =====
    if ($nama_program === '') $err = "Nama program wajib diisi.";

    if (!$err && $tarikh_mula === '' && $tempoh_kontrak === '') {
        $err = "Sila isi sama ada Tarikh Mula atau Tempoh Kontrak.";
    }
    if (!$err && $tarikh_mula !== '' && $tarikh_tamat !== '' && $tarikh_tamat < $tarikh_mula) {
        $err = "Tarikh tamat tak boleh lebih awal dari tarikh mula.";
    }

    if (!$err && $bil_peserta_raw !== '' && $bil_peserta === null) $err = "Bil. peserta mesti nombor.";
    if (!$err && $bil_daftar === null) $err = "Bil peserta daftar SSM mesti nombor.";
    if (!$err && $bil_mula === null)   $err = "Bil peserta mula niaga mesti nombor.";

    if (!$err && ($peruntukan_rm === null || $peruntukan_rm < 0)) $err = "Peruntukan mesti nombor (tak boleh negatif).";
    if (!$err && ($perbelanjaan_rm === null || $perbelanjaan_rm < 0)) $err = "Perbelanjaan mesti nombor (tak boleh negatif).";
    if (!$err && ($dana_wakalah_rm === null || $dana_wakalah_rm < 0)) $err = "Dana wakalah mesti nombor (tak boleh negatif).";

    if (!$err) {
        try {
            $pdo->beginTransaction();

            // Insert program
            $stmt1 = $pdo->prepare("
                INSERT INTO program
                  (unit_id, sku_aktiviti_id, tahun, nama_program, nk_jkb, tarikh_mula, tarikh_tamat, tempoh_kontrak,
                   tempat, kerjasama_konsultan, bil_peserta,
                   peruntukan_rm, perbelanjaan_rm, dana_wakalah_rm, status, catatan)
                VALUES
                  (:unit_id, :sku_aktiviti_id, :tahun, :nama_program, :nk_jkb, :tarikh_mula, :tarikh_tamat, :tempoh_kontrak,
                   :tempat, :kerjasama, :bil_peserta,
                   :peruntukan, :perbelanjaan, :wakalah, :status, :catatan)
            ");
            $stmt1->execute([
                ':unit_id' => $upa_id,
                ':sku_aktiviti_id' => $sku_aktiviti_id,
                ':tahun' => $tahun,
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
            ]);

            $newId = (int)$pdo->lastInsertId();

            // Insert detail UPA
            $stmt2 = $pdo->prepare("
                INSERT INTO program_upa_detail
                  (program_id, bil_peserta_daftar_ssm, bil_peserta_mula_niaga)
                VALUES
                  (:program_id, :daftar, :mula)
            ");
            $stmt2->execute([
                ':program_id' => $newId,
                ':daftar' => $bil_daftar ?? 0,
                ':mula' => $bil_mula ?? 0,
            ]);

            $pdo->commit();

            header("Location: /bpa/upa/program_list.php?msg=" . urlencode("Program berjaya ditambah."));
            exit;

        } catch (Throwable $e) {
            $pdo->rollBack();
            $err = "Gagal simpan: " . $e->getMessage();
        }
    }

    // refresh sku list bila tahun berubah
    $stmtSku->execute([':tahun' => $tahun]);
    $skuList = $stmtSku->fetchAll(PDO::FETCH_ASSOC);
}
?>
<!DOCTYPE html>
<html lang="ms">
<head>
  <meta charset="UTF-8">
  <title>Tambah Program UPA</title>
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
      <h4 class="fw-bold mb-0">Tambah Program UPA</h4>
      <small class="text-muted">Masukkan program + bilangan peserta daftar SSM & mula niaga</small>
    </div>
    <div>
      <a href="/bpa/upa/dashboard.php" class="btn btn-outline-secondary">Dashboard</a>
    </div>
  </div>

  <?php if ($err): ?><div class="alert alert-danger"><?= htmlspecialchars($err) ?></div><?php endif; ?>

  <div class="card shadow-sm border-0">
    <div class="card-body">
      <form method="post" class="row g-3">

        <div class="col-md-2">
          <label class="form-label">Tahun</label>
          <input type="number" name="tahun" class="form-control" min="2000" max="2100"
                 value="<?= htmlspecialchars($form['tahun']) ?>" required>
        </div>

        <div class="col-md-7">
          <label class="form-label">Nama Program</label>
          <input type="text" name="nama_program" class="form-control" required
                 value="<?= htmlspecialchars($form['nama_program']) ?>">
        </div>

        <div class="col-md-3">
          <label class="form-label">NK / JKB</label>
          <input type="text" name="nk_jkb" class="form-control"
                 value="<?= htmlspecialchars($form['nk_jkb']) ?>">
        </div>

        <div class="col-md-3">
          <label class="form-label">Tarikh Mula</label>
          <input type="date" name="tarikh_mula" class="form-control"
                 value="<?= htmlspecialchars($form['tarikh_mula']) ?>">
        </div>

        <div class="col-md-3">
          <label class="form-label">Tarikh Tamat</label>
          <input type="date" name="tarikh_tamat" class="form-control"
                 value="<?= htmlspecialchars($form['tarikh_tamat']) ?>">
        </div>

        <div class="col-md-6">
          <label class="form-label">Tempoh Kontrak (optional)</label>
          <input type="text" name="tempoh_kontrak" class="form-control"
                 placeholder="Contoh: 3 tahun / 6 bulan"
                 value="<?= htmlspecialchars($form['tempoh_kontrak']) ?>">
        </div>

        <div class="col-md-6">
          <label class="form-label">Tempat</label>
          <input type="text" name="tempat" class="form-control"
                 value="<?= htmlspecialchars($form['tempat']) ?>">
        </div>

        <div class="col-md-6">
          <label class="form-label">Kerjasama / Konsultan</label>
          <input type="text" name="kerjasama_konsultan" class="form-control"
                 value="<?= htmlspecialchars($form['kerjasama_konsultan']) ?>">
        </div>

        <div class="col-md-3">
          <label class="form-label">Bil. Peserta</label>
          <input type="number" name="bil_peserta" class="form-control" min="0"
                 value="<?= htmlspecialchars($form['bil_peserta']) ?>">
        </div>

        <div class="col-md-3">
          <label class="form-label">Bil Peserta Daftar SSM</label>
          <input type="number" name="bil_peserta_daftar_ssm" class="form-control" min="0"
                 value="<?= htmlspecialchars($form['bil_peserta_daftar_ssm']) ?>">
        </div>

        <div class="col-md-3">
          <label class="form-label">Bil Peserta Mula Niaga</label>
          <input type="number" name="bil_peserta_mula_niaga" class="form-control" min="0"
                 value="<?= htmlspecialchars($form['bil_peserta_mula_niaga']) ?>">
        </div>

        <div class="col-md-3">
          <label class="form-label">Status</label>
          <select name="status" class="form-select">
            <?php foreach (['draft','aktif','selesai','batal'] as $s): ?>
              <option value="<?= $s ?>" <?= ($form['status']===$s?'selected':'') ?>><?= $s ?></option>
            <?php endforeach; ?>
          </select>
        </div>

        <div class="col-md-4">
          <label class="form-label">Peruntukan (RM)</label>
          <input type="number" step="0.01" name="peruntukan_rm" class="form-control"
                 value="<?= htmlspecialchars($form['peruntukan_rm']) ?>">
        </div>

        <div class="col-md-4">
          <label class="form-label">Perbelanjaan (RM)</label>
          <input type="number" step="0.01" name="perbelanjaan_rm" class="form-control"
                 value="<?= htmlspecialchars($form['perbelanjaan_rm']) ?>">
        </div>

        <div class="col-md-4">
          <label class="form-label">Dana Wakalah (RM)</label>
          <input type="number" step="0.01" name="dana_wakalah_rm" class="form-control"
                 value="<?= htmlspecialchars($form['dana_wakalah_rm']) ?>">
        </div>

        <div class="col-md-6">
          <label class="form-label">Link ke SKU Aktiviti (optional)</label>
          <select name="sku_aktiviti_id" class="form-select">
            <option value="">-- Luar SKU (tidak dikira) --</option>
            <?php foreach ($skuList as $s): ?>
              <option value="<?= (int)$s['sku_aktiviti_id'] ?>" <?= ((string)$form['sku_aktiviti_id']===(string)$s['sku_aktiviti_id'])?'selected':'' ?>>
                [<?= (int)$s['bil'] ?>] <?= htmlspecialchars(mb_strimwidth($s['nama_aktiviti'],0,90,'...')) ?>
              </option>
            <?php endforeach; ?>
          </select>
        </div>

        <div class="col-12">
          <label class="form-label">Catatan</label>
          <textarea name="catatan" class="form-control" rows="2"><?= htmlspecialchars($form['catatan']) ?></textarea>
        </div>

        <div class="col-12">
          <button class="btn btn-primary">Simpan Program</button>
          <a href="/bpa/upa/program_list.php" class="btn btn-outline-secondary">📋 Senarai Program</a>
          <a href="/bpa/upa/dashboard.php" class="btn btn-outline-dark">Dashboard</a>
        </div>

      </form>
    </div>
  </div>

</div>

<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>
