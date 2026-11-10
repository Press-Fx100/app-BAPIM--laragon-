<?php
require_once __DIR__ . '/../init.php';
require_login();

$name = htmlspecialchars($_SESSION['user']['user_nama'] ?? 'User');
$role = $_SESSION['user']['role'] ?? '';
$unit_id_session = $_SESSION['user']['unit_id'] ?? null;

$stmtU = $pdo->prepare("SELECT unit_id FROM unit WHERE nama_unit='UPU' LIMIT 1");
$stmtU->execute();
$upu = $stmtU->fetch(PDO::FETCH_ASSOC);
if (!$upu) die("Unit UPU belum wujud.");
$upu_id = (int)$upu['unit_id'];

$id = $_GET['id'] ?? '';
if (!ctype_digit($id)) { header("Location: program_list.php"); exit; }
$program_id = (int)$id;

$stmt = $pdo->prepare("
  SELECT p.*,
         s.bil AS sku_bil, s.nama_aktiviti,
         d.kuota, d.sektor_perniagaan_peserta,
         d.jumlah_peserta_pendapatan_bawah_10k,
         d.jumlah_peserta_pendapatan_atas_10k,
         d.jumlah_peserta_bayar_zakat
  FROM program p
  LEFT JOIN sku_aktiviti s ON s.sku_aktiviti_id = p.sku_aktiviti_id
  LEFT JOIN program_upu_detail d ON d.program_id = p.program_id
  WHERE p.program_id = ? AND p.unit_id = ?
  LIMIT 1
");
$stmt->execute([$program_id, $upu_id]);
$program = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$program) {
  header("Location: program_list.php?msg=" . urlencode("Program tidak dijumpai."));
  exit;
}

function fmtMoney($v){ return number_format((float)$v,2); }

function fmtTarikhTempoh($m,$t,$temp){
  if ($m && $t) return date('d/m/Y',strtotime($m))." - ".date('d/m/Y',strtotime($t));
  if ($m && $temp) return date('d/m/Y',strtotime($m))." (Tempoh: $temp)";
  if ($temp) return "Tempoh: $temp";
  if ($m) return date('d/m/Y',strtotime($m));
  return "-";
}
?>
<!DOCTYPE html>
<html lang="ms">
<head>
<meta charset="UTF-8">
<title>Detail Program UPU</title>

<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">

<style>
  body{
    background:#f4f6f8;
    padding-top:70px;
  }

  .label{
    font-weight:600;
    color:#555;
  }
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

<div class="d-flex justify-content-between mb-3">
  <div>
    <h4 class="fw-bold mb-0">Detail Program UPU</h4>
    <small class="text-muted">Paparan penuh maklumat program</small>
  </div>

  <div>
    <a href="program_list.php" class="btn btn-outline-dark">⬅ Senarai</a>

    <?php if (isset($bpaCanEdit) ? $bpaCanEdit : $role !== 'staff'): ?>
      <a href="program_edit.php?id=<?= $program_id ?>" class="btn btn-primary">✏ Edit</a>
    <?php endif; ?>
  </div>
</div>

<div class="card shadow-sm border-0">
 <div class="card-body">

  <h5 class="mb-3"><?= htmlspecialchars($program['nama_program']) ?></h5>

  <div class="row mb-2">
    <div class="col-md-4">
      <span class="label">Status:</span>
      <?= htmlspecialchars($program['status']) ?>
    </div>

    <div class="col-md-4">
      <span class="label">Tahun:</span>
      <?= (int)$program['tahun'] ?>
    </div>

    <div class="col-md-4">
      <span class="label">NK / JKB:</span>
      <?= htmlspecialchars($program['nk_jkb'] ?? '-') ?>
    </div>
  </div>

  <hr>

  <div class="row mb-2">

    <div class="col-md-6">
      <span class="label">Tarikh / Tempoh:</span><br>

      <?= htmlspecialchars(
            fmtTarikhTempoh(
              $program['tarikh_mula'],
              $program['tarikh_tamat'],
              $program['tempoh_kontrak']
            )
          ) ?>
    </div>

    <div class="col-md-6">
      <span class="label">SKU:</span><br>

      <?php if (!empty($program['sku_bil'])): ?>

        [<?= (int)$program['sku_bil'] ?>]
        <?= htmlspecialchars($program['nama_aktiviti']) ?>

      <?php else: ?>

        <span class="text-muted">Luar SKU</span>

      <?php endif; ?>
    </div>

  </div>

  <hr>

  <div class="row mb-2">

    <div class="col-md-6">
      <span class="label">Tempat:</span><br>
      <?= htmlspecialchars($program['tempat'] ?? '-') ?>
    </div>

    <div class="col-md-6">
      <span class="label">Kerjasama / Konsultan:</span><br>
      <?= htmlspecialchars($program['kerjasama_konsultan'] ?? '-') ?>
    </div>

  </div>

  <hr>

  <h6 class="fw-bold">Maklumat Peserta (UPU)</h6>

  <div class="row mb-2">

    <div class="col-md-3">
      <span class="label">Kuota:</span><br>
      <?= htmlspecialchars($program['kuota'] ?? '-') ?>
    </div>

    <div class="col-md-3">
      <span class="label">Bil Peserta:</span><br>
      <?= htmlspecialchars($program['bil_peserta'] ?? '-') ?>
    </div>

    <div class="col-md-3">
      <span class="label">Pendapatan bawah 10K:</span><br>
      <?= (int)($program['jumlah_peserta_pendapatan_bawah_10k'] ?? 0) ?>
    </div>

    <div class="col-md-3">
      <span class="label">Pendapatan 10K dan Ke Atas:</span><br>
      <?= (int)($program['jumlah_peserta_pendapatan_atas_10k'] ?? 0) ?>
    </div>

  </div>

  <div class="row mb-3">

    <div class="col-md-3">
      <span class="label">Peserta Bayar Zakat:</span><br>
      <?= (int)($program['jumlah_peserta_bayar_zakat'] ?? 0) ?>
    </div>

  </div>

  <div class="mb-3">
    <span class="label">Sektor Perniagaan Peserta:</span><br>

    <div class="border rounded p-2 bg-light">
      <?= nl2br(htmlspecialchars($program['sektor_perniagaan_peserta'] ?? '-')) ?>
    </div>
  </div>

  <hr>

  <h6 class="fw-bold">Kewangan</h6>

  <div class="row mb-2">

    <div class="col-md-4">
      <span class="label">Peruntukan:</span><br>
      RM <?= fmtMoney($program['peruntukan_rm']) ?>
    </div>

    <div class="col-md-4">
      <span class="label">Perbelanjaan:</span><br>
      RM <?= fmtMoney($program['perbelanjaan_rm']) ?>
    </div>

    <div class="col-md-4">
      <span class="label">Dana Wakalah:</span><br>
      RM <?= fmtMoney($program['dana_wakalah_rm']) ?>
    </div>

  </div>

  <hr>

  <div>
    <span class="label">Catatan:</span><br>

    <div class="border rounded p-2 bg-light">
      <?= nl2br(htmlspecialchars($program['catatan'] ?? '-')) ?>
    </div>
  </div>

 </div>
</div>

</div>

<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>