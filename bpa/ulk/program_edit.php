<?php
require_once __DIR__ . '/../init.php';
require_login();

$name = htmlspecialchars($_SESSION['user']['user_nama'] ?? 'User');
$role = $_SESSION['user']['role'] ?? '';
$unit_id_session = $_SESSION['user']['unit_id'] ?? null;

if (isset($bpaCanEdit) ? !$bpaCanEdit : $role === 'staff') {
    header("Location: /bpa/ulk/program_list.php?msg=" . urlencode("Staff tidak dibenarkan edit program."));
    exit;
}

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

$err = '';
$ok  = '';

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
           d.baki_belanja_rm
    FROM program p
    LEFT JOIN program_ulk_detail d ON d.program_id = p.program_id
    WHERE p.program_id = ? AND p.unit_id = ?
    LIMIT 1
");
$stmt->execute([$program_id, $ulk_id]);
$program = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$program) {
    header("Location: /bpa/ulk/program_list.php?msg=" . urlencode("Program tidak dijumpai."));
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

    $tarikh_mula_lanjutan  = trim($_POST['tarikh_mula_lanjutan'] ?? '');
    $tarikh_tamat_lanjutan = trim($_POST['tarikh_tamat_lanjutan'] ?? '');

    $tempoh_pengajian = trim($_POST['tempoh_pengajian'] ?? '');
    $tempat_pengajian = trim($_POST['tempat_pengajian'] ?? '');
    $kerjasama = trim($_POST['kerjasama_konsultan'] ?? '');

    $siri_batch = trim($_POST['siri_batch'] ?? '');

    $tarikh_masuk = trim($_POST['tarikh_masuk'] ?? '');
    $tarikh_tamat_pengajian = trim($_POST['tarikh_tamat_pengajian'] ?? '');

    $kuota_raw = trim($_POST['kuota'] ?? '');
    $kuota = ($kuota_raw === '' ? null : (ctype_digit($kuota_raw) ? (int)$kuota_raw : null));

    $sedia_raw = trim($_POST['jumlah_sedia_ada'] ?? '0');
    $semasa_raw = trim($_POST['jumlah_peserta_semasa'] ?? '0');
    $baki_raw   = trim($_POST['baki_jumlah_peserta'] ?? '');
    $bekerja_raw= trim($_POST['jumlah_peserta_bekerja'] ?? '0');
    $tarik_raw  = trim($_POST['jumlah_peserta_tarik_diri'] ?? '0');

    $sedia   = (ctype_digit($sedia_raw) ? (int)$sedia_raw : null);
    $semasa  = (ctype_digit($semasa_raw) ? (int)$semasa_raw : null);
    $baki    = ($baki_raw === '' ? null : (ctype_digit($baki_raw) ? (int)$baki_raw : null));
    $bekerja = (ctype_digit($bekerja_raw) ? (int)$bekerja_raw : null);
    $tarik   = (ctype_digit($tarik_raw) ? (int)$tarik_raw : null);

    $peruntukan_raw = trim($_POST['peruntukan_rm'] ?? '');
    $peruntukan_rm = ($peruntukan_raw === '' ? 0 : (is_numeric($peruntukan_raw) ? (float)$peruntukan_raw : null));

    $peruntukan_semasa_raw = trim($_POST['peruntukan_semasa_rm'] ?? '');
    $peruntukan_semasa_rm = ($peruntukan_semasa_raw === '' ? 0 : (is_numeric($peruntukan_semasa_raw) ? (float)$peruntukan_semasa_raw : null));

    $perbelanjaan_raw = trim($_POST['perbelanjaan_rm'] ?? '');
    $perbelanjaan_rm = ($perbelanjaan_raw === '' ? 0 : (is_numeric($perbelanjaan_raw) ? (float)$perbelanjaan_raw : null));

    $baki_belanja_raw = trim($_POST['baki_belanja_rm'] ?? '');
    $baki_belanja_rm = ($baki_belanja_raw === '' ? 0 : (is_numeric($baki_belanja_raw) ? (float)$baki_belanja_raw : null));

    $status = $_POST['status'] ?? 'draft';
    if (!in_array($status, ['draft','aktif','selesai','batal'], true)) $status = 'draft';

    $catatan = trim($_POST['catatan'] ?? '');

    $sku_aktiviti_id_raw = $_POST['sku_aktiviti_id'] ?? '';
    $sku_aktiviti_id = ($sku_aktiviti_id_raw === '' ? null : (ctype_digit($sku_aktiviti_id_raw) ? (int)$sku_aktiviti_id_raw : null));

    if ($nama_program === '') $err = "Nama program wajib diisi.";

    if (!$err && $tarikh_mula === '' && $tempoh_kontrak === '') {
        $err = "Sila isi sama ada Tarikh Mula atau Tempoh Kontrak.";
    }

    if (!$err && $tarikh_mula !== '' && $tarikh_tamat !== '' && $tarikh_tamat < $tarikh_mula) {
        $err = "Tarikh tamat tak boleh lebih awal dari tarikh mula.";
    }

    if (!$err && $tarikh_mula_lanjutan !== '' && $tarikh_tamat_lanjutan !== '' && $tarikh_tamat_lanjutan < $tarikh_mula_lanjutan) {
        $err = "Tarikh tamat lanjutan tak boleh lebih awal dari tarikh mula lanjutan.";
    }

    if (!$err && $kuota_raw !== '' && $kuota === null) $err = "Kuota mesti nombor.";
    if (!$err && $sedia === null) $err = "Jumlah sedia ada mesti nombor.";
    if (!$err && $semasa === null) $err = "Jumlah lapor diri tahun semasa mesti nombor.";
    if (!$err && $bekerja === null) $err = "Jumlah peserta bekerja mesti nombor.";
    if (!$err && $tarik === null) $err = "Jumlah peserta tarik diri mesti nombor.";

    if (!$err && ($peruntukan_rm === null || $peruntukan_rm < 0)) $err = "Peruntukan kontrak mesti nombor (tak boleh negatif).";
    if (!$err && ($peruntukan_semasa_rm === null || $peruntukan_semasa_rm < 0)) $err = "Peruntukan semasa mesti nombor (tak boleh negatif).";
    if (!$err && ($perbelanjaan_rm === null || $perbelanjaan_rm < 0)) $err = "Perbelanjaan mesti nombor (tak boleh negatif).";
    if (!$err && ($baki_belanja_rm === null || $baki_belanja_rm < 0)) $err = "Baki belanja mesti nombor (tak boleh negatif).";

    if (!$err && $kuota !== null && $sedia !== null && $semasa !== null) {
        $baki = max($kuota - ($sedia + $semasa), 0);
    } elseif (!$err && $baki_raw !== '' && $baki === null) {
        $err = "Baki peserta diperlukan mesti nombor.";
    }

    if (!$err && $peruntukan_semasa_rm !== null && $perbelanjaan_rm !== null) {
        $baki_belanja_rm = max($peruntukan_semasa_rm - $perbelanjaan_rm, 0);
    }

    if (!$err) {
        try {
            $pdo->beginTransaction();

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
                  tempat = NULL,
                  kerjasama_konsultan = :kerjasama,
                  bil_peserta = :bil_peserta,
                  peruntukan_rm = :peruntukan,
                  perbelanjaan_rm = :perbelanjaan,
                  dana_wakalah_rm = 0,
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
                ':kerjasama' => ($kerjasama===''?null:$kerjasama),
                ':bil_peserta' => (int)($semasa ?? 0),
                ':peruntukan' => $peruntukan_rm,
                ':perbelanjaan' => $perbelanjaan_rm,
                ':status' => $status,
                ':catatan' => ($catatan===''?null:$catatan),
                ':program_id' => $program_id,
                ':unit_id' => $ulk_id,
            ]);

            $stmt2 = $pdo->prepare("
                INSERT INTO program_ulk_detail
                  (program_id, kuota, jumlah_sedia_ada, siri_batch,  tarikh_masuk, tarikh_tamat_pengajian, tempoh_pengajian, tempat_pengajian,
                   tarikh_mula_lanjutan, tarikh_tamat_lanjutan,
                   jumlah_peserta_semasa, baki_jumlah_peserta, jumlah_peserta_bekerja, jumlah_peserta_tarik_diri,
                   peruntukan_semasa_rm, baki_belanja_rm)
                VALUES
                  (:program_id, :kuota, :jumlah_sedia_ada, :siri_batch, :tarikh_masuk, :tarikh_tamat_pengajian, :tempoh_pengajian, :tempat_pengajian,
                   :tarikh_mula_lanjutan, :tarikh_tamat_lanjutan,
                   :semasa, :baki, :bekerja, :tarik,
                   :peruntukan_semasa, :baki_belanja)
                ON DUPLICATE KEY UPDATE
                  kuota = VALUES(kuota),
                  jumlah_sedia_ada = VALUES(jumlah_sedia_ada),
                  siri_batch = VALUES(siri_batch),
                  tarikh_masuk = VALUES(tarikh_masuk),
                  tarikh_tamat_pengajian = VALUES(tarikh_tamat_pengajian),
                  tempoh_pengajian = VALUES(tempoh_pengajian),
                  tempat_pengajian = VALUES(tempat_pengajian),
                  tarikh_mula_lanjutan = VALUES(tarikh_mula_lanjutan),
                  tarikh_tamat_lanjutan = VALUES(tarikh_tamat_lanjutan),
                  jumlah_peserta_semasa = VALUES(jumlah_peserta_semasa),
                  baki_jumlah_peserta = VALUES(baki_jumlah_peserta),
                  jumlah_peserta_bekerja = VALUES(jumlah_peserta_bekerja),
                  jumlah_peserta_tarik_diri = VALUES(jumlah_peserta_tarik_diri),
                  peruntukan_semasa_rm = VALUES(peruntukan_semasa_rm),
                  baki_belanja_rm = VALUES(baki_belanja_rm)
            ");
            $stmt2->execute([
                ':program_id' => $program_id,
                ':kuota' => $kuota,
                ':jumlah_sedia_ada' => (int)($sedia ?? 0),
                ':siri_batch' => ($siri_batch===''?null:$siri_batch),
                ':tarikh_masuk' => ($tarikh_masuk===''?null:$tarikh_masuk),
                ':tarikh_tamat_pengajian' => ($tarikh_tamat_pengajian===''?null:$tarikh_tamat_pengajian),
                ':tempoh_pengajian' => ($tempoh_pengajian===''?null:$tempoh_pengajian),
                ':tempat_pengajian' => ($tempat_pengajian===''?null:$tempat_pengajian),
                ':tarikh_mula_lanjutan' => ($tarikh_mula_lanjutan===''?null:$tarikh_mula_lanjutan),
                ':tarikh_tamat_lanjutan' => ($tarikh_tamat_lanjutan===''?null:$tarikh_tamat_lanjutan),
                ':semasa' => (int)($semasa ?? 0),
                ':baki' => (int)($baki ?? 0),
                ':bekerja' => (int)($bekerja ?? 0),
                ':tarik' => (int)($tarik ?? 0),
                ':peruntukan_semasa' => $peruntukan_semasa_rm,
                ':baki_belanja' => $baki_belanja_rm,
            ]);

            $pdo->commit();
            $ok = "Program berjaya dikemaskini.";

            $stmt->execute([$program_id, $ulk_id]);
            $program = $stmt->fetch(PDO::FETCH_ASSOC);

        } catch (Throwable $e) {
            $pdo->rollBack();
            $err = "Gagal update: " . $e->getMessage();
        }
    }

    $formYear = $tahun;
}

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
  <title>Edit Program ULK</title>
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
      <h4 class="fw-bold mb-0">Edit Program ULK</h4>
      <small class="text-muted">Kemaskini program + maklumat kemasukan ULK</small>
    </div>
    <div>
      <a href="/bpa/ulk/program_list.php" class="btn btn-outline-dark">⬅ Kembali Senarai</a>
      <a href="/bpa/ulk/program_view.php?id=<?= $program_id ?>" class="btn btn-outline-info">🔍 View</a>
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

        <div class="col-12">
          <h6 class="fw-bold mb-0">Tarikh Kontrak Asal</h6>
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

        <div class="col-md-4">
          <label class="form-label">Tempoh Kontrak (optional)</label>
          <input type="text" name="tempoh_kontrak" class="form-control"
                 placeholder="Contoh: 3 tahun / 6 bulan"
                 value="<?= htmlspecialchars($program['tempoh_kontrak'] ?? '') ?>">
        </div>

        <div class="col-12">
          <h6 class="fw-bold mb-0">Tarikh Perlanjutan</h6>
        </div>

        <div class="col-md-3">
          <label class="form-label">Tarikh Mula Lanjutan</label>
          <input type="date" name="tarikh_mula_lanjutan" class="form-control"
                 value="<?= htmlspecialchars($program['tarikh_mula_lanjutan'] ?? '') ?>">
        </div>

        <div class="col-md-3">
          <label class="form-label">Tarikh Tamat Lanjutan</label>
          <input type="date" name="tarikh_tamat_lanjutan" class="form-control"
                 value="<?= htmlspecialchars($program['tarikh_tamat_lanjutan'] ?? '') ?>">
        </div>

        <div class="w-100"></div>

        <div class="col-md-4">
          <label class="form-label">Tempoh Pengajian</label>
          <input type="text" name="tempoh_pengajian" class="form-control"
                 placeholder="Contoh: 6 bulan / 3 bulan"
                 value="<?= htmlspecialchars($program['tempoh_pengajian'] ?? '') ?>">
        </div>

        <div class="col-md-4">
          <label class="form-label">Tempat Pengajian</label>
          <input type="text" name="tempat_pengajian" class="form-control"
                 value="<?= htmlspecialchars($program['tempat_pengajian'] ?? '') ?>">
        </div>

        <div class="col-md-4">
          <label class="form-label">Kerjasama / Konsultan</label>
          <input type="text" name="kerjasama_konsultan" class="form-control"
                 value="<?= htmlspecialchars($program['kerjasama_konsultan'] ?? '') ?>">
        </div>

        <hr class="mt-2">

        <div class="col-12">
          <h6 class="fw-bold mb-0">Maklumat Kemasukan</h6>
        </div>

        <div class="col-md-3">
          <label class="form-label">Siri / Batch</label>
          <input type="text" name="siri_batch" class="form-control"
                 placeholder="Contoh: Batch 1 / Siri 2"
                 value="<?= htmlspecialchars($program['siri_batch'] ?? '') ?>">
        </div>

        <div class="col-md-3">
          <label class="form-label">Tarikh Masuk</label>
          <input type="date" name="tarikh_masuk" class="form-control"
                value="<?= htmlspecialchars($program['tarikh_masuk'] ?? '') ?>">
        </div>

        <div class="col-md-3">
           <label class="form-label">Tarikh Tamat Pengajian</label>
          <input type="date" name="tarikh_tamat_pengajian" class="form-control"
                value="<?= htmlspecialchars($program['tarikh_tamat_pengajian'] ?? '') ?>">
        </div>


        <div class="col-md-2">
          <label class="form-label">Kuota</label>
          <input type="number" name="kuota" class="form-control" min="0"
                 value="<?= htmlspecialchars($program['kuota'] ?? '') ?>">
        </div>

        <div class="col-md-2">
          <label class="form-label">Jumlah Sedia Ada</label>
          <input type="number" name="jumlah_sedia_ada" class="form-control" min="0"
                 value="<?= htmlspecialchars($program['jumlah_sedia_ada'] ?? 0) ?>">
        </div>

        <div class="col-md-3">
          <label class="form-label">Jumlah Lapor Diri Tahun Semasa</label>
          <input type="number" name="jumlah_peserta_semasa" class="form-control" min="0"
                 value="<?= htmlspecialchars($program['jumlah_peserta_semasa'] ?? 0) ?>">
          <small class="text-muted">Nilai ini akan dikira dalam SKU.</small>
        </div>

        <div class="col-md-2">
          <label class="form-label">Baki Peserta Diperlukan</label>
          <input type="number" name="baki_jumlah_peserta" class="form-control" min="0"
                 value="<?= htmlspecialchars($program['baki_jumlah_peserta'] ?? 0) ?>" readonly>
          <small class="text-muted">Kuota - (sedia ada + lapor diri).</small>
        </div>

        <div class="col-md-3">
          <label class="form-label">Jumlah Peserta Bekerja</label>
          <input type="number" name="jumlah_peserta_bekerja" class="form-control" min="0"
                 value="<?= htmlspecialchars($program['jumlah_peserta_bekerja'] ?? 0) ?>">
        </div>

        <div class="col-md-3">
          <label class="form-label">Jumlah Peserta Tarik Diri</label>
          <input type="number" name="jumlah_peserta_tarik_diri" class="form-control" min="0"
                 value="<?= htmlspecialchars($program['jumlah_peserta_tarik_diri'] ?? 0) ?>">
        </div>

        <hr class="mt-2">

        <div class="col-12">
          <h6 class="fw-bold mb-0">Peruntukan & Perbelanjaan</h6>
        </div>

        <div class="col-md-3">
          <label class="form-label">Peruntukan Kontrak (RM)</label>
          <input type="number" step="0.01" name="peruntukan_rm" class="form-control"
                 value="<?= htmlspecialchars($program['peruntukan_rm'] ?? 0) ?>">
        </div>

        <div class="col-md-3">
          <label class="form-label">Peruntukan Semasa (RM)</label>
          <input type="number" step="0.01" name="peruntukan_semasa_rm" class="form-control"
                 value="<?= htmlspecialchars($program['peruntukan_semasa_rm'] ?? 0) ?>">
        </div>

        <div class="col-md-3">
          <label class="form-label">Perbelanjaan (RM)</label>
          <input type="number" step="0.01" name="perbelanjaan_rm" class="form-control"
                 value="<?= htmlspecialchars($program['perbelanjaan_rm'] ?? 0) ?>">
        </div>

        <div class="col-md-3">
          <label class="form-label">Baki Belanja (RM)</label>
          <input type="number" step="0.01" name="baki_belanja_rm" class="form-control"
                 value="<?= htmlspecialchars($program['baki_belanja_rm'] ?? 0) ?>" readonly>
          <small class="text-muted">Auto kira peruntukan semasa - perbelanjaan.</small>
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
          <a href="/bpa/ulk/program_list.php" class="btn btn-outline-secondary">📋 Senarai</a>
          <a href="/bpa/ulk/dashboard.php" class="btn btn-outline-dark">Dashboard</a>
        </div>

      </form>
    </div>
  </div>

