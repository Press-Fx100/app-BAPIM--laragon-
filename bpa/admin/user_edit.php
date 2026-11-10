<?php
require_once __DIR__ . '/../init.php';
require_admin();

$name = htmlspecialchars($_SESSION['user']['user_nama'] ?? 'Admin');

// ambil unit untuk dropdown
$units = $pdo->query("SELECT unit_id, nama_unit FROM unit ORDER BY nama_unit")->fetchAll();

$user_id = (int)($_GET['id'] ?? 0);
if ($user_id <= 0) {
    header("Location: /bpa/admin/user_list.php");
    exit;
}

// load user target
$stmt = $pdo->prepare("SELECT user_id, user_nama, user_email, role, unit_id, status_acc FROM users WHERE user_id=?");
$stmt->execute([$user_id]);
$target = $stmt->fetch();

if (!$target) {
    header("Location: /bpa/admin/user_list.php?msg=" . urlencode("User tidak dijumpai."));
    exit;
}

$err = '';
$ok  = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $user_nama  = trim($_POST['user_nama'] ?? '');
    $user_email = trim($_POST['user_email'] ?? '');
    $role       = $_POST['role'] ?? '';
    $status_acc = $_POST['status_acc'] ?? '';
    $unit_id    = ($_POST['unit_id'] ?? '') !== '' ? (int)$_POST['unit_id'] : null;

    $new_password = $_POST['new_password'] ?? '';

    // role admin -> unit null
    if ($role === 'admin') {
        $unit_id = null;
    }

    // validation
    if ($user_nama === '' || $user_email === '') {
        $err = "Nama dan Email wajib diisi.";
    } elseif (!filter_var($user_email, FILTER_VALIDATE_EMAIL)) {
        $err = "Email tidak sah.";
    } elseif (!in_array($role, ['admin','editor','staff'], true)) {
        $err = "Role tidak sah.";
    } elseif (!in_array($status_acc, ['active','inactive'], true)) {
        $err = "Status tidak sah.";
    } elseif ($role !== 'admin' && $unit_id === null) {
        $err = "Untuk editor/staff, unit wajib dipilih.";
    } else {
        // safety: tak boleh nyahaktif akaun sendiri
        $currentId = (int)($_SESSION['user']['user_id'] ?? 0);
        if ($user_id === $currentId && $status_acc === 'inactive') {
            $err = "Tak boleh nyahaktif akaun sendiri.";
        }

        // safety: tak boleh nyahaktif admin terakhir
        if (!$err && $target['role'] === 'admin' && $status_acc === 'inactive' && $target['status_acc'] === 'active') {
            $adminActive = (int)$pdo->query("SELECT COUNT(*) FROM users WHERE role='admin' AND status_acc='active'")->fetchColumn();
            if ($adminActive <= 1) {
                $err = "Tak boleh nyahaktif admin terakhir.";
            }
        }
    }

    if (!$err) {
        try {
            $pdo->beginTransaction();

            // check email duplicate (kecuali user sendiri)
            $check = $pdo->prepare("SELECT COUNT(*) FROM users WHERE user_email=? AND user_id<>?");
            $check->execute([$user_email, $user_id]);
            if ((int)$check->fetchColumn() > 0) {
                throw new Exception("Email sudah digunakan oleh user lain.");
            }

            // update profile
            $up = $pdo->prepare("
                UPDATE users
                SET user_nama=?, user_email=?, role=?, unit_id=?, status_acc=?
                WHERE user_id=?
            ");
            $up->execute([$user_nama, $user_email, $role, $unit_id, $status_acc, $user_id]);

            // update password optional
            if (trim($new_password) !== '') {
                $hash = password_hash($new_password, PASSWORD_DEFAULT);
                $pdo->prepare("UPDATE users SET password_hash=? WHERE user_id=?")
                    ->execute([$hash, $user_id]);
            }

            $pdo->commit();
            $ok = "User berjaya dikemaskini.";

            // reload
            $stmt = $pdo->prepare("SELECT user_id, user_nama, user_email, role, unit_id, status_acc FROM users WHERE user_id=?");
            $stmt->execute([$user_id]);
            $target = $stmt->fetch();

        } catch (Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            $err = "Gagal kemaskini: " . $e->getMessage();
        }
    }
}
?>
<!DOCTYPE html>
<html lang="ms">
<head>
  <meta charset="UTF-8">
  <title>Edit User</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">

  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/css/font-awesome.min.css">

  <style>
    body { background-color:#f4f6f8; padding-top:70px; }
    .offcanvas { width:290px; }
  </style>
</head>
<body>

<?php include __DIR__ . '/sidebar.php'; ?>

<!-- Content -->
<div class="container mt-4">

  <div class="d-flex justify-content-between align-items-center mb-3">
    <div>
      <h4 class="fw-bold mb-0">Edit User</h4>
      <small class="text-muted">Kemaskini maklumat pengguna</small>
    </div>
    <div>
      <a href="/bpa/admin/user_list.php" class="btn btn-secondary">⬅ Kembali Senarai</a>
      <a href="/bpa/admin/dashboard_admin.php" class="btn btn-outline-dark">🏠 Dashboard</a>
    </div>
  </div>

  <?php if ($err): ?>
    <div class="alert alert-danger"><?= htmlspecialchars($err) ?></div>
  <?php endif; ?>

  <?php if ($ok): ?>
    <div class="alert alert-success"><?= htmlspecialchars($ok) ?></div>
  <?php endif; ?>

  <div class="card shadow-sm border-0">
    <div class="card-body">
      <form method="post" class="row g-3">

        <div class="col-md-6">
          <label class="form-label">Nama</label>
          <input type="text" name="user_nama" class="form-control" required
                 value="<?= htmlspecialchars($target['user_nama']) ?>">
        </div>

        <div class="col-md-6">
          <label class="form-label">Email</label>
          <input type="email" name="user_email" class="form-control" required
                 value="<?= htmlspecialchars($target['user_email']) ?>">
        </div>

        <div class="col-md-4">
          <label class="form-label">Role</label>
          <select name="role" id="role" class="form-select" required>
            <option value="staff"  <?= $target['role']==='staff'?'selected':'' ?>>staff</option>
            <option value="editor" <?= $target['role']==='editor'?'selected':'' ?>>editor</option>
            <option value="admin"  <?= $target['role']==='admin'?'selected':'' ?>>admin</option>
          </select>
        </div>

        <div class="col-md-4">
          <label class="form-label">Status Akaun</label>
          <select name="status_acc" class="form-select" required>
            <option value="active"   <?= $target['status_acc']==='active'?'selected':'' ?>>active</option>
            <option value="inactive" <?= $target['status_acc']==='inactive'?'selected':'' ?>>inactive</option>
          </select>
        </div>

        <div class="col-md-4" id="unitWrap">
          <label class="form-label">Unit</label>
          <select name="unit_id" id="unit_id" class="form-select">
            <option value="">-- None --</option>
            <?php foreach ($units as $un): ?>
              <option value="<?= (int)$un['unit_id'] ?>" <?= ((int)$target['unit_id'] === (int)$un['unit_id'])?'selected':'' ?>>
                <?= htmlspecialchars($un['nama_unit']) ?>
              </option>
            <?php endforeach; ?>
          </select>
          <small class="text-muted">Editor/Staff wajib pilih unit. Admin auto None.</small>
        </div>

        <hr>

        <div class="col-md-6">
          <label class="form-label">Password Baru (optional)</label>
          <div class="input-group">
            <input type="password" name="new_password" id="new_password" class="form-control" placeholder="Isi jika nak tukar password">
            <button class="btn btn-outline-secondary" type="button" onclick="togglePassword('new_password', this)">
              <i class="fa fa-eye"></i>
            </button>
          </div>
        </div>

        <div class="col-12">
          <button class="btn btn-primary">Simpan Perubahan</button>
        </div>

      </form>
    </div>
  </div>

</div>

<script>
  const roleEl = document.getElementById('role');
  const unitEl = document.getElementById('unit_id');
  const unitWrap = document.getElementById('unitWrap');

  function toggleUnit(){
    if(roleEl.value === 'admin'){
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

  function togglePassword(inputId, btn){
    const input = document.getElementById(inputId);
    const icon = btn.querySelector('i');

    if(input.type === 'password'){
      input.type = 'text';
      icon.classList.remove('fa-eye');
      icon.classList.add('fa-eye-slash');
    } else {
      input.type = 'password';
      icon.classList.remove('fa-eye-slash');
      icon.classList.add('fa-eye');
    }
  }
</script>

<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>