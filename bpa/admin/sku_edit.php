<?php
require_once __DIR__ . '/../init.php';
require_admin();

$name = htmlspecialchars($_SESSION['user']['user_nama'] ?? 'Admin');

// dropdown unit
$units = $pdo->query("SELECT unit_id, nama_unit FROM unit ORDER BY nama_unit")->fetchAll(PDO::FETCH_ASSOC);

function clean_money_nullable($v) {
    $v = trim((string)$v);
    if ($v === '') return null;
    $v = str_replace(',', '', $v);
    return is_numeric($v) ? (float)$v : null;
}
function clean_number_nullable($v) {
    $v = trim((string)$v);
    if ($v === '') return null;
    $v = str_replace(',', '', $v);
    return is_numeric($v) ? (float)$v : null;
}

$id = $_GET['id'] ?? '';
if (!ctype_digit($id)) {
    header("Location: /bpa/admin/sku_list.php?msg=" . urlencode("ID SKU tidak sah."));
    exit;
}
$sku_id = (int)$id;

$err = '';
$ok  = '';

// Load SKU
$stmt = $pdo->prepare("
    SELECT s.*, u.nama_unit
    FROM sku_aktiviti s
    LEFT JOIN unit u ON u.unit_id = s.unit_id
    WHERE s.sku_aktiviti_id = ?
    LIMIT 1
");
$stmt->execute([$sku_id]);
$sku = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$sku) {
    header("Location: /bpa/admin/sku_list.php?msg=" . urlencode("SKU tidak dijumpai."));
    exit;
}