</div>

<script>
  const kuotaEl = document.querySelector('input[name="kuota"]');
  const sediaEl = document.querySelector('input[name="jumlah_sedia_ada"]');
  const semasaEl = document.querySelector('input[name="jumlah_peserta_semasa"]');
  const bakiEl = document.querySelector('input[name="baki_jumlah_peserta"]');

  function kiraBakiPeserta() {
    const kuota = parseInt(kuotaEl.value || '0', 10);
    const sedia = parseInt(sediaEl.value || '0', 10);
    const semasa = parseInt(semasaEl.value || '0', 10);

    if (kuotaEl.value === '') {
      bakiEl.value = '';
      return;
    }

    bakiEl.value = Math.max(kuota - (sedia + semasa), 0);
  }

  if (kuotaEl && sediaEl && semasaEl && bakiEl) {
    kuotaEl.addEventListener('input', kiraBakiPeserta);
    sediaEl.addEventListener('input', kiraBakiPeserta);
    semasaEl.addEventListener('input', kiraBakiPeserta);
    kiraBakiPeserta();
  }

  const peruntukanSemasaEl = document.querySelector('input[name="peruntukan_semasa_rm"]');
  const perbelanjaanEl = document.querySelector('input[name="perbelanjaan_rm"]');
  const bakiBelanjaEl = document.querySelector('input[name="baki_belanja_rm"]');

  function kiraBakiBelanja() {
    const peruntukan = parseFloat(peruntukanSemasaEl.value || '0');
    const belanja = parseFloat(perbelanjaanEl.value || '0');

    bakiBelanjaEl.value = Math.max(peruntukan - belanja, 0).toFixed(2);
  }

  if (peruntukanSemasaEl && perbelanjaanEl && bakiBelanjaEl) {
    peruntukanSemasaEl.addEventListener('input', kiraBakiBelanja);
    perbelanjaanEl.addEventListener('input', kiraBakiBelanja);
    kiraBakiBelanja();
  }
</script>

<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>