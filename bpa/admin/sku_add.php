<?php
require_once __DIR__ . '/../init.php';
require_login();
$canManageSku = isset($bpaCanEdit)
    ? (bool)$bpaCanEdit
    : (strtolower((string)($_SESSION['user']['role'] ?? '')) === 'admin'
        || (int)($_SESSION['user']['access_level'] ?? 0) <= 1);
if (!$canManageSku) {
    http_response_code(403);
    exit('Anda tidak mempunyai kebenaran untuk mengurus SKU.');
}

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

    $nama_aktiviti = trim($_POST['nama_aktiviti'] ?? '');

    $peruntukan_paparan_rm = null;
    $jenis_sasaran = 'BILANGAN';
    $sasaran_nilai = clean_number_nullable($_POST['sasaran_nilai'] ?? '');
    $sasaran_unit = trim($_POST['sasaran_unit'] ?? '');
    $sasaran_unit_position = ($_POST['sasaran_unit_position'] ?? '') === 'prefix' ? 'prefix' : 'suffix';
    if ($sasaran_unit === '' || $sasaran_unit === '%') {
        $sasaran_unit = 'program';
    }
    $sasaran_rm = null;
    $anggaran_akhir_tahun = clean_money_nullable($_POST['anggaran_akhir_tahun'] ?? '');
    $cara_kira = 'MANUAL';
    $manual_semasa_nilai = clean_number_nullable($_POST['manual_semasa_nilai'] ?? '');
    $catatan = trim($_POST['catatan'] ?? '');

    if ($nama_aktiviti === '') {
        $err = "Aktiviti (SKU) wajib diisi.";
    } elseif ($scope_type === 'UNIT' && $unit_id === null) {
        $err = "Jika scope = UNIT, sila pilih unit.";
    } elseif ($sasaran_nilai === null || $sasaran_nilai < 0) {
        $err = "Sasaran wajib nombor dan tidak boleh negatif.";
    } elseif ($manual_semasa_nilai === null || $manual_semasa_nilai < 0) {
        $err = "Nilai Semasa wajib nombor dan tidak boleh negatif.";
    } elseif ($anggaran_akhir_tahun !== null && $anggaran_akhir_tahun < 0) {
        $err = "Anggaran akhir tahun tak boleh negatif.";
    }

    // ===== INSERT =====
    if (!$err) {
        try {
            $bilSql = "SELECT COALESCE(MAX(bil), 0) + 1
                       FROM sku_aktiviti
                       WHERE tahun = :tahun AND scope_type = :scope_type";
            if ($scope_type === 'UNIT') {
                $bilSql .= " AND unit_id = :unit_id";
            } else {
                $bilSql .= " AND unit_id IS NULL";
            }
            $bilStatement = $pdo->prepare($bilSql);
            $bilStatement->bindValue(':tahun', $tahun, PDO::PARAM_INT);
            $bilStatement->bindValue(':scope_type', $scope_type, PDO::PARAM_STR);
            if ($scope_type === 'UNIT') {
                $bilStatement->bindValue(':unit_id', $unit_id, PDO::PARAM_INT);
            }
            $bilStatement->execute();
            $bil = (int)$bilStatement->fetchColumn();

            $stmt = $pdo->prepare("
                INSERT INTO sku_aktiviti
                (tahun, scope_type, unit_id, bil, nama_aktiviti,
                 peruntukan_paparan_rm, jenis_sasaran, sasaran_nilai, sasaran_unit, sasaran_unit_position,
                 sasaran_rm, anggaran_akhir_tahun, catatan,
                 cara_kira_pencapaian, manual_semasa_nilai)
                VALUES
                (:tahun, :scope_type, :unit_id, :bil, :nama_aktiviti,
                 :peruntukan, :jenis_sasaran, :sasaran_nilai, :sasaran_unit, :sasaran_unit_position,
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
                ':sasaran_unit_position' => $sasaran_unit_position,
                ':sasaran_rm' => $sasaran_rm,
                ':anggaran_akhir_tahun' => $anggaran_akhir_tahun,
                ':catatan' => ($catatan === '' ? null : $catatan),
                ':cara_kira' => $cara_kira,
                ':manual_semasa' => ($cara_kira === 'MANUAL' ? $manual_semasa_nilai : null),
            ]);
            record_bapim_action($pdo, 'sku_add', 'SKU', $nama_aktiviti, null, [
                'scope_type' => $scope_type,
                'unit_id' => $unit_id,
                'bil' => $bil,
                'year' => $tahun,
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
    <div class="col-12 bpa-sku-form-window">
      <form id="bpa-sku-add-form" method="post" class="row g-3 bpa-sku-add-form">
        <div class="col-md-2">
          <label class="form-label" for="skuYear">Tahun</label>
          <input type="number" name="tahun" id="skuYear" class="form-control" min="2000" max="2100"
                 value="<?= htmlspecialchars($_POST['tahun'] ?? date('Y')) ?>" required>
        </div>

        <div class="col-md-5">
          <label class="form-label" for="scope_type">SKU untuk</label>
          <?php $sc = $_POST['scope_type'] ?? 'BPA'; ?>
          <select name="scope_type" id="scope_type" class="form-select" required>
            <option value="BPA" <?= $sc==='BPA'?'selected':'' ?>>BPA (Keseluruhan Bahagian)</option>
            <option value="UNIT" <?= $sc==='UNIT'?'selected':'' ?>>UNIT (UPK/UPU/UPA/ULK)</option>
          </select>
        </div>

        <div class="col-md-5" id="unitWrap">
          <label class="form-label" for="unit_id">Unit</label>
          <select name="unit_id" id="unit_id" class="form-select">
            <option value="">-- Pilih Unit --</option>
            <?php foreach ($units as $un): ?>
              <option value="<?= (int)$un['unit_id'] ?>" <?= ((string)($un['unit_id']) === (string)($_POST['unit_id'] ?? '')) ? 'selected':'' ?>>
                <?= htmlspecialchars($un['nama_unit']) ?>
              </option>
            <?php endforeach; ?>
          </select>
        </div>

        <div class="col-12">
          <label class="form-label" for="activityName">Aktiviti / KPI</label>
          <textarea name="nama_aktiviti" id="activityName" class="form-control" rows="4" required
            placeholder="Masukkan aktiviti atau KPI..."><?= htmlspecialchars($_POST['nama_aktiviti'] ?? '') ?></textarea>
        </div>

        <div class="col-md-6">
          <label class="form-label" for="targetValue">Sasaran</label>
          <input type="text" name="sasaran_nilai" id="targetValue" class="form-control" inputmode="decimal" required
                 placeholder="Contoh: 250"
                 value="<?= htmlspecialchars($_POST['sasaran_nilai'] ?? '') ?>">
        </div>

        <div class="col-md-6" id="unitSasaranWrap">
          <div class="sku-unit-position-row">
            <label class="form-label mb-0" for="sasaran_unit">Unit Sasaran</label>
            <input type="hidden" name="sasaran_unit_position" id="sasaranUnitPosition"
                   value="<?= ($_POST['sasaran_unit_position'] ?? '') === 'prefix' ? 'prefix' : 'suffix' ?>">
            <button type="button" class="sku-unit-position-toggle<?= ($_POST['sasaran_unit_position'] ?? '') === 'prefix' ? ' is-prefix' : '' ?>"
                    id="sasaranUnitPositionToggle"
                    aria-label="Kedudukan unit: <?= ($_POST['sasaran_unit_position'] ?? '') === 'prefix' ? 'hadapan' : 'belakang' ?>"
                    aria-pressed="<?= ($_POST['sasaran_unit_position'] ?? '') === 'prefix' ? 'true' : 'false' ?>">
              <span class="sku-unit-position-text" aria-live="polite"><?= ($_POST['sasaran_unit_position'] ?? '') === 'prefix' ? 'Hadapan' : 'Belakang' ?></span>
              <span class="sku-unit-position-track" aria-hidden="true"><span></span></span>
            </button>
          </div>
          <input type="text" name="sasaran_unit" id="sasaran_unit" class="form-control" required
                 placeholder="program / peserta / keluarga"
                 value="<?= htmlspecialchars($_POST['sasaran_unit'] ?? 'program') ?>">
        </div>

        <div class="col-md-6">
          <label class="form-label" for="manualValue">Nilai Semasa</label>
          <input type="number" name="manual_semasa_nilai" id="manualValue" class="form-control"
                 min="0" step="any" inputmode="decimal" required
                 value="<?= htmlspecialchars($_POST['manual_semasa_nilai'] ?? '') ?>">
        </div>

        <div class="col-md-6">
          <label class="form-label" for="yearEstimate">Anggaran Akhir Tahun</label>
          <input type="text" name="anggaran_akhir_tahun" id="yearEstimate" class="form-control"
                 inputmode="decimal" placeholder="Isi anggaran hujung tahun"
                 value="<?= htmlspecialchars($_POST['anggaran_akhir_tahun'] ?? '') ?>">
        </div>

        <div class="col-12">
          <label class="form-label" for="skuNotes">Catatan</label>
          <textarea name="catatan" id="skuNotes" class="form-control" rows="4"
                    placeholder="Catatan tambahan..."><?= htmlspecialchars($_POST['catatan'] ?? '') ?></textarea>
        </div>
      </form>
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

  scopeEl.addEventListener('change', toggleScope);
  toggleScope();

  const unitPositionValue = document.getElementById('sasaranUnitPosition');
  const unitPositionToggle = document.getElementById('sasaranUnitPositionToggle');
  const unitPositionText = unitPositionToggle?.querySelector('.sku-unit-position-text');
  let unitPositionAnimation;
  unitPositionToggle?.addEventListener('click', () => {
    const isPrefix = unitPositionValue.value !== 'prefix';
    const text = isPrefix ? 'Hadapan' : 'Belakang';
    unitPositionValue.value = isPrefix ? 'prefix' : 'suffix';
    unitPositionToggle.classList.toggle('is-prefix', isPrefix);
    unitPositionToggle.classList.add('is-changing');
    unitPositionToggle.setAttribute('aria-pressed', isPrefix ? 'true' : 'false');
    unitPositionToggle.setAttribute('aria-label', 'Kedudukan unit: ' + text.toLowerCase());
    window.clearTimeout(unitPositionAnimation);
    unitPositionAnimation = window.setTimeout(() => {
      unitPositionText.textContent = text;
      unitPositionToggle.classList.remove('is-changing');
    }, 140);
  });
</script>

<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>
