<?php
require_once __DIR__ . '/../init.php';
require_admin();

$name = htmlspecialchars($_SESSION['user']['user_nama'] ?? 'Admin');

// dropdown unit
$units = $pdo->query("SELECT unit_id, nama_unit FROM unit ORDER BY nama_unit")->fetchAll(PDO::FETCH_ASSOC);

$err = '';
$ok  = '';

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

if ($_SERVER['REQUEST_METHOD'] === 'POST') {

    $tahun = (int)($_POST['tahun'] ?? date('Y'));
    if ($tahun < 2000 || $tahun > 2100) $tahun = (int)date('Y');

    $scope_type = $_POST['scope_type'] ?? 'BPA';
    if (!in_array($scope_type, ['BPA','UNIT'], true)) $scope_type = 'BPA';

    // unit_id: wajib bila scope=UNIT, NULL bila BPA
    $unit_id = null;
    if ($scope_type === 'UNIT') {
        $unit_id_raw = $_POST['unit_id'] ?? '';
        $unit_id = (ctype_digit($unit_id_raw)) ? (int)$unit_id_raw : null;
    }

    // Bil = nombor susunan dalam sheet
    $bil_raw = trim($_POST['bil'] ?? '');
    $bil = ctype_digit($bil_raw) ? (int)$bil_raw : 0;

    $nama_aktiviti = trim($_POST['nama_aktiviti'] ?? '');

    // Peruntukan (paparan sahaja) optional
    $peruntukan_paparan_rm = clean_money_nullable($_POST['peruntukan_paparan_rm'] ?? '');

    // Jenis sasaran: 3 pilihan
    $jenis_sasaran = $_POST['jenis_sasaran'] ?? 'BILANGAN';
    if (!in_array($jenis_sasaran, ['BILANGAN','PERATUS_PENYERTAAN','PERATUS_BAJET'], true)) {
        $jenis_sasaran = 'BILANGAN';
    }

    // sasaran nilai
    $sasaran_nilai = clean_number_nullable($_POST['sasaran_nilai'] ?? '');

    // sasaran unit (AUTO kalau kosong)
    $sasaran_unit = trim($_POST['sasaran_unit'] ?? '');
    if ($sasaran_unit === '') {
        if ($jenis_sasaran === 'BILANGAN') $sasaran_unit = 'bilangan';
        else $sasaran_unit = '%';
    }

    // optional: sasaran RM (guna untuk PERATUS_BAJET kalau nak paparkan RM target)
    $sasaran_rm = clean_money_nullable($_POST['sasaran_rm'] ?? '');

    // optional: anggaran akhir tahun
    $anggaran_akhir_tahun = clean_money_nullable($_POST['anggaran_akhir_tahun'] ?? '');

    // optional: untuk kes ayat "85% (85 keluarga) daripada 100 keluarga"
    $sasaran_bilangan_sebenar = clean_number_nullable($_POST['sasaran_bilangan_sebenar'] ?? '');
    $sasaran_total_asal = clean_number_nullable($_POST['sasaran_total_asal'] ?? '');
    $sasaran_total_unit = trim($_POST['sasaran_total_unit'] ?? '');

    // ====== NEW: CARA KIRA PENCAPAIAN ======
    $cara_kira = $_POST['cara_kira_pencapaian'] ?? 'COUNT_PROGRAM';
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

    $catatan = trim($_POST['catatan'] ?? '');

    // ===== VALIDATION (ringkas & logik) =====
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
        $err = "Jika Cara Kira = MANUAL, sila isi Nilai Semasa (manual) (tak boleh negatif).";
    }

    // AUTO unit for peratus
    if (!$err) {
        if ($jenis_sasaran !== 'BILANGAN') {
            // peratus mesti unit %
            $sasaran_unit = '%';
        }
    }

    // gabung info tambahan ke catatan supaya tak hilang context
    if (!$err) {
        $extra = [];
        if ($jenis_sasaran === 'PERATUS_PENYERTAAN') {
            if ($sasaran_bilangan_sebenar !== null) {
                $extra[] = "Bilangan sebenar: " . $sasaran_bilangan_sebenar;
            }
            if ($sasaran_total_asal !== null) {
                $unitTxt = ($sasaran_total_unit !== '') ? " " . $sasaran_total_unit : "";
                $extra[] = "Daripada: " . $sasaran_total_asal . $unitTxt;
            }
        }
        if ($extra) {
            $catatan = trim(($catatan ? $catatan . " | " : "") . implode(" | ", $extra));
        }
    }

    // ===== INSERT =====
    if (!$err) {
        try {
            $stmt = $pdo->prepare("
                INSERT INTO sku_aktiviti
                (tahun, scope_type, unit_id, bil, nama_aktiviti,
                 peruntukan_paparan_rm, jenis_sasaran, sasaran_nilai, sasaran_unit,
                 sasaran_rm, anggaran_akhir_tahun, catatan,
                 cara_kira_pencapaian, manual_semasa_nilai)
                VALUES
                (:tahun, :scope_type, :unit_id, :bil, :nama_aktiviti,
                 :peruntukan, :jenis_sasaran, :sasaran_nilai, :sasaran_unit,
                 :sasaran_rm, :anggaran_akhir_tahun, :catatan,
                 :cara_kira, :manual_semasa)
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
                ':anggaran_akhir_tahun' => $anggaran_akhir_tahun,
                ':catatan' => ($catatan === '' ? null : $catatan),
                ':cara_kira' => $cara_kira,
                ':manual_semasa' => ($cara_kira === 'MANUAL' ? $manual_semasa_nilai : null),
            ]);

            if (($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '') === 'XMLHttpRequest') {
                header('Content-Type: application/json; charset=utf-8');
                echo json_encode(['success' => true, 'message' => 'SKU berjaya ditambah.']);
                exit;
            }

            $ok = "SKU berjaya ditambah.";
            $_POST = [];

        } catch (Throwable $e) {
            $err = "Gagal tambah SKU: " . $e->getMessage();
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
  <title>Tambah SKU</title>
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


<div class="container mt-4 bpa-sku-add-page" data-bpa-modal-subtitle="Ringkas & mudah untuk pegawai isi (ikut ayat dalam sheet)">

  <?php if ($err): ?><div class="alert alert-danger"><?= htmlspecialchars($err) ?></div><?php endif; ?>
  <?php if ($ok): ?><div class="alert alert-success"><?= htmlspecialchars($ok) ?></div><?php endif; ?>

  <div class="row g-3 bpa-sku-modal-layout">
    <div class="col-lg-8 bpa-sku-form-window">

          <div class="section-title bpa-sku-section-title">
            <i class="bi bi-check-circle-fill" aria-hidden="true"></i>
            <span>Maklumat Wajib</span>
          </div>

          <form id="bpa-sku-add-form" method="post" class="row g-3 bpa-sku-add-form">

            <div class="col-md-2">
              <label class="form-label">Tahun</label>
              <input type="number" name="tahun" class="form-control" min="2000" max="2100"
                     value="<?= htmlspecialchars($_POST['tahun'] ?? date('Y')) ?>" required>
            </div>

            <div class="col-md-4">
              <label class="form-label">SKU untuk</label>
              <?php $sc = $_POST['scope_type'] ?? 'BPA'; ?>
              <select name="scope_type" id="scope_type" class="form-select" required>
                <option value="BPA" <?= $sc==='BPA'?'selected':'' ?>>BPA (Keseluruhan Bahagian)</option>
                <option value="UNIT" <?= $sc==='UNIT'?'selected':'' ?>>UNIT (UPK/UPU/UPA/ULK)</option>
              </select>
              <div class="hint">Pilih UNIT jika SKU memang KPI khas unit.</div>
            </div>

            <div class="col-md-3" id="unitWrap">
              <label class="form-label">Unit</label>
              <select name="unit_id" id="unit_id" class="form-select">
                <option value="">-- Pilih Unit --</option>
                <?php foreach ($units as $un): ?>
                  <option value="<?= (int)$un['unit_id'] ?>" <?= ((string)($un['unit_id']) === (string)($_POST['unit_id'] ?? '')) ? 'selected' : '' ?>>
                    <?= htmlspecialchars($un['nama_unit']) ?>
                  </option>
                <?php endforeach; ?>
              </select>
            </div>

            <div class="col-md-3">
              <label class="form-label">Bil (nombor dalam sheet)</label>
              <input type="number" name="bil" class="form-control" min="1" required
                     placeholder="Contoh: 1"
                     value="<?= htmlspecialchars($_POST['bil'] ?? '') ?>">
            </div>

            <div class="col-12">
              <label class="form-label">Aktiviti / KPI (ayat dalam sheet SKU)</label>
              <textarea name="nama_aktiviti" class="form-control" rows="4" required
                placeholder="Copy paste ayat SKU..."><?= htmlspecialchars($_POST['nama_aktiviti'] ?? '') ?></textarea>
            </div>

            <div class="col-md-5">
              <label class="form-label">Jenis Sasaran</label>
              <?php $js = $_POST['jenis_sasaran'] ?? 'BILANGAN'; ?>
              <select name="jenis_sasaran" id="jenis_sasaran" class="form-select" required>
                <option value="BILANGAN" <?= $js==='BILANGAN'?'selected':'' ?>>Bilangan (peserta / keluarga / program)</option>
                <option value="PERATUS_PENYERTAAN" <?= $js==='PERATUS_PENYERTAAN'?'selected':'' ?>>Peratus Penyertaan (%)</option>
                <option value="PERATUS_BAJET" <?= $js==='PERATUS_BAJET'?'selected':'' ?>>Peratus Bajet (%)</option>
              </select>
              <div class="hint" id="jenisHint"></div>
            </div>

            <div class="col-md-4">
              <label class="form-label">Sasaran</label>
              <input type="text" name="sasaran_nilai" id="sasaran_nilai" class="form-control" required
                     placeholder="Contoh: 250 / 85 / 90"
                     value="<?= htmlspecialchars($_POST['sasaran_nilai'] ?? '') ?>">
              <div class="hint" id="sasaranHint"></div>
            </div>

            <div class="col-md-3" id="unitSasaranWrap">
              <label class="form-label">Unit Sasaran</label>
              <input type="text" name="sasaran_unit" id="sasaran_unit" class="form-control"
                     placeholder="peserta / keluarga / program"
                     value="<?= htmlspecialchars($_POST['sasaran_unit'] ?? '') ?>">
              <div class="hint">Untuk Bilangan sahaja. Kalau peratus, sistem auto jadi “%”.</div>
            </div>

            <!-- ✅ NEW: Cara Kira Pencapaian -->
            <div class="col-md-6">
              <label class="form-label">Cara Kira Pencapaian</label>
              <?php $ck = $_POST['cara_kira_pencapaian'] ?? 'COUNT_PROGRAM'; ?>
              <select name="cara_kira_pencapaian" id="cara_kira_pencapaian" class="form-select" required>
              <option value="COUNT_PROGRAM" <?= $ck==='COUNT_PROGRAM'?'selected':'' ?>>Bilangan Program</option>
              <option value="SUM_PESERTA" <?= $ck==='SUM_PESERTA'?'selected':'' ?>>Jumlah Peserta</option>
              <option value="SUM_PESERTA_10K" <?= $ck==='SUM_PESERTA_10K'?'selected':'' ?>>Jumlah Peserta Pendapatan RM10K dan Ke Atas</option>
              <option value="SUM_PESERTA_ZAKAT" <?= $ck==='SUM_PESERTA_ZAKAT'?'selected':'' ?>>Jumlah Peserta Bayar Zakat</option>
              <option value="SUM_RM" <?= $ck==='SUM_RM'?'selected':'' ?>>Jumlah Perbelanjaan (RM)</option>
              <option value="MANUAL" <?= $ck==='MANUAL'?'selected':'' ?>>Isi Manual</option>
              </select>
              <div class="hint" id="kiraanHint"></div>
            </div>

            <div class="col-md-6" id="manualWrap">
              <label class="form-label">Nilai Semasa (Manual)</label>
              <input type="text" name="manual_semasa_nilai" id="manual_semasa_nilai" class="form-control"
                     placeholder="Contoh: 12 (atau 12.5)"
                     value="<?= htmlspecialchars($_POST['manual_semasa_nilai'] ?? '') ?>">
              <div class="hint">Muncul bila Cara Kira = MANUAL.</div>
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
                     value="<?= htmlspecialchars($_POST['peruntukan_paparan_rm'] ?? '') ?>">
              <div class="hint">Untuk paparan SKU sahaja (bukan wajib).</div>
            </div>

            <div class="col-md-4" id="sasaranRmWrap">
              <label class="form-label">Sasaran RM (jika Peratus Bajet)</label>
              <input type="text" name="sasaran_rm" class="form-control"
                     placeholder="Contoh: 39,476,520"
                     value="<?= htmlspecialchars($_POST['sasaran_rm'] ?? '') ?>">
            </div>

            <div class="col-md-4">
              <label class="form-label">Anggaran Akhir Tahun</label>
              <input type="text" name="anggaran_akhir_tahun" class="form-control"
                     placeholder="Isi hujung tahun"
                     value="<?= htmlspecialchars($_POST['anggaran_akhir_tahun'] ?? '') ?>">
            </div>

            <div class="col-12" id="penyertaanWrap">
              <div class="section-title">📌 Jika “Peratus Penyertaan” (contoh 85% (85 keluarga) daripada 100 keluarga)</div>
              <div class="row g-3">
                <div class="col-md-4">
                  <label class="form-label">Bilangan sebenar (contoh: 85)</label>
                  <input type="text" name="sasaran_bilangan_sebenar" class="form-control"
                         placeholder="Contoh: 85"
                         value="<?= htmlspecialchars($_POST['sasaran_bilangan_sebenar'] ?? '') ?>">
                </div>
                <div class="col-md-4">
                  <label class="form-label">Daripada (contoh: 100)</label>
                  <input type="text" name="sasaran_total_asal" class="form-control"
                         placeholder="Contoh: 100"
                         value="<?= htmlspecialchars($_POST['sasaran_total_asal'] ?? '') ?>">
                </div>
                <div class="col-md-4">
                  <label class="form-label">Unit (contoh: keluarga)</label>
                  <input type="text" name="sasaran_total_unit" class="form-control"
                         placeholder="Contoh: keluarga"
                         value="<?= htmlspecialchars($_POST['sasaran_total_unit'] ?? '') ?>">
                </div>
                <div class="col-12">
                  <div class="hint">Info ini akan disimpan dalam <b>Catatan</b> supaya konteks ayat SKU kekal.</div>
                </div>
              </div>
            </div>

            <div class="col-12">
  <label class="form-label">Catatan</label>
  <textarea name="catatan" class="form-control" rows="5"
            placeholder="Contoh:
PERINGKAT ASAS
1. Kursus Pengurusan Kewangan

PERINGKAT PEMBANGUNAN
1. Seminar Jom Halal"><?= htmlspecialchars($_POST['catatan'] ?? '') ?></textarea>
</div>

          </form>

    </div>

    <div class="col-lg-4 bpa-sku-example-window">
          <div class="bpa-sku-example-header">
            <div class="bpa-sku-example-heading">
              <h2>Contoh SKU</h2>
              <p>Rujukan ringkas untuk mengisi maklumat SKU</p>
            </div>
            <button type="button" class="bpa-sku-example-close" aria-label="Tutup contoh">
              &times;
            </button>
          </div>

          <div class="bpa-sku-example-body">
          <div class="mb-3">
            <div class="fw-bold">1) “8 program”</div>
            <div class="hint">
              Jenis: Bilangan<br>
              Sasaran: 8<br>
              Unit sasaran: program<br>
              Cara kira: <b>Bilangan Program</b>
            </div>

          </div>

          <div class="mb-3">
            <div class="fw-bold">2) “250 peserta”</div>
            <div class="hint">
              Jenis: Bilangan<br>
              Sasaran: 250<br>
              Unit sasaran: peserta<br>
              Cara kira: <b>Jumlah Peserta</b>
            </div>
          </div>

          <div class="mb-3">
            <div class="fw-bold">3) “85% (85 keluarga) daripada 100 keluarga”</div>
            <div class="hint">
              Jenis: Peratus Penyertaan<br>
              Sasaran: 85%<br>
              Cara kira: <b>Jumlah Peserta</b><br>
              Optional isi 85 & 100 keluarga
            </div>
          </div>

          <div class="mb-0">
            <div class="fw-bold">4) “Membelanjakan 90% peruntukan”</div>
            <div class="hint">
              Jenis: Peratus Bajet<br>
              Sasaran: 90%<br>
              Cara kira: <b>Jumlah RM</b><br>
              Optional letak sasaran RM utk paparan
            </div>
          </div>
          </div>

    </div>

  </div>

  <div class="bpa-sku-modal-footer">
    <button type="submit" form="bpa-sku-add-form" class="budget-list-action budget-list-action--primary bpa-budget-save-button">
      <span class="budget-list-action-icon"><i class="bi bi-check-lg" aria-hidden="true"></i></span>
      <span>Tambah</span>
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

  function suggestCaraKira(){
    const jenis = jenisEl.value;
    const u = (sasaranUnitEl.value || '').toLowerCase().trim();

    // suggest default ikut jenis sasaran
    if (jenis === 'PERATUS_BAJET') {
      if (kiraanEl.value === 'COUNT_PROGRAM' || kiraanEl.value === 'SUM_PESERTA') {
        kiraanEl.value = 'SUM_RM';
      }
      kiraanHint.innerHTML = "Cadangan: guna <b>Jumlah RM</b> untuk kira penggunaan bajet.";
      return;
    }

    if (jenis === 'PERATUS_PENYERTAAN') {
      if (kiraanEl.value === 'COUNT_PROGRAM' || kiraanEl.value === 'SUM_RM') {
        kiraanEl.value = 'SUM_PESERTA';
      }
      kiraanHint.innerHTML = "Cadangan: guna <b>Jumlah Peserta</b> (atau bilangan keluarga).";
      return;
    }

    // BILANGAN
    if (u.includes('program')) {
      kiraanEl.value = 'COUNT_PROGRAM';
      kiraanHint.innerHTML = "Unit sasaran = program → cadangan <b>Bilangan Program</b>.";
    } else if (u.includes('peserta') || u.includes('keluarga') || u.includes('usahawan')) {
      kiraanEl.value = 'SUM_PESERTA';
      kiraanHint.innerHTML = "Unit sasaran = peserta/keluarga → cadangan <b>Jumlah Peserta</b>.";
    } else {
      kiraanHint.innerHTML = "Pilih cara kira ikut KPI (program/peserta/RM/manual).";
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

  function toggleJenis(){
    const v = jenisEl.value;

    if (v === 'BILANGAN') {
      unitSasaranWrap.style.display = 'block';
      if (sasaranUnitEl.value.trim() === '' || sasaranUnitEl.value.trim() === '%') {
        sasaranUnitEl.value = 'program'; // default lebih “masuk akal” dari bilangan
      }
      jenisHint.innerHTML = "Gunakan bila sasaran berbentuk kuantiti (peserta/keluarga/program).";
      sasaranHint.innerHTML = "Contoh: 8 atau 250";
      sasaranRmWrap.style.display = 'none';
      penyertaanWrap.style.display = 'none';

      const sasaranRm = document.querySelector('input[name="sasaran_rm"]');
      if (sasaranRm) sasaranRm.value = '';

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

    // selepas tukar jenis, auto cadang cara kira
    suggestCaraKira();
    toggleManual();
  }

  scopeEl.addEventListener('change', toggleScope);
  jenisEl.addEventListener('change', toggleJenis);
  sasaranUnitEl.addEventListener('input', () => { suggestCaraKira(); toggleManual(); });
  kiraanEl.addEventListener('change', toggleManual);

  toggleScope();
  toggleJenis();   // akan auto suggest cara kira sekali
  toggleManual();
</script>

<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>
