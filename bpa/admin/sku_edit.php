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
function getSkuCurrentValue(PDO $pdo, array $sku): ?float {
    $cara = $sku['cara_kira_pencapaian'] ?? 'COUNT_PROGRAM';
    $jenis = $sku['jenis_sasaran'] ?? 'BILANGAN';
    $manualValue = $sku['manual_semasa_nilai'] ?? null;
    if ($cara === 'MANUAL') {
        return $manualValue === null ? null : (float)$manualValue;
    }

    $isBudgetTarget = $jenis === 'PERATUS_BAJET';
    if ($isBudgetTarget || $cara === 'SUM_RM') {
        $aggregate = 'COALESCE(SUM(COALESCE(p.perbelanjaan_rm, 0)), 0)';
        $join = '';
    } elseif ($cara === 'SUM_PESERTA') {
        $aggregate = 'COALESCE(SUM(CASE WHEN p.unit_id = 4 THEN COALESCE(ud.jumlah_peserta_semasa, 0) ELSE COALESCE(p.bil_peserta, 0) END), 0)';
        $join = 'LEFT JOIN program_ulk_detail ud ON ud.program_id = p.program_id';
    } elseif ($cara === 'SUM_PESERTA_10K') {
        $aggregate = 'COALESCE(SUM(COALESCE(ud.jumlah_peserta_pendapatan_atas_10k, 0)), 0)';
        $join = 'LEFT JOIN program_upu_detail ud ON ud.program_id = p.program_id';
    } elseif ($cara === 'SUM_PESERTA_ZAKAT') {
        $aggregate = 'COALESCE(SUM(COALESCE(ud.jumlah_peserta_bayar_zakat, 0)), 0)';
        $join = 'LEFT JOIN program_upu_detail ud ON ud.program_id = p.program_id';
    } else {
        $aggregate = 'COUNT(*)';
        $join = '';
    }

    $scopeFilter = '';
    $params = [
        ':tahun' => (int)$sku['tahun'],
        ':bulan' => (int)date('n'),
    ];
    if ($isBudgetTarget) {
        if (($sku['scope_type'] ?? '') === 'UNIT') {
            $scopeFilter = ' AND p.unit_id = :unit_id';
            $params[':unit_id'] = (int)$sku['unit_id'];
        }
    } else {
        $scopeFilter = ' AND p.sku_aktiviti_id = :sku_id';
        $params[':sku_id'] = (int)$sku['sku_aktiviti_id'];
    }

    $stmt = $pdo->prepare("
        SELECT {$aggregate}
        FROM program p
        {$join}
        WHERE p.status = 'selesai'
          AND p.tahun = :tahun
          AND (p.tarikh_mula IS NULL OR MONTH(p.tarikh_mula) <= :bulan)
          {$scopeFilter}
    ");
    $stmt->execute($params);
    return (float)$stmt->fetchColumn();
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

if (!isset($sku['manual_semasa_nilai'])) {
    $sku['manual_semasa_nilai'] = null;
}
$skuCurrentValue = getSkuCurrentValue($pdo, $sku);
$isBudgetTarget = ($sku['jenis_sasaran'] ?? '') === 'PERATUS_BAJET';

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

    $nama_aktiviti = trim($_POST['nama_aktiviti'] ?? '');

    $sasaran_nilai = clean_number_nullable($_POST['sasaran_nilai'] ?? '');
    $sasaran_unit  = trim($_POST['sasaran_unit'] ?? '');
    $sasaran_unit_position = ($_POST['sasaran_unit_position'] ?? '') === 'prefix' ? 'prefix' : 'suffix';

    $anggaran_akhir_tahun = clean_money_nullable($_POST['anggaran_akhir_tahun'] ?? '');
    $catatan = trim($_POST['catatan'] ?? '');
    $manual_semasa_nilai = clean_number_nullable($_POST['manual_semasa_nilai'] ?? '');

    // ===== VALIDATION =====
    if ($nama_aktiviti === '') {
        $err = "Aktiviti (SKU) wajib diisi.";
    } elseif ($scope_type === 'UNIT' && $unit_id === null) {
        $err = "Jika scope = UNIT, sila pilih unit.";
    } elseif ($sasaran_nilai === null || $sasaran_nilai < 0) {
        $err = "Sasaran wajib nombor (contoh 250 atau 85 atau 90).";
    } elseif ($manual_semasa_nilai === null || $manual_semasa_nilai < 0) {
        $err = "Nilai Semasa wajib nombor dan tidak boleh negatif.";
    } elseif ($anggaran_akhir_tahun !== null && $anggaran_akhir_tahun < 0) {
        $err = "Anggaran akhir tahun tak boleh negatif.";
    }

    if (!$err) {
        if ($sasaran_unit === '' || $sasaran_unit === '%') $sasaran_unit = 'program';
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
                  nama_aktiviti = :nama_aktiviti,
                  jenis_sasaran = 'BILANGAN',
                  sasaran_nilai = :sasaran_nilai,
                  sasaran_unit = :sasaran_unit,
                  sasaran_unit_position = :sasaran_unit_position,
                  anggaran_akhir_tahun = :anggaran,
                  catatan = :catatan,
                  cara_kira_pencapaian = 'MANUAL',
                  manual_semasa_nilai = :manual_semasa
                WHERE sku_aktiviti_id = :id
            ");
            $stmt->execute([
                ':tahun' => $tahun,
                ':scope_type' => $scope_type,
                ':unit_id' => $unit_id,
                ':nama_aktiviti' => $nama_aktiviti,
                ':sasaran_nilai' => $sasaran_nilai,
                ':sasaran_unit' => $sasaran_unit,
                ':sasaran_unit_position' => $sasaran_unit_position,
                ':anggaran' => $anggaran_akhir_tahun,
                ':catatan' => ($catatan === '' ? null : $catatan),
                ':manual_semasa' => $manual_semasa_nilai,
                ':id' => $sku_id,
            ]);
            record_bapim_action(
                $pdo,
                'sku_update',
                'SKU',
                $nama_aktiviti,
                (string)($sku['nama_aktiviti'] ?? ''),
                [
                    'scope_type' => $scope_type,
                    'unit_id' => $unit_id,
                    'bil' => $sku['bil'] ?? '',
                    'year' => $tahun,
                ]
            );

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
            if (!isset($sku['manual_semasa_nilai'])) {
                $sku['manual_semasa_nilai'] = null;
            }
            $skuCurrentValue = getSkuCurrentValue($pdo, $sku);
            $isBudgetTarget = ($sku['jenis_sasaran'] ?? '') === 'PERATUS_BAJET';

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
    <form id="bpa-sku-edit-form" method="post" class="row g-3 bpa-sku-add-form">

        <div class="col-md-2">
          <label class="form-label" for="skuYear">Tahun</label>
          <input type="number" name="tahun" id="skuYear" class="form-control" min="2000" max="2100"
                 value="<?= htmlspecialchars($sku['tahun'] ?? date('Y')) ?>" required>
        </div>

        <div class="col-md-5">
          <label class="form-label" for="scope_type">SKU untuk</label>
          <select name="scope_type" id="scope_type" class="form-select" required>
            <option value="BPA"  <?= (($sku['scope_type'] ?? '')==='BPA')?'selected':'' ?>>BPA (Keseluruhan Bahagian)</option>
            <option value="UNIT" <?= (($sku['scope_type'] ?? '')==='UNIT')?'selected':'' ?>>UNIT (UPK/UPU/UPA/ULK)</option>
          </select>
        </div>

        <div class="col-md-5" id="unitWrap">
          <label class="form-label" for="unit_id">Unit</label>
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

        <div class="col-12">
          <label class="form-label" for="activityName">Aktiviti / KPI</label>
          <textarea name="nama_aktiviti" id="activityName" class="form-control" rows="4" required
            placeholder="Masukkan aktiviti atau KPI..."><?= htmlspecialchars($sku['nama_aktiviti'] ?? '') ?></textarea>
        </div>

        <div class="col-md-6">
          <label class="form-label" for="targetValue">Sasaran</label>
          <input type="text" name="sasaran_nilai" id="targetValue" class="form-control" inputmode="decimal" required
                 placeholder="Contoh: 250"
                 value="<?= htmlspecialchars($_POST['sasaran_nilai'] ?? ($isBudgetTarget ? ($sku['sasaran_rm'] ?? '') : ($sku['sasaran_nilai'] ?? ''))) ?>">
        </div>

        <div class="col-md-6" id="unitSasaranWrap">
          <div class="sku-unit-position-row">
            <label class="form-label mb-0" for="sasaran_unit">Unit Sasaran</label>
            <?php $unitPosition = $_POST['sasaran_unit_position'] ?? ($sku['sasaran_unit_position'] ?? 'suffix'); ?>
            <input type="hidden" name="sasaran_unit_position" id="sasaranUnitPosition"
                   value="<?= $unitPosition === 'prefix' ? 'prefix' : 'suffix' ?>">
            <button type="button" class="sku-unit-position-toggle<?= $unitPosition === 'prefix' ? ' is-prefix' : '' ?>"
                    id="sasaranUnitPositionToggle"
                    aria-label="Kedudukan unit: <?= $unitPosition === 'prefix' ? 'hadapan' : 'belakang' ?>"
                    aria-pressed="<?= $unitPosition === 'prefix' ? 'true' : 'false' ?>">
              <span class="sku-unit-position-text" aria-live="polite"><?= $unitPosition === 'prefix' ? 'Hadapan' : 'Belakang' ?></span>
              <span class="sku-unit-position-track" aria-hidden="true"><span></span></span>
            </button>
          </div>
          <input type="text" name="sasaran_unit" id="sasaran_unit" class="form-control" required
                 placeholder="program / peserta / keluarga"
                 value="<?= htmlspecialchars($_POST['sasaran_unit'] ?? ($isBudgetTarget ? 'RM' : ($sku['sasaran_unit'] ?? ''))) ?>">
        </div>

        <div class="col-md-6">
          <label class="form-label" for="manualValue">Nilai Semasa</label>
          <input type="number" name="manual_semasa_nilai" id="manualValue" class="form-control"
                 min="0" step="any" inputmode="decimal" required
                 value="<?= htmlspecialchars($_POST['manual_semasa_nilai'] ?? $skuCurrentValue ?? '') ?>">
        </div>

        <div class="col-md-6">
          <label class="form-label" for="yearEstimate">Anggaran Akhir Tahun</label>
          <input type="text" name="anggaran_akhir_tahun" id="yearEstimate" class="form-control"
                 inputmode="decimal" placeholder="Isi anggaran hujung tahun"
                 value="<?= htmlspecialchars($sku['anggaran_akhir_tahun'] ?? '') ?>">
        </div>

        <div class="col-12">
          <label class="form-label" for="skuNotes">Catatan</label>
          <textarea name="catatan" id="skuNotes" class="form-control" rows="4"
                    placeholder="Catatan tambahan..."><?= htmlspecialchars($sku['catatan'] ?? '') ?></textarea>
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
