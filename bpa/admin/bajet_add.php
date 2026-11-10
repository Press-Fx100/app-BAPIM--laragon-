<?php
require_once __DIR__ . '/../init.php';
require_admin();

$name = htmlspecialchars($_SESSION['user']['user_nama'] ?? 'Admin');

// dropdown unit
$units = $pdo->query("SELECT unit_id, nama_unit FROM unit ORDER BY nama_unit")->fetchAll(PDO::FETCH_ASSOC);

$err = '';
$ok  = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {

    $tahun = (int)($_POST['tahun'] ?? date('Y'));
    if ($tahun < 2000 || $tahun > 2100) $tahun = (int)date('Y');

    // unit_id kosong = BPA keseluruhan
    $unit_id_raw = $_POST['unit_id'] ?? '';
    $unit_id = ($unit_id_raw !== '' && ctype_digit($unit_id_raw)) ? (int)$unit_id_raw : null;

    $peruntukan_raw = trim($_POST['jumlah_peruntukan_rm'] ?? '');
    $jumlah_peruntukan_rm = is_numeric($peruntukan_raw) ? (float)$peruntukan_raw : null;

    $perbelanjaan_raw = trim($_POST['jumlah_perbelanjaan_rm'] ?? '');
    $jumlah_perbelanjaan_rm = ($perbelanjaan_raw === '' ? 0 : (is_numeric($perbelanjaan_raw) ? (float)$perbelanjaan_raw : null));

    $wakalah_raw = trim($_POST['jumlah_dana_wakalah_rm'] ?? '');
    $jumlah_dana_wakalah_rm = ($wakalah_raw === '' ? 0 : (is_numeric($wakalah_raw) ? (float)$wakalah_raw : null));

    $catatan = trim($_POST['catatan'] ?? '');

    // ===== VALIDATION =====
    if ($jumlah_peruntukan_rm === null || $jumlah_peruntukan_rm < 0) {
        $err = "Jumlah peruntukan wajib nombor (tak boleh negatif).";
    } elseif ($jumlah_perbelanjaan_rm === null || $jumlah_perbelanjaan_rm < 0) {
        $err = "Jumlah perbelanjaan mesti nombor (tak boleh negatif).";
    } elseif ($jumlah_dana_wakalah_rm === null || $jumlah_dana_wakalah_rm < 0) {
        $err = "Jumlah dana wakalah mesti nombor (tak boleh negatif).";
    }

    // prevent duplicate untuk BPA keseluruhan (unit_id IS NULL)
    if (!$err && $unit_id === null) {
        $stmtChk = $pdo->prepare("SELECT bajet_id FROM bajet WHERE tahun=:tahun AND unit_id IS NULL LIMIT 1");
        $stmtChk->execute([':tahun' => $tahun]);
        if ($stmtChk->fetch()) {
            $err = "Bajet BPA keseluruhan untuk tahun $tahun sudah wujud. Sila guna halaman Edit.";
        }
    }

    if (!$err) {
        try {
            $stmt = $pdo->prepare("
                INSERT INTO bajet
                (unit_id, tahun, jumlah_peruntukan_rm, jumlah_perbelanjaan_rm, jumlah_dana_wakalah_rm, catatan)
                VALUES
                (:unit_id, :tahun, :peruntukan, :perbelanjaan, :wakalah, :catatan)
            ");
            $stmt->execute([
                ':unit_id' => $unit_id, // boleh NULL (BPA)
                ':tahun' => $tahun,
                ':peruntukan' => $jumlah_peruntukan_rm,
                ':perbelanjaan' => $jumlah_perbelanjaan_rm,
                ':wakalah' => $jumlah_dana_wakalah_rm,
                ':catatan' => ($catatan === '' ? null : $catatan),
            ]);

            if (($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '') === 'XMLHttpRequest') {
                header('Content-Type: application/json; charset=utf-8');
                echo json_encode(['success' => true, 'message' => 'Bajet berjaya ditambah.']);
                exit;
            }

            $ok = "Bajet berjaya disimpan!";
            $_POST = []; // reset form

        } catch (PDOException $e) {
            // Duplicate unique (tahun, unit_id)
            if ((int)($e->errorInfo[1] ?? 0) === 1062) {
                $jenis = ($unit_id === null) ? "BPA keseluruhan" : "unit ini";
                $err = "Bajet untuk $jenis pada tahun $tahun sudah wujud. Sila guna halaman Edit.";
            } else {
                $err = "Gagal simpan bajet: " . $e->getMessage();
            }
        } catch (Throwable $e) {
            $err = "Gagal simpan bajet: " . $e->getMessage();
        }
    }
}
?>
<!DOCTYPE html>
<html lang="ms">
<head>
  <meta charset="UTF-8">
  <title>Tambah Bajet</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
  <style>
    body { background-color:#f4f6f8; padding-top:70px; }
    .offcanvas { width:290px; }
  </style>
</head>
<body>

<?php include __DIR__ . '/sidebar.php'; ?>



<!-- Content -->
<div class="container mt-4 bpa-budget-add-page" data-bpa-modal-subtitle="Boleh isi bajet BPA keseluruhan atau ikut unit">
  <?php if ($err): ?>
    <div class="alert alert-danger"><?= htmlspecialchars($err) ?></div>
  <?php endif; ?>

  <?php if ($ok): ?>
    <div class="alert alert-success"><?= htmlspecialchars($ok) ?></div>
  <?php endif; ?>

  <form id="bpa-budget-add-form" method="post" class="row g-3 bpa-budget-add-form">

        <div class="col-md-2">
          <label class="form-label">Tahun</label>
          <input type="number" name="tahun" class="form-control" min="2000" max="2100"
                 value="<?= htmlspecialchars($_POST['tahun'] ?? date('Y')) ?>" required>
        </div>

        <div class="col-md-4">
          <label class="form-label">Unit / BPA</label>
          <select name="unit_id" class="form-select">
            <option value="">-- BPA Keseluruhan --</option>
            <?php foreach ($units as $un): ?>
              <option value="<?= (int)$un['unit_id'] ?>"
                <?= ((string)($_POST['unit_id'] ?? '') === (string)$un['unit_id']) ? 'selected' : '' ?>>
                <?= htmlspecialchars($un['nama_unit']) ?>
              </option>
            <?php endforeach; ?>
          </select>
          <small class="text-muted">Biarkan kosong jika bajet keseluruhan BPA.</small>
        </div>

        <div class="col-md-6">
          <label class="form-label">Jumlah Peruntukan (RM)</label>
          <input type="number" step="0.01" name="jumlah_peruntukan_rm" class="form-control" required
                 placeholder="Contoh: 43476520.00"
                 value="<?= htmlspecialchars($_POST['jumlah_peruntukan_rm'] ?? '') ?>">
        </div>

        <div class="col-md-6">
          <label class="form-label">Jumlah Perbelanjaan (RM) (optional)</label>
          <input type="number" step="0.01" name="jumlah_perbelanjaan_rm" class="form-control"
                 placeholder="Default 0"
                 value="<?= htmlspecialchars($_POST['jumlah_perbelanjaan_rm'] ?? '') ?>">
        </div>

        <div class="col-md-6">
          <label class="form-label">Jumlah Dana Wakalah (RM) (optional)</label>
          <input type="number" step="0.01" name="jumlah_dana_wakalah_rm" class="form-control"
                 placeholder="Default 0"
                 value="<?= htmlspecialchars($_POST['jumlah_dana_wakalah_rm'] ?? '') ?>">
        </div>

        <div class="col-12">
          <label class="form-label">Catatan (optional)</label>
          <textarea name="catatan" class="form-control" rows="3"
                 placeholder="Contoh: Bajet awal tahun"
                 ><?= htmlspecialchars($_POST['catatan'] ?? '') ?></textarea>
        </div>

  </form>

  <div class="bpa-budget-modal-footer">
    <button type="submit" form="bpa-budget-add-form" class="budget-list-action budget-list-action--primary bpa-budget-save-button">
      <span class="budget-list-action-icon"><i class="bi bi-check-lg" aria-hidden="true"></i></span>
      <span>Tambah</span>
    </button>
  </div>
</div>

<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>
