<?php
require_once __DIR__ . '/../init.php';
require_admin();

/* ===============================
   VALIDATE ID
=================================*/
$id = $_GET['id'] ?? 0;
if (!ctype_digit((string)$id)) {
    header("Location: bajet_list.php");
    exit;
}
$id = (int)$id;

/* ===============================
   GET DATA BAJET
=================================*/
$stmt = $pdo->prepare("
    SELECT b.*, u.nama_unit
    FROM bajet b
    LEFT JOIN unit u ON u.unit_id = b.unit_id
    WHERE b.bajet_id = ?
");
$stmt->execute([$id]);
$bajet = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$bajet) {
    header("Location: bajet_list.php");
    exit;
}

/* ===============================
   GET UNIT LIST
=================================*/
$units = $pdo->query("
    SELECT unit_id, nama_unit
    FROM unit
    ORDER BY unit_id ASC
")->fetchAll(PDO::FETCH_ASSOC);

/* ===============================
   UPDATE PROCESS
=================================*/
$editError = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {

    $tahun = $_POST['tahun'] ?? date('Y');
    $unit_id_raw = trim((string)($_POST['unit_id'] ?? ''));

    $jumlah_peruntukan = $_POST['jumlah_peruntukan_rm'] ?? 0;
    $jumlah_wakalah = $_POST['jumlah_dana_wakalah_rm'] ?? 0;

    if (!ctype_digit((string)$tahun)) {
        $tahun = date('Y');
    }

    if ($unit_id_raw !== '' && !ctype_digit($unit_id_raw)) {
        if (($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '') === 'XMLHttpRequest') {
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode(['success' => false, 'message' => 'Unit yang dipilih tidak sah.']);
            exit;
        }
        $editError = 'Unit yang dipilih tidak sah.';
    }
    $unit_id = $unit_id_raw === '' ? null : (int)$unit_id_raw;

    $jumlah_peruntukan = (float) str_replace(',', '', $jumlah_peruntukan);
    $jumlah_wakalah    = (float) str_replace(',', '', $jumlah_wakalah);

    if (!$editError) {
        if ($unit_id === null) {
            $duplicate = $pdo->prepare("
                SELECT bajet_id FROM bajet
                WHERE tahun = ? AND unit_id IS NULL AND bajet_id != ?
                LIMIT 1
            ");
            $duplicate->execute([$tahun, $id]);
        } else {
            $duplicate = $pdo->prepare("
                SELECT bajet_id FROM bajet
                WHERE tahun = ? AND unit_id = ? AND bajet_id != ?
                LIMIT 1
            ");
            $duplicate->execute([$tahun, $unit_id, $id]);
        }

        if ($duplicate->fetchColumn()) {
            $editError = "Bajet untuk tahun $tahun dan unit/BPA tersebut sudah wujud.";
            if (($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '') === 'XMLHttpRequest') {
                header('Content-Type: application/json; charset=utf-8');
                echo json_encode(['success' => false, 'message' => $editError]);
                exit;
            }
        }
    }

    if (!$editError) {
        $update = $pdo->prepare("
            UPDATE bajet
            SET tahun = ?,
                unit_id = ?,
                jumlah_peruntukan_rm = ?,
                jumlah_dana_wakalah_rm = ?
            WHERE bajet_id = ?
        ");

        $update->execute([
            $tahun,
            $unit_id,
            $jumlah_peruntukan,
            $jumlah_wakalah,
            $id
        ]);

        if (($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '') === 'XMLHttpRequest') {
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode(['success' => true, 'message' => 'Bajet berjaya dikemaskini.']);
            exit;
        }

        header("Location: bajet_list.php?updated=1");
        exit;
    }
}
?>
<!DOCTYPE html>
<html lang="ms">
<head>
<meta charset="UTF-8">
<title>Edit Bajet</title>
<meta name="viewport" content="width=device-width, initial-scale=1">

<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">

<style>
body{background:#f4f6f8;padding-top:70px;}
.card{border-radius:16px;}
</style>
</head>
<body>

<?php include __DIR__ . '/sidebar.php'; ?>

<div class="container mt-4 bpa-budget-add-page" data-bpa-modal-subtitle="Kemaskini maklumat bajet">
    <?php if ($editError): ?>
        <div class="alert alert-danger" role="alert"><?= htmlspecialchars($editError) ?></div>
    <?php endif; ?>

    <form id="bpa-budget-edit-form" method="POST" class="row g-3 bpa-budget-add-form">
        <div class="col-md-4">
            <label class="form-label" for="budget-edit-year">Tahun</label>
            <input id="budget-edit-year" type="number" name="tahun" class="form-control"
                   value="<?= htmlspecialchars((string)$bajet['tahun']) ?>" required>
        </div>

        <div class="col-md-8">
            <label class="form-label" for="budget-edit-unit">Unit / BPA</label>
            <select id="budget-edit-unit" name="unit_id" class="form-select">
                <option value="" <?= $bajet['unit_id'] === null ? 'selected' : '' ?>>-- BPA Keseluruhan --</option>
                <?php foreach ($units as $u): ?>
                    <option value="<?= (int)$u['unit_id'] ?>"
                        <?= (string)$u['unit_id'] === (string)$bajet['unit_id'] ? 'selected' : '' ?>>
                        <?= htmlspecialchars($u['nama_unit']) ?>
                    </option>
                <?php endforeach; ?>
            </select>
        </div>

        <div class="col-12">
            <label class="form-label" for="budget-edit-allocation">Jumlah Peruntukan (RM)</label>
            <input id="budget-edit-allocation" type="number" step="0.01" name="jumlah_peruntukan_rm"
                   class="form-control"
                   value="<?= number_format((float)$bajet['jumlah_peruntukan_rm'], 2, '.', '') ?>" required>
        </div>

        <div class="col-12">
            <label class="form-label" for="budget-edit-wakalah">Jumlah Dana Wakalah (RM)</label>
            <input id="budget-edit-wakalah" type="number" step="0.01" name="jumlah_dana_wakalah_rm"
                   class="form-control"
                   value="<?= number_format((float)$bajet['jumlah_dana_wakalah_rm'], 2, '.', '') ?>">
        </div>
    </form>

    <div class="bpa-budget-modal-footer">
        <button type="submit" form="bpa-budget-edit-form"
                class="budget-list-action budget-list-action--primary bpa-budget-save-button">
            <span class="budget-list-action-icon"><i class="bi bi-check-lg" aria-hidden="true"></i></span>
            <span>Simpan</span>
        </button>
    </div>
</div>

<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>