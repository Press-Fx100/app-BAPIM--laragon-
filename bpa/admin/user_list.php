<?php
require_once __DIR__ . '/../init.php';
require_admin();

$name = htmlspecialchars($_SESSION['user']['user_nama'] ?? 'Admin');

// Load units for filter dropdown
$units = $pdo->query("SELECT unit_id, nama_unit FROM unit ORDER BY nama_unit")->fetchAll();

// Filters
$q = trim($_GET['q'] ?? '');
$roleFilter = $_GET['role'] ?? '';
$unitFilter = $_GET['unit_id'] ?? '';

// Toggle status (dengan safety rules)
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['toggle_user_id'])) {
    $toggleId = (int)$_POST['toggle_user_id'];
    $currentId = (int)($_SESSION['user']['user_id'] ?? 0);

    // ambil maklumat user yang nak ditoggle
    $stmt = $pdo->prepare("SELECT role, status_acc FROM users WHERE user_id = ? LIMIT 1");
    $stmt->execute([$toggleId]);
    $target = $stmt->fetch();

    if (!$target) {
        $msg = "User tidak dijumpai.";
    } elseif ($toggleId === $currentId) {
        $msg = "Tak boleh nyahaktif akaun sendiri.";
    } else {

        // kalau nak nyahaktif admin, pastikan bukan admin terakhir
        if ($target['role'] === 'admin' && $target['status_acc'] === 'active') {
            $adminActive = (int)$pdo->query("SELECT COUNT(*) FROM users WHERE role='admin' AND status_acc='active'")->fetchColumn();

            if ($adminActive <= 1) {
                $msg = "Tak boleh nyahaktif admin terakhir.";
            } else {
                $pdo->prepare("UPDATE users SET status_acc='inactive' WHERE user_id=?")->execute([$toggleId]);
                $msg = "Admin berjaya dinyahaktifkan.";
            }

        } else {
            // toggle normal (aktif <-> inactive)
            $pdo->prepare("
                UPDATE users
                SET status_acc = CASE WHEN status_acc='active' THEN 'inactive' ELSE 'active' END
                WHERE user_id = ?
            ")->execute([$toggleId]);

            $msg = "Status user berjaya dikemaskini.";
        }
    }

    // redirect keep filters
    $params = $_GET;
    $params['msg'] = $msg;
    header("Location: user_list.php?" . http_build_query($params));
    exit;
}

$msg = $_GET['msg'] ?? '';

// Build query with filters
$sql = "
SELECT
  u.user_id, u.user_nama, u.user_email, u.role, u.status_acc, u.created_at,
  un.nama_unit
FROM users u
LEFT JOIN unit un ON un.unit_id = u.unit_id
WHERE 1=1
";
$params = [];

if ($q !== '') {
    $sql .= " AND (u.user_nama LIKE :q OR u.user_email LIKE :q) ";
    $params[':q'] = "%$q%";
}
if (in_array($roleFilter, ['admin','editor','staff'], true)) {
    $sql .= " AND u.role = :role ";
    $params[':role'] = $roleFilter;
}
if ($unitFilter !== '' && ctype_digit($unitFilter)) {
    $sql .= " AND u.unit_id = :unit_id ";
    $params[':unit_id'] = (int)$unitFilter;
}

$sql .= " ORDER BY u.created_at DESC ";

$stmt = $pdo->prepare($sql);
$stmt->execute($params);
$rows = $stmt->fetchAll();
?>
<!DOCTYPE html>
<html lang="ms">
<head>
  <meta charset="UTF-8">
  <title>Senarai User</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
  <style>
    body { background-color:#f4f6f8; padding-top:70px; }
    .offcanvas { width:290px; }
    .badge-role { font-size: 12px; }
  </style>
</head>
<body>

<?php include __DIR__ . '/sidebar.php'; ?>


<!-- Content -->
<div class="container mt-4">

  <div class="d-flex justify-content-between align-items-center mb-3">
    <div>
      <h4 class="fw-bold mb-0">Senarai User</h4>
      <small class="text-muted">Urus pengguna sistem BPA</small>
    </div>
    <div>
      <a href="/bpa/admin/user_add.php" class="btn btn-primary">➕ Tambah User</a>
      <a href="/bpa/admin/dashboard_admin.php" class="btn btn-outline-dark">⬅ Dashboard</a>
    </div>
  </div>

  <?php if ($msg): ?>
    <div class="alert alert-info"><?= htmlspecialchars($msg) ?></div>
  <?php endif; ?>

  <!-- Filter/Search -->
  <div class="card shadow-sm border-0 mb-3">
    <div class="card-body">
      <form class="row g-2" method="get">
        <div class="col-md-5">
          <input type="text" name="q" value="<?= htmlspecialchars($q) ?>" class="form-control"
                 placeholder="Cari nama atau email...">
        </div>

        <div class="col-md-3">
          <select name="role" class="form-select">
            <option value="">-- Semua Role --</option>
            <option value="admin"  <?= $roleFilter==='admin'?'selected':'' ?>>admin</option>
            <option value="editor" <?= $roleFilter==='editor'?'selected':'' ?>>editor</option>
            <option value="staff"  <?= $roleFilter==='staff'?'selected':'' ?>>staff</option>
          </select>
        </div>

        <div class="col-md-3">
          <select name="unit_id" class="form-select">
            <option value="">-- Semua Unit --</option>
            <?php foreach ($units as $un): ?>
              <option value="<?= (int)$un['unit_id'] ?>" <?= ((string)$unitFilter === (string)$un['unit_id'])?'selected':'' ?>>
                <?= htmlspecialchars($un['nama_unit']) ?>
              </option>
            <?php endforeach; ?>
          </select>
        </div>

        <div class="col-md-1 d-grid">
          <button class="btn btn-secondary">Cari</button>
        </div>
      </form>
    </div>
  </div>

  <!-- Table -->
  <div class="card shadow-sm border-0">
    <div class="card-body">
      <div class="table-responsive">
        <table class="table table-striped align-middle">
          <thead>
            <tr>
              <th>#</th>
              <th>Nama</th>
              <th>Email</th>
              <th>Role</th>
              <th>Unit</th>
              <th>Status</th>
              <th>Tarikh Cipta</th>
              <th style="width:240px;">Tindakan</th>
            </tr>
          </thead>
          <tbody>
            <?php if (!$rows): ?>
              <tr>
                <td colspan="8" class="text-center text-muted py-4">Tiada user dijumpai.</td>
              </tr>
            <?php else: ?>
              <?php foreach ($rows as $i => $r): ?>
                <tr>
                  <td><?= $i+1 ?></td>
                  <td><?= htmlspecialchars($r['user_nama']) ?></td>
                  <td><?= htmlspecialchars($r['user_email']) ?></td>
                  <td>
                    <?php
                      $role = $r['role'];
                      $badgeClass = $role==='admin' ? 'bg-danger' : ($role==='editor' ? 'bg-primary' : 'bg-secondary');
                    ?>
                    <span class="badge <?= $badgeClass ?> badge-role"><?= htmlspecialchars($role) ?></span>
                  </td>
                  <td><?= htmlspecialchars($r['nama_unit'] ?? '-') ?></td>
                  <td>
                    <?php if ($r['status_acc'] === 'active'): ?>
                      <span class="badge bg-success">active</span>
                    <?php else: ?>
                      <span class="badge bg-dark">inactive</span>
                    <?php endif; ?>
                  </td>
                  <td><?= htmlspecialchars(date('d/m/Y', strtotime($r['created_at']))) ?></td>
                  <td>
                    <a class="btn btn-sm btn-outline-primary mb-1"
                       href="/bpa/admin/user_edit.php?id=<?= (int)$r['user_id'] ?>">
                       Edit
                    </a>

                    <form method="post" style="display:inline;">
                      <input type="hidden" name="toggle_user_id" value="<?= (int)$r['user_id'] ?>">

                      <?php if ($r['status_acc'] === 'active'): ?>
                        <button class="btn btn-sm btn-outline-danger mb-1"
                                onclick="return confirm('Nyahaktif user ini?')">
                          Nyahaktif
                        </button>
                      <?php else: ?>
                        <button class="btn btn-sm btn-outline-success mb-1"
                                onclick="return confirm('Aktifkan semula user ini?')">
                          Aktifkan
                        </button>
                      <?php endif; ?>
                    </form>
                  </td>
                </tr>
              <?php endforeach; ?>
            <?php endif; ?>
          </tbody>
        </table>
      </div>
    </div>
  </div>

</div>

<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>
