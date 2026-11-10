<?php
require_once __DIR__ . '/../init.php';
require_admin();

$name = htmlspecialchars($_SESSION['user']['user_nama'] ?? 'Admin');

// ambil senarai unit
$units = $pdo->query("SELECT unit_id, nama_unit FROM unit ORDER BY nama_unit")->fetchAll();

$err = '';
$ok = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $user_nama  = trim($_POST['user_nama'] ?? '');
    $user_email = trim($_POST['user_email'] ?? '');
    $password   = $_POST['password'] ?? '';
    $role       = $_POST['role'] ?? 'staff';
    $status_acc = $_POST['status_acc'] ?? 'active';

    // unit_id: admin -> NULL, selain admin -> wajib pilih
    $unit_id = $_POST['unit_id'] ?? null;
    if ($role === 'admin') {
        $unit_id = null;
    } else {
        $unit_id = ($unit_id !== '' && $unit_id !== null) ? (int)$unit_id : null;
    }

    // validation ringkas
    if ($user_nama === '' || $user_email === '' || $password === '') {
        $err = "Sila lengkapkan Nama, Email, dan Password.";
    } elseif (!filter_var($user_email, FILTER_VALIDATE_EMAIL)) {
        $err = "Format email tidak sah.";
    } elseif (!in_array($role, ['admin','editor','staff'], true)) {
        $err = "Role tidak sah.";
    } elseif (!in_array($status_acc, ['active','inactive'], true)) {
        $err = "Status tidak sah.";
    } elseif ($role !== 'admin' && $unit_id === null) {
        $err = "Sila pilih Unit untuk editor/staff.";
    } else {
        try {
            // check email duplicate
            $check = $pdo->prepare("SELECT COUNT(*) FROM users WHERE user_email = ?");
            $check->execute([$user_email]);
            if ((int)$check->fetchColumn() > 0) {
                $err = "Email sudah digunakan. Sila guna email lain.";
            } else {
                $hash = password_hash($password, PASSWORD_DEFAULT);

                $stmt = $pdo->prepare("
                    INSERT INTO users (user_nama, user_email, password_hash, role, unit_id, status_acc)
                    VALUES (:nama, :email, :hash, :role, :unit_id, :status)
                ");
                $stmt->execute([
                    ':nama' => $user_nama,
                    ':email' => $user_email,
                    ':hash' => $hash,
                    ':role' => $role,
                    ':unit_id' => $unit_id, // NULL ok
                    ':status' => $status_acc,
                ]);

                $ok = "User berjaya ditambah!";
            }
        } catch (Throwable $e) {
            $err = "Gagal tambah user: " . $e->getMessage();
        }
    }
}
?>
<!DOCTYPE html>
<html lang="ms">
<head>
  <meta charset="UTF-8">
  <title>Tambah User</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
  <style>
    body { background-color:#f4f6f8; padding-top:70px; }
    .offcanvas { width:290px; }
  </style>
</head>
<body>

<?php include __DIR__ . '/sidebar.php'; ?>


<!-- Content -->
<div class="container mt-4">
  <div class="card shadow-sm border-0">
    <div class="card-body">
      <h4 class="fw-bold mb-3">Tambah User</h4>

      <?php if ($err): ?>
        <div class="alert alert-danger"><?= htmlspecialchars($err) ?></div>
      <?php endif; ?>

      <?php if ($ok): ?>
        <div class="alert alert-success"><?= htmlspecialchars($ok) ?></div>
      <?php endif; ?>

      <form method="post" class="row g-3" autocomplete="off">
        <div class="col-md-6">
          <label class="form-label">Nama</label>
          <input type="text" name="user_nama" class="form-control" required>
        </div>

        <div class="col-md-6">
          <label class="form-label">Email</label>
          <input type="email" name="user_email" class="form-control" required>
        </div>

        <div class="col-md-6">
          <label class="form-label">Password</label>
          <input type="password" name="password" class="form-control" required>
          <small class="text-muted">Password akan di-hash secara automatik.</small>
        </div>

        <div class="col-md-3">
          <label class="form-label">Role</label>
          <select name="role" id="role" class="form-select" required>
            <option value="staff">staff (view sahaja)</option>
            <option value="editor">editor (edit unit sendiri)</option>
            <option value="admin">admin (semua)</option>
          </select>
        </div>

        <div class="col-md-3">
          <label class="form-label">Status Akaun</label>
          <select name="status_acc" class="form-select" required>
            <option value="active">active</option>
            <option value="inactive">inactive</option>
          </select>
        </div>

        <div class="col-md-6" id="unitWrap">
          <label class="form-label">Unit</label>
          <select name="unit_id" id="unit_id" class="form-select">
            <option value="">-- Pilih Unit --</option>
            <?php foreach ($units as $un): ?>
              <option value="<?= (int)$un['unit_id'] ?>"><?= htmlspecialchars($un['nama_unit']) ?></option>
            <?php endforeach; ?>
          </select>
          <small class="text-muted">Wajib untuk role editor/staff. Admin akan auto NULL.</small>
        </div>

        <div class="col-12">
  <button class="btn btn-primary">Simpan</button>

  <a href="/bpa/admin/user_list.php" class="btn btn-secondary">
    Senarai User
  </a>

  <a href="/bpa/admin/dashboard_admin.php" class="btn btn-outline-dark">
    Dashboard
  </a>
</div>

      </form>
    </div>
  </div>
</div>

<script>
  // bila pilih role=admin, disable unit dropdown
  const roleEl = document.getElementById('role');
  const unitEl = document.getElementById('unit_id');
  const unitWrap = document.getElementById('unitWrap');

  function toggleUnit() {
    if (roleEl.value === 'admin') {
      unitEl.value = '';
      unitEl.disabled = true;
      unitWrap.style.opacity = '0.6';
    } else {
      unitEl.disabled = false;
      unitWrap.style.opacity = '1';
    }
  }
  roleEl.addEventListener('change', toggleUnit);
  toggleUnit();
</script>

<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>