// Default for new columns if old record belum ada
if (!isset($sku['cara_kira_pencapaian']) || $sku['cara_kira_pencapaian'] === '' || $sku['cara_kira_pencapaian'] === null) {
    $sku['cara_kira_pencapaian'] = 'COUNT_PROGRAM';
}
if (!isset($sku['manual_semasa_nilai'])) {
    $sku['manual_semasa_nilai'] = null;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {

    $tahun = (int)($_POST['tahun'] ?? $sku['tahun'] ?? date('Y'));
    if ($tahun < 2000 || $tahun > 2100) $tahun = (int)($sku['tahun'] ?? date('Y'));

    $scope_type = $_POST['scope_type'] ?? ($sku['scope_type'] ?? 'BPA');
    if (!in_array($scope_type, ['BPA','UNIT'], true)) $scope_type = 'BPA';

    $unit_id = null;
    if ($scope_type === 'UNIT') {
        $unit_id_raw = $_POST['unit_id'] ?? '';
        $unit_id = (ctype_digit($unit_id_raw)) ? (int)$unit_id_raw : null;
    }

    $bil_raw = trim($_POST['bil'] ?? '');
    $bil = ctype_digit($bil_raw) ? (int)$bil_raw : 0;

    $nama_aktiviti = trim($_POST['nama_aktiviti'] ?? '');

    $peruntukan_paparan_rm = clean_money_nullable($_POST['peruntukan_paparan_rm'] ?? '');

    $jenis_sasaran = $_POST['jenis_sasaran'] ?? ($sku['jenis_sasaran'] ?? 'BILANGAN');
    if (!in_array($jenis_sasaran, ['BILANGAN','PERATUS_PENYERTAAN','PERATUS_BAJET'], true)) {
        $jenis_sasaran = 'BILANGAN';
    }

    $sasaran_nilai = clean_number_nullable($_POST['sasaran_nilai'] ?? '');
    $sasaran_unit  = trim($_POST['sasaran_unit'] ?? '');

    $sasaran_rm = clean_money_nullable($_POST['sasaran_rm'] ?? '');
    $anggaran_akhir_tahun = clean_money_nullable($_POST['anggaran_akhir_tahun'] ?? '');
    $catatan = trim($_POST['catatan'] ?? '');

    // extra info untuk PERATUS_PENYERTAAN (kita simpan dalam catatan)
    $sasaran_bilangan_sebenar = clean_number_nullable($_POST['sasaran_bilangan_sebenar'] ?? '');
    $sasaran_total_asal = clean_number_nullable($_POST['sasaran_total_asal'] ?? '');
    $sasaran_total_unit = trim($_POST['sasaran_total_unit'] ?? '');

    // ===== NEW: CARA KIRA PENCAPAIAN =====
    $cara_kira = $_POST['cara_kira_pencapaian'] ?? ($sku['cara_kira_pencapaian'] ?? 'COUNT_PROGRAM');
    $allowedCara = [
      'COUNT_PROGRAM',
      'SUM_PESERTA',
      'SUM_PESERTA_10K',
      'SUM_PESERTA_ZAKAT',
      'SUM_RM',
      'MANUAL'
  ];
    if (!in_array($cara_kira, $allowedCara, true)) $cara_kira = 'COUNT_PROGRAM';

    $manual_semasa_nilai = clean_number_nullable($_POST['manual_semasa_nilai'] ?? '');

    // ===== VALIDATION =====
    if ($bil <= 0) {
        $err = "Bil wajib diisi (mula dari 1).";
    } elseif ($nama_aktiviti === '') {
        $err = "Aktiviti (SKU) wajib diisi.";
    } elseif ($scope_type === 'UNIT' && $unit_id === null) {
        $err = "Jika scope = UNIT, sila pilih unit.";
    } elseif ($sasaran_nilai === null || $sasaran_nilai < 0) {
        $err = "Sasaran wajib nombor (contoh 250 atau 85 atau 90).";
    } elseif (($jenis_sasaran === 'PERATUS_PENYERTAAN' || $jenis_sasaran === 'PERATUS_BAJET') && $sasaran_nilai > 100) {
        $err = "Jika jenis sasaran = peratus (%), sasaran mesti 0 hingga 100.";
    } elseif ($peruntukan_paparan_rm !== null && $peruntukan_paparan_rm < 0) {
        $err = "Peruntukan paparan tak boleh negatif.";
    } elseif ($sasaran_rm !== null && $sasaran_rm < 0) {
        $err = "Sasaran RM tak boleh negatif.";
    } elseif ($anggaran_akhir_tahun !== null && $anggaran_akhir_tahun < 0) {
        $err = "Anggaran akhir tahun tak boleh negatif.";
    } elseif ($cara_kira === 'MANUAL' && ($manual_semasa_nilai === null || $manual_semasa_nilai < 0)) {
        $err = "Jika Cara Kira = MANUAL, sila isi Jumlah Semasa Manual (tak boleh negatif).";
    }

    // AUTO unit for peratus
    if (!$err) {
        if ($sasaran_unit === '') {
            if ($jenis_sasaran === 'BILANGAN') $sasaran_unit = 'program';
            else $sasaran_unit = '%';
        }
        if ($jenis_sasaran !== 'BILANGAN') {
            $sasaran_unit = '%';
        }
    }

    // gabung info tambahan ke catatan supaya tak hilang context
    if (!$err) {
        $extra = [];
        if ($jenis_sasaran === 'PERATUS_PENYERTAAN') {
            if ($sasaran_bilangan_sebenar !== null) $extra[] = "Bilangan sebenar: " . $sasaran_bilangan_sebenar;
            if ($sasaran_total_asal !== null) {
                $unitTxt = ($sasaran_total_unit !== '') ? " " . $sasaran_total_unit : "";
                $extra[] = "Daripada: " . $sasaran_total_asal . $unitTxt;
            }
        }
        if ($extra) {
            $catatan = trim(($catatan ? $catatan . " | " : "") . implode(" | ", $extra));
        }
    }

    // ===== UPDATE =====
    if (!$err) {
        try {
            $stmt = $pdo->prepare("
                UPDATE sku_aktiviti
                SET
                  tahun = :tahun,
                  scope_type = :scope_type,
                  unit_id = :unit_id,
                  bil = :bil,
                  nama_aktiviti = :nama_aktiviti,
                  peruntukan_paparan_rm = :peruntukan,
                  jenis_sasaran = :jenis_sasaran,
                  sasaran_nilai = :sasaran_nilai,
                  sasaran_unit = :sasaran_unit,
                  sasaran_rm = :sasaran_rm,
                  anggaran_akhir_tahun = :anggaran,
                  catatan = :catatan,
                  cara_kira_pencapaian = :cara_kira,
                  manual_semasa_nilai = :manual_semasa
                WHERE sku_aktiviti_id = :id
            ");
            $stmt->execute([
                ':tahun' => $tahun,
                ':scope_type' => $scope_type,
                ':unit_id' => $unit_id,
                ':bil' => $bil,
                ':nama_aktiviti' => $nama_aktiviti,
                ':peruntukan' => $peruntukan_paparan_rm,
                ':jenis_sasaran' => $jenis_sasaran,
                ':sasaran_nilai' => $sasaran_nilai,
                ':sasaran_unit' => $sasaran_unit,
                ':sasaran_rm' => $sasaran_rm,
                ':anggaran' => $anggaran_akhir_tahun,
                ':catatan' => ($catatan === '' ? null : $catatan),
                ':cara_kira' => $cara_kira,
                ':manual_semasa' => ($cara_kira === 'MANUAL' ? $manual_semasa_nilai : null),
                ':id' => $sku_id,
            ]);

            if (($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '') === 'XMLHttpRequest') {
                header('Content-Type: application/json; charset=utf-8');
                echo json_encode(['success' => true, 'message' => 'SKU berjaya dikemaskini.']);
                exit;
            }

            $ok = "SKU berjaya dikemaskini.";

            // reload
            $stmt = $pdo->prepare("
                SELECT s.*, u.nama_unit
                FROM sku_aktiviti s
                LEFT JOIN unit u ON u.unit_id = s.unit_id
                WHERE s.sku_aktiviti_id = ?
                LIMIT 1
            ");
            $stmt->execute([$sku_id]);
            $sku = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!isset($sku['cara_kira_pencapaian']) || $sku['cara_kira_pencapaian'] === '' || $sku['cara_kira_pencapaian'] === null) {
                $sku['cara_kira_pencapaian'] = 'COUNT_PROGRAM';
            }
            if (!isset($sku['manual_semasa_nilai'])) {
                $sku['manual_semasa_nilai'] = null;
            }

        } catch (Throwable $e) {
            $err = "Gagal kemaskini SKU: " . $e->getMessage();
        }
    }
}

if (
    $_SERVER['REQUEST_METHOD'] === 'POST' &&
    ($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '') === 'XMLHttpRequest' &&
    $err !== ''
) {
    http_response_code(400);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['success' => false, 'message' => $err]);
    exit;
}
?>
<!DOCTYPE html>
<html lang="ms">
<head>
  <meta charset="UTF-8">
  <title>Edit SKU</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
  <style>
    body { background:#f4f6f8; padding-top:70px; }
    .offcanvas { width:290px; }
    .hint { font-size:12px; color:#6c757d; }
    .section-title { font-weight:700; font-size:14px; margin-bottom:8px; }
  </style>
</head>
<body>

<?php include __DIR__ . '/sidebar.php'; ?>


<div class="container mt-4 bpa-sku-edit-page bpa-sku-add-page"
     data-bpa-modal-subtitle="Kemaskini rekod SKU (ID: <?= (int)$sku_id ?>)">
  <?php if ($err): ?><div class="alert alert-danger"><?= htmlspecialchars($err) ?></div><?php endif; ?>
  <?php if ($ok): ?><div class="alert alert-success"><?= htmlspecialchars($ok) ?></div><?php endif; ?>

  <div class="bpa-sku-form-window bpa-sku-edit-form-window">
    <div class="section-title bpa-sku-section-title">
      <i class="bi bi-check-circle-fill" aria-hidden="true"></i>
      <span>Maklumat Wajib</span>
    </div>
    <form id="bpa-sku-edit-form" method="post" class="row g-3 bpa-sku-add-form">

        <div class="col-md-2">
          <label class="form-label">Tahun</label>
          <input type="number" name="tahun" class="form-control" min="2000" max="2100"
                 value="<?= htmlspecialchars($sku['tahun'] ?? date('Y')) ?>" required>
        </div>

        <div class="col-md-4">
          <label class="form-label">SKU untuk</label>
          <select name="scope_type" id="scope_type" class="form-select" required>
            <option value="BPA"  <?= (($sku['scope_type'] ?? '')==='BPA')?'selected':'' ?>>BPA (Keseluruhan Bahagian)</option>
            <option value="UNIT" <?= (($sku['scope_type'] ?? '')==='UNIT')?'selected':'' ?>>UNIT (UPK/UPU/UPA/ULK)</option>
          </select>
          <div class="hint">Pilih UNIT jika KPI khas unit.</div>
        </div>

        <div class="col-md-3" id="unitWrap">
          <label class="form-label">Unit</label>
          <select name="unit_id" id="unit_id" class="form-select">
            <option value="">-- Pilih Unit --</option>
            <?php foreach ($units as $un): ?>
              <option value="<?= (int)$un['unit_id'] ?>"
                <?= ((string)($sku['unit_id'] ?? '') === (string)$un['unit_id']) ? 'selected' : '' ?>>
                <?= htmlspecialchars($un['nama_unit']) ?>
              </option>
            <?php endforeach; ?>
          </select>
        </div>

        <div class="col-md-3">
          <label class="form-label">Bil (nombor dalam sheet)</label>
          <input type="number" name="bil" class="form-control" min="1" required
                 value="<?= htmlspecialchars($sku['bil'] ?? '') ?>">
        </div>

        <div class="col-12">
          <label class="form-label">Aktiviti / KPI (ayat dalam sheet SKU)</label>
          <textarea name="nama_aktiviti" class="form-control" rows="4" required><?= htmlspecialchars($sku['nama_aktiviti'] ?? '') ?></textarea>
        </div>

        <div class="col-md-5">
          <label class="form-label">Jenis Sasaran</label>
          <select name="jenis_sasaran" id="jenis_sasaran" class="form-select" required>
            <option value="BILANGAN" <?= (($sku['jenis_sasaran'] ?? '')==='BILANGAN')?'selected':'' ?>>Bilangan (peserta / keluarga / program)</option>
            <option value="PERATUS_PENYERTAAN" <?= (($sku['jenis_sasaran'] ?? '')==='PERATUS_PENYERTAAN')?'selected':'' ?>>Peratus Penyertaan (%)</option>
            <option value="PERATUS_BAJET" <?= (($sku['jenis_sasaran'] ?? '')==='PERATUS_BAJET')?'selected':'' ?>>Peratus Bajet (%)</option>
          </select>
          <div class="hint" id="jenisHint"></div>
        </div>

        <div class="col-md-4">
          <label class="form-label">Sasaran</label>
          <input type="text" name="sasaran_nilai" id="sasaran_nilai" class="form-control" required
                 value="<?= htmlspecialchars($sku['sasaran_nilai'] ?? '') ?>">
          <div class="hint" id="sasaranHint"></div>
        </div>

        <div class="col-md-3" id="unitSasaranWrap">
          <label class="form-label">Unit Sasaran</label>
          <input type="text" name="sasaran_unit" id="sasaran_unit" class="form-control"
                 value="<?= htmlspecialchars($sku['sasaran_unit'] ?? '') ?>">
          <div class="hint">Untuk Bilangan sahaja. Kalau peratus, sistem auto jadi “%”.</div>
        </div>

        <!-- ✅ NEW: Cara Kira -->
        <div class="col-md-6">
          <label class="form-label">Cara Kira Pencapaian</label>
          <select name="cara_kira_pencapaian" id="cara_kira_pencapaian" class="form-select" required>
          <option value="COUNT_PROGRAM" <?= (($sku['cara_kira_pencapaian'] ?? '')==='COUNT_PROGRAM')?'selected':'' ?>>Bilangan Program</option>
          <option value="SUM_PESERTA" <?= (($sku['cara_kira_pencapaian'] ?? '')==='SUM_PESERTA')?'selected':'' ?>>Jumlah Peserta</option>
          <option value="SUM_PESERTA_10K" <?= (($sku['cara_kira_pencapaian'] ?? '')==='SUM_PESERTA_10K')?'selected':'' ?>>Jumlah Peserta Pendapatan RM10K dan Ke Atas</option>
          <option value="SUM_PESERTA_ZAKAT" <?= (($sku['cara_kira_pencapaian'] ?? '')==='SUM_PESERTA_ZAKAT')?'selected':'' ?>>Jumlah Peserta Bayar Zakat</option>
          <option value="SUM_RM" <?= (($sku['cara_kira_pencapaian'] ?? '')==='SUM_RM')?'selected':'' ?>>Jumlah Perbelanjaan (RM)</option>
          <option value="MANUAL" <?= (($sku['cara_kira_pencapaian'] ?? '')==='MANUAL')?'selected':'' ?>>Isi Manual</option>
          </select>
          <div class="hint" id="kiraanHint"></div>
        </div>

        <div class="col-md-6" id="manualWrap">
  <label class="form-label">Jumlah Semasa Manual</label>
  <input type="text" name="manual_semasa_nilai" id="manual_semasa_nilai" class="form-control"
         placeholder="Contoh: 40000"
         value="<?= htmlspecialchars($sku['manual_semasa_nilai'] ?? '') ?>">
  <div class="hint">
    Jika SKU peratus bajet, isi jumlah RM. Pencapaian (%) akan dikira automatik berdasarkan Sasaran RM.
  </div>
</div>

        <div class="col-12 bpa-sku-section-divider"><hr></div>
        <div class="col-12 bpa-sku-optional-heading">
          <div class="section-title bpa-sku-section-title bpa-sku-section-title--optional">
            <i class="bi bi-sliders2" aria-hidden="true"></i>
            <span>Maklumat Optional</span>
            <small>Boleh isi kemudian</small>
          </div>
        </div>

        <div class="col-md-4">
          <label class="form-label">Peruntukan Paparan (RM)</label>
          <input type="text" name="peruntukan_paparan_rm" class="form-control"
                 placeholder="Contoh: 1,616,150"
                 value="<?= htmlspecialchars($sku['peruntukan_paparan_rm'] ?? '') ?>">
          <div class="hint">Untuk paparan SKU sahaja (bukan wajib).</div>
        </div>

        <div class="col-md-4" id="sasaranRmWrap">
          <label class="form-label">Sasaran RM (jika Peratus Bajet)</label>
          <input type="text" name="sasaran_rm" class="form-control"
                 placeholder="Contoh: 39,476,520"
                 value="<?= htmlspecialchars($sku['sasaran_rm'] ?? '') ?>">
        </div>

        <div class="col-md-4">
          <label class="form-label">Anggaran Akhir Tahun</label>
          <input type="text" name="anggaran_akhir_tahun" class="form-control"
                 placeholder="Isi hujung tahun"
                 value="<?= htmlspecialchars($sku['anggaran_akhir_tahun'] ?? '') ?>">
        </div>

        <div class="col-12" id="penyertaanWrap">
          <div class="section-title">📌 Jika “Peratus Penyertaan” (contoh 85% (85 keluarga) daripada 100 keluarga)</div>
          <div class="row g-3">
            <div class="col-md-4">
              <label class="form-label">Bilangan sebenar (contoh: 85)</label>
              <input type="text" name="sasaran_bilangan_sebenar" class="form-control" placeholder="Contoh: 85">
            </div>
            <div class="col-md-4">
              <label class="form-label">Daripada (contoh: 100)</label>
              <input type="text" name="sasaran_total_asal" class="form-control" placeholder="Contoh: 100">
            </div>
            <div class="col-md-4">
              <label class="form-label">Unit (contoh: keluarga)</label>
              <input type="text" name="sasaran_total_unit" class="form-control" placeholder="Contoh: keluarga">
            </div>
            <div class="col-12">
              <div class="hint">Info ini akan ditambah dalam <b>Catatan</b> bila anda simpan.</div>
            </div>
          </div>
        </div>

        <div class="col-12">
  <label class="form-label">Catatan</label>

  <textarea name="catatan"
            class="form-control"
            rows="5"
            placeholder="Contoh:

PERINGKAT ASAS
1. Kursus Pengurusan Kewangan kepada Usahawan MAIWP

PERINGKAT PEMBANGUNAN
1. Seminar Jom Halal kepada Usahawan MAIWP

PERINGKAT PERKEMBANGAN
1. Program Pembekalan Makanan Berbungkus"><?= htmlspecialchars($sku['catatan'] ?? '') ?></textarea>

  <div class="hint">
    Boleh tekan Enter untuk turun baris baru.
  </div>
</div>

    </form>
  </div>

  <div class="bpa-sku-modal-footer">
    <button type="submit" form="bpa-sku-edit-form"
            class="budget-list-action budget-list-action--primary bpa-budget-save-button">
      <span class="budget-list-action-icon"><i class="bi bi-check-lg" aria-hidden="true"></i></span>
      <span>Simpan</span>
    </button>
  </div>
</div>

<script>
  const scopeEl = document.getElementById('scope_type');
  const unitWrap = document.getElementById('unitWrap');
  const unitEl = document.getElementById('unit_id');

  const jenisEl = document.getElementById('jenis_sasaran');
  const sasaranUnitEl = document.getElementById('sasaran_unit');
  const unitSasaranWrap = document.getElementById('unitSasaranWrap');

  const jenisHint = document.getElementById('jenisHint');
  const sasaranHint = document.getElementById('sasaranHint');

  const sasaranRmWrap = document.getElementById('sasaranRmWrap');
  const penyertaanWrap = document.getElementById('penyertaanWrap');

  const kiraanEl = document.getElementById('cara_kira_pencapaian');
  const kiraanHint = document.getElementById('kiraanHint');
  const manualWrap = document.getElementById('manualWrap');
  const manualInput = document.getElementById('manual_semasa_nilai');

  function toggleScope(){
    if(scopeEl.value === 'UNIT'){
      unitWrap.style.display = 'block';
      unitEl.disabled = false;
    } else {
      unitWrap.style.display = 'none';
      unitEl.disabled = true;
      unitEl.value = '';
    }
  }

  function toggleManual(){
    if (kiraanEl.value === 'MANUAL') {
      manualWrap.style.display = 'block';
    } else {
      manualWrap.style.display = 'none';
      if (manualInput) manualInput.value = '';
    }
  }

  function suggestCaraKira(){
    const jenis = jenisEl.value;
    const u = (sasaranUnitEl.value || '').toLowerCase().trim();

    if (jenis === 'PERATUS_BAJET') {
      kiraanHint.innerHTML = "Cadangan: guna <b>Jumlah RM</b> untuk kira penggunaan bajet.";
      return;
    }

    if (jenis === 'PERATUS_PENYERTAAN') {
      kiraanHint.innerHTML = "Cadangan: guna <b>Jumlah Peserta</b> (atau bilangan keluarga).";
      return;
    }

    // BILANGAN
    if (u.includes('program')) {
      kiraanHint.innerHTML = "Unit sasaran = program → sesuai <b>Bilangan Program</b>.";
    } else if (u.includes('peserta') || u.includes('keluarga') || u.includes('usahawan') || u.includes('permohonan')) {
      kiraanHint.innerHTML = "Unit sasaran = peserta/keluarga → sesuai <b>Jumlah Peserta</b> (atau bilangan item).";
    } else {
      kiraanHint.innerHTML = "Pilih cara kira ikut KPI (program/peserta/RM/manual).";
    }
  }

  function toggleJenis(){
    const v = jenisEl.value;

    if (v === 'BILANGAN') {
      unitSasaranWrap.style.display = 'block';
      if (sasaranUnitEl.value.trim() === '' || sasaranUnitEl.value.trim() === '%') {
        sasaranUnitEl.value = 'program';
      }
      jenisHint.innerHTML = "Gunakan bila sasaran berbentuk kuantiti (peserta/keluarga/program).";
      sasaranHint.innerHTML = "Contoh: 8 atau 250";
      sasaranRmWrap.style.display = 'none';
      penyertaanWrap.style.display = 'none';

    } else if (v === 'PERATUS_PENYERTAAN') {
      unitSasaranWrap.style.display = 'none';
      sasaranUnitEl.value = '%';
      jenisHint.innerHTML = "Gunakan bila ayat SKU ada % penyertaan (contoh 85% keluarga).";
      sasaranHint.innerHTML = "Isi 0 hingga 100. Contoh: 85";
      sasaranRmWrap.style.display = 'none';
      penyertaanWrap.style.display = 'block';

      const sasaranRm = document.querySelector('input[name="sasaran_rm"]');
      if (sasaranRm) sasaranRm.value = '';

    } else if (v === 'PERATUS_BAJET') {
      unitSasaranWrap.style.display = 'none';
      sasaranUnitEl.value = '%';
      jenisHint.innerHTML = "Gunakan bila KPI berkaitan % penggunaan peruntukan bajet (contoh 90%).";
      sasaranHint.innerHTML = "Isi 0 hingga 100. Contoh: 90";
      sasaranRmWrap.style.display = 'block';
      penyertaanWrap.style.display = 'none';
    }

    suggestCaraKira();
    toggleManual();
  }

  scopeEl.addEventListener('change', toggleScope);
  jenisEl.addEventListener('change', toggleJenis);
  kiraanEl.addEventListener('change', toggleManual);
  sasaranUnitEl.addEventListener('input', suggestCaraKira);

  toggleScope();
  toggleJenis();
  toggleManual();
</script>

<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>
