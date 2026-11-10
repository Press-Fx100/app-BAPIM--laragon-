<?php
require_once __DIR__ . '/../init.php';
require_login();

$name = htmlspecialchars($_SESSION['user']['user_nama'] ?? 'User');
$role = $_SESSION['user']['role'] ?? '';
$unit_id_session = $_SESSION['user']['unit_id'] ?? null;

if ($role === 'staff') {
    header("Location: /bpa/ulk/program_list.php?msg=" . urlencode("Staff tidak dibenarkan tambah program."));
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

$err = '';
$tahun = (int)($_GET['tahun'] ?? date('Y'));
if ($tahun < 2000 || $tahun > 2100) $tahun = (int)date('Y');

$stmtSku = $pdo->prepare("
    SELECT sku_aktiviti_id, bil, nama_aktiviti
    FROM sku_aktiviti
    WHERE tahun = :tahun
    ORDER BY bil ASC
");
$stmtSku->execute([':tahun' => $tahun]);
$skuList = $stmtSku->fetchAll(PDO::FETCH_ASSOC);

$form = [
  'tahun' => $tahun,
  'nama_program' => '',
  'nk_jkb' => '',
  'tarikh_mula' => '',
  'tarikh_tamat' => '',
  'tempoh_kontrak' => '',
  'kerjasama_konsultan' => '',

  'tarikh_mula_lanjutan' => '',
  'tarikh_tamat_lanjutan' => '',
  'siri_batch' => '',
  'tarikh_masuk' => '',
  'tarikh_tamat_pengajian' => '',
  'tempoh_pengajian' => '',
  'tempat_pengajian' => '',

  'kuota' => '',
  'jumlah_sedia_ada' => 0,
  'jumlah_peserta_semasa' => 0,
  'baki_jumlah_peserta' => '',
  'jumlah_peserta_bekerja' => 0,
  'jumlah_peserta_tarik_diri' => 0,

  'peruntukan_rm' => 0,
  'peruntukan_semasa_rm' => 0,
  'perbelanjaan_rm' => 0,
  'baki_belanja_rm' => 0,

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

    $kerjasama = trim($form['kerjasama_konsultan']);

    $tarikh_mula_lanjutan = trim($form['tarikh_mula_lanjutan']);
    $tarikh_tamat_lanjutan = trim($form['tarikh_tamat_lanjutan']);
    $siri_batch = trim($form['siri_batch']);
    $tarikh_masuk = trim($form['tarikh_masuk']);
    $tarikh_tamat_pengajian = trim($form['tarikh_tamat_pengajian']);
    $tempoh_pengajian = trim($form['tempoh_pengajian']);
    $tempat_pengajian = trim($form['tempat_pengajian']);

    $kuota_raw = trim((string)$form['kuota']);
    $kuota = ($kuota_raw === '' ? null : (ctype_digit($kuota_raw) ? (int)$kuota_raw : null));

    $sedia_raw = trim((string)$form['jumlah_sedia_ada']);
    $semasa_raw = trim((string)$form['jumlah_peserta_semasa']);
    $baki_raw   = trim((string)$form['baki_jumlah_peserta']);
    $bekerja_raw= trim((string)$form['jumlah_peserta_bekerja']);
    $tarik_raw  = trim((string)$form['jumlah_peserta_tarik_diri']);

    $sedia   = (ctype_digit($sedia_raw) ? (int)$sedia_raw : null);
    $semasa  = (ctype_digit($semasa_raw) ? (int)$semasa_raw : null); // jumlah lapor diri tahun semasa
    $baki    = ($baki_raw === '' ? null : (ctype_digit($baki_raw) ? (int)$baki_raw : null));
    $bekerja = (ctype_digit($bekerja_raw) ? (int)$bekerja_raw : null);
    $tarik   = (ctype_digit($tarik_raw) ? (int)$tarik_raw : null);

    $peruntukan_rm = ($form['peruntukan_rm']==='' ? 0 : (is_numeric($form['peruntukan_rm']) ? (float)$form['peruntukan_rm'] : null));
    $peruntukan_semasa_rm = ($form['peruntukan_semasa_rm']==='' ? 0 : (is_numeric($form['peruntukan_semasa_rm']) ? (float)$form['peruntukan_semasa_rm'] : null));
    $perbelanjaan_rm = ($form['perbelanjaan_rm']==='' ? 0 : (is_numeric($form['perbelanjaan_rm']) ? (float)$form['perbelanjaan_rm'] : null));
    $baki_belanja_rm = ($form['baki_belanja_rm']==='' ? 0 : (is_numeric($form['baki_belanja_rm']) ? (float)$form['baki_belanja_rm'] : null));

    $status = $form['status'] ?? 'draft';
    if (!in_array($status, ['draft','aktif','selesai','batal'], true)) $status='draft';

    $catatan = trim($form['catatan']);

    $sku_raw = $form['sku_aktiviti_id'] ?? '';
    $sku_aktiviti_id = ($sku_raw === '' ? null : (ctype_digit($sku_raw) ? (int)$sku_raw : null));

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
        // SKU akan ambil jumlah_peserta_semasa = jumlah lapor diri tahun semasa sahaja
        $jumlahUntukSKU = $semasa;

        // baki = kuota - (jumlah sedia ada + jumlah lapor diri tahun semasa)
        $baki = max($kuota - ($sedia + $semasa), 0);

        $form['baki_jumlah_peserta'] = $baki;
        $semasa = $jumlahUntukSKU;
    } elseif (!$err && $baki_raw !== '' && $baki === null) {
        $err = "Baki peserta diperlukan mesti nombor.";
    }

    if (!$err && $peruntukan_semasa_rm !== null && $perbelanjaan_rm !== null) {
        $baki_belanja_rm = max($peruntukan_semasa_rm - $perbelanjaan_rm, 0);
        $form['baki_belanja_rm'] = $baki_belanja_rm;
    }

    if (!$err) {
        try {
            $pdo->beginTransaction();

            $stmt1 = $pdo->prepare("
                INSERT INTO program
                  (unit_id, sku_aktiviti_id, tahun, nama_program, nk_jkb, tarikh_mula, tarikh_tamat, tempoh_kontrak,
                   tempat, kerjasama_konsultan, bil_peserta,
                   peruntukan_rm, perbelanjaan_rm, dana_wakalah_rm, status, catatan)
                VALUES
                  (:unit_id, :sku_aktiviti_id, :tahun, :nama_program, :nk_jkb, :tarikh_mula, :tarikh_tamat, :tempoh_kontrak,
                   NULL, :kerjasama, :bil_peserta,
                   :peruntukan, :perbelanjaan, 0, :status, :catatan)
            ");
            $stmt1->execute([
                ':unit_id' => $ulk_id,
                ':sku_aktiviti_id' => $sku_aktiviti_id,
                ':tahun' => $tahun,
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
            ]);

            $newId = (int)$pdo->lastInsertId();

            $stmt2 = $pdo->prepare("
                INSERT INTO program_ulk_detail
                  (program_id, kuota, jumlah_sedia_ada, siri_batch, tarikh_masuk, tarikh_tamat_pengajian, tempoh_pengajian, tempat_pengajian,
                   tarikh_mula_lanjutan, tarikh_tamat_lanjutan,
                   jumlah_peserta_semasa, baki_jumlah_peserta, jumlah_peserta_bekerja, jumlah_peserta_tarik_diri,
                   peruntukan_semasa_rm, baki_belanja_rm)
                VALUES
                  (:program_id, :kuota, :jumlah_sedia_ada, :siri_batch, :tarikh_masuk, :tarikh_tamat_pengajian, :tempoh_pengajian, :tempat_pengajian,
                   :tarikh_mula_lanjutan, :tarikh_tamat_lanjutan,
                   :semasa, :baki, :bekerja, :tarik,
                   :peruntukan_semasa, :baki_belanja)
            ");
            $stmt2->execute([
                ':program_id' => $newId,
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

            header("Location: /bpa/ulk/program_list.php?msg=" . urlencode("Program berjaya ditambah."));
            exit;

        } catch (Throwable $e) {
            $pdo->rollBack();
            $err = "Gagal simpan: " . $e->getMessage();
        }
    }

    $stmtSku->execute([':tahun' => $tahun]);
    $skuList = $stmtSku->fetchAll(PDO::FETCH_ASSOC);
}
?>
<!DOCTYPE html>
<html lang="ms">
<head>
  <meta charset="UTF-8">
  <title>Tambah Program ULK</title>
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
      <h4 class="fw-bold mb-0">Tambah Program ULK</h4>
      <small class="text-muted">Masukkan program + maklumat kemasukan ULK</small>
    </div>
    <div>
      <a href="/bpa/ulk/dashboard.php" class="btn btn-outline-secondary">Dashboard</a>
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

        <div class="col-12">
          <h6 class="fw-bold mb-0">Tarikh Kontrak Asal</h6>
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

        <div class="col-md-4">
          <label class="form-label">Tempoh Kontrak (optional)</label>
          <input type="text" name="tempoh_kontrak" class="form-control"
                 placeholder="Contoh: 3 tahun / 6 bulan"
                 value="<?= htmlspecialchars($form['tempoh_kontrak']) ?>">
        </div>

        <div class="col-12">
          <h6 class="fw-bold mb-0">Tarikh Perlanjutan </h6>
        </div>

        <div class="col-md-3">
          <label class="form-label">Tarikh Mula Lanjutan</label>
          <input type="date" name="tarikh_mula_lanjutan" class="form-control"
                 value="<?= htmlspecialchars($form['tarikh_mula_lanjutan']) ?>">
        </div>

        <div class="col-md-3">
          <label class="form-label">Tarikh Tamat Lanjutan</label>
          <input type="date" name="tarikh_tamat_lanjutan" class="form-control"
                 value="<?= htmlspecialchars($form['tarikh_tamat_lanjutan']) ?>">
        </div>

        <div class="w-100"></div>

        <div class="col-md-4">
  <label class="form-label">Tempoh Pengajian</label>
  <input type="text" name="tempoh_pengajian" class="form-control"
         placeholder="Contoh: 6 bulan / 3 bulan"
         value="<?= htmlspecialchars($form['tempoh_pengajian']) ?>">
</div>

<div class="col-md-4">
  <label class="form-label">Tempat Pengajian</label>
  <input type="text" name="tempat_pengajian" class="form-control"
         value="<?= htmlspecialchars($form['tempat_pengajian']) ?>">
</div>

<div class="col-md-4">
  <label class="form-label">Kerjasama / Konsultan</label>
  <input type="text" name="kerjasama_konsultan" class="form-control"
         value="<?= htmlspecialchars($form['kerjasama_konsultan']) ?>">
</div>
        <p>

        <hr class="mt-2">

        <div class="col-12">
          <h6 class="fw-bold mb-0">Maklumat Kemasukan</h6>
        </div>

        <div class="col-md-3">
          <label class="form-label">Siri / Batch</label>
          <input type="text" name="siri_batch" class="form-control"
                 placeholder="Contoh: Batch 1 / Siri 2"
                 value="<?= htmlspecialchars($form['siri_batch']) ?>">
        </div>

        <div class="col-md-3">
  <label class="form-label">Tarikh Masuk</label>
  <input type="date" name="tarikh_masuk" class="form-control"
         value="<?= htmlspecialchars($form['tarikh_masuk']) ?>">
</div>

<div class="col-md-3">
  <label class="form-label">Tarikh Tamat</label>
  <input type="date" name="tarikh_tamat_pengajian" class="form-control"
         value="<?= htmlspecialchars($form['tarikh_tamat_pengajian']) ?>">
</div>

        <div class="col-md-2">
          <label class="form-label">Kuota</label>
          <input type="number" name="kuota" class="form-control" min="0"
                 value="<?= htmlspecialchars($form['kuota']) ?>">
        </div>

        <div class="col-md-2">
          <label class="form-label">Jumlah Sedia Ada</label>
          <input type="number" name="jumlah_sedia_ada" class="form-control" min="0"
                 value="<?= htmlspecialchars($form['jumlah_sedia_ada']) ?>">
        </div>

        <div class="col-md-3">
          <label class="form-label">Jumlah Lapor Diri Tahun Semasa</label>
          <input type="number" name="jumlah_peserta_semasa" class="form-control" min="0"
                 value="<?= htmlspecialchars($form['jumlah_peserta_semasa']) ?>">
          <small class="text-muted">Nilai ini akan dikira dalam SKU.</small>
        </div>

        <div class="col-md-2">
          <label class="form-label">Baki Peserta Diperlukan</label>
          <input type="number" name="baki_jumlah_peserta" class="form-control" min="0"
                 value="<?= htmlspecialchars($form['baki_jumlah_peserta']) ?>" readonly>
          <small class="text-muted">Kuota - (sedia ada + lapor diri).</small>
        </div>

        <div class="col-md-3">
          <label class="form-label">Jumlah Peserta Bekerja</label>
          <input type="number" name="jumlah_peserta_bekerja" class="form-control" min="0"
                 value="<?= htmlspecialchars($form['jumlah_peserta_bekerja']) ?>">
        </div>

        <div class="col-md-3">
          <label class="form-label">Jumlah Peserta Tarik Diri</label>
          <input type="number" name="jumlah_peserta_tarik_diri" class="form-control" min="0"
                 value="<?= htmlspecialchars($form['jumlah_peserta_tarik_diri']) ?>">
        </div>

        <p>

        <hr class="mt-2">

        <div class="col-12">
          <h6 class="fw-bold mb-0">Peruntukan & Perbelanjaan</h6>
        </div>

        <div class="col-md-3">
          <label class="form-label">Peruntukan Kontrak (RM)</label>
          <input type="number" step="0.01" name="peruntukan_rm" class="form-control"
                 value="<?= htmlspecialchars($form['peruntukan_rm']) ?>">
        </div>

        <div class="col-md-3">
          <label class="form-label">Peruntukan Semasa (RM)</label>
          <input type="number" step="0.01" name="peruntukan_semasa_rm" class="form-control"
                 value="<?= htmlspecialchars($form['peruntukan_semasa_rm']) ?>">
        </div>

        <div class="col-md-3">
          <label class="form-label">Perbelanjaan (RM)</label>
          <input type="number" step="0.01" name="perbelanjaan_rm" class="form-control"
                 value="<?= htmlspecialchars($form['perbelanjaan_rm']) ?>">
        </div>

        <div class="col-md-3">
          <label class="form-label">Baki Belanja (RM)</label>
          <input type="number" step="0.01" name="baki_belanja_rm" class="form-control"
                 value="<?= htmlspecialchars($form['baki_belanja_rm']) ?>" readonly>
          <small class="text-muted">Auto kira peruntukan semasa - perbelanjaan.</small>
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

        <div class="col-md-3">
          <label class="form-label">Status</label>
          <select name="status" class="form-select">
            <?php foreach (['draft','aktif','selesai','batal'] as $s): ?>
              <option value="<?= $s ?>" <?= ($form['status']===$s?'selected':'') ?>><?= $s ?></option>
            <?php endforeach; ?>
          </select>
        </div>

        <div class="col-12">
          <label class="form-label">Catatan</label>
          <textarea name="catatan" class="form-control" rows="2"><?= htmlspecialchars($form['catatan']) ?></textarea>
        </div>

        <div class="col-12">
          <button class="btn btn-primary">Simpan Program</button>
          <a href="/bpa/ulk/program_list.php" class="btn btn-outline-secondary">📋 Senarai Program</a>
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