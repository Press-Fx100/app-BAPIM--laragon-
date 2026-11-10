<?php
// /bpa/edit_profile.php
declare(strict_types=1);

require_once __DIR__ . '/../init.php';
require_login();

// ===== Guard session =====
$userId = (int)($_SESSION['user']['user_id'] ?? 0);
if ($userId <= 0) {
  header("Location: /bpa/login.php?error=" . urlencode("Sila login semula."));
  exit;
}

$role   = $_SESSION['user']['role'] ?? 'staff';
$unitId = $_SESSION['user']['unit_id'] ?? null;

$err = '';
$ok  = '';

function clean_phone($v) {
  $v = trim((string)$v);
  if ($v === '') return null;
  $v = preg_replace('/[\s\-]/', '', $v);
  if (!preg_match('/^\+?[0-9]{8,15}$/', $v)) return false;
  return $v;
}

function first_existing_url(array $candidates): string
{
  $docRoot = rtrim($_SERVER['DOCUMENT_ROOT'] ?? '', '/');

  foreach ($candidates as $url) {
    $url = '/' . ltrim($url, '/');
    $path = $docRoot . $url;

    if (is_file($path)) {
      return $url;
    }
  }

  return "/bpa/dashboard.php";
}

function get_back_url(string $role, $unitId): string
{
  $role = strtolower(trim($role));
  $unitId = is_null($unitId) ? null : (int)$unitId;

  $unitFolder = [
    1 => 'uak',
    2 => 'upu',
    3 => 'upa',
    4 => 'ulk',
  ];

  if ($role === 'admin') {
    return first_existing_url([
      "/bpa/admin/dashboard_admin.php",
      "/bpa/dashboard.php",
    ]);
  }

  $folder = $unitFolder[$unitId] ?? null;

  if ($folder) {

    if ($role === 'editor') {
      return first_existing_url([
        "/bpa/{$folder}/dashboard_editor.php",
        "/bpa/{$folder}/dashboard.php",
      ]);
    }

    return first_existing_url([
      "/bpa/{$folder}/dashboard_staff.php",
      "/bpa/{$folder}/dashboard.php",
    ]);
  }

  return "/bpa/dashboard.php";
}

$backUrl = get_back_url($role, $unitId);

// ===== Load user =====
$stmt = $pdo->prepare("SELECT user_id, user_nama, user_email, no_tel, role, unit_id FROM users WHERE user_id=? LIMIT 1");
$stmt->execute([$userId]);
$user = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$user) {
  session_destroy();
  header("Location: /bpa/login.php");
  exit;
}

// ===== Submit =====
if ($_SERVER['REQUEST_METHOD'] === 'POST') {

  $newName  = trim($_POST['user_nama'] ?? '');
  $newEmail = trim($_POST['user_email'] ?? '');
  $newPhone = clean_phone($_POST['no_tel'] ?? '');

  $newPass = (string)($_POST['new_password'] ?? '');
  $confirm = (string)($_POST['confirm_password'] ?? '');

  if ($newName === '') {
    $err = "Nama wajib diisi.";
  }
  elseif ($newEmail === '' || !filter_var($newEmail, FILTER_VALIDATE_EMAIL)) {
    $err = "Email tidak sah.";
  }
  elseif ($newPass !== '' && strlen($newPass) < 8) {
    $err = "Kata laluan minimum 8 aksara.";
  }
  elseif ($newPass !== '' && $newPass !== $confirm) {
    $err = "Kata laluan tidak sama.";
  }

  if (!$err) {

    $stmt = $pdo->prepare("
      UPDATE users
      SET user_nama=?, user_email=?, no_tel=?
      WHERE user_id=?
    ");

    $stmt->execute([
      $newName,
      $newEmail,
      $newPhone,
      $userId
    ]);

    if ($newPass !== '') {

      $hash = password_hash($newPass, PASSWORD_DEFAULT);

      $stmt = $pdo->prepare("
        UPDATE users
        SET password_hash=?
        WHERE user_id=?
      ");

      $stmt->execute([$hash, $userId]);
    }

    $ok = "Profil berjaya dikemaskini.";
  }
}
?>

<!DOCTYPE html>
<html lang="ms">
<head>

<meta charset="UTF-8">
<title>Edit Profil</title>

<meta name="viewport" content="width=device-width, initial-scale=1">

<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">

<link rel="stylesheet"
href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/css/font-awesome.min.css">

<style>

body{
background:#f4f6f8;
padding-top:70px;
}

.offcanvas{
width:290px;
}

.hint{
font-size:12px;
color:#6c757d;
}

</style>
</head>

<body>

<?php
$unitMap = [
 1=>'uak',
 2=>'upu',
 3=>'upa',
 4=>'ulk'
];

if($role==='admin'){
 require_once __DIR__.'/../admin/sidebar.php';
}else{

 $folder=$unitMap[(int)$unitId]??null;

 if($role==='editor'){
  require_once __DIR__."/../{$folder}/sidebar_editor.php";
 }else{
  require_once __DIR__."/../{$folder}/sidebar_staff.php";
 }

}
?>

<div class="container mt-4" style="max-width:900px;">

<div class="d-flex justify-content-between align-items-center mb-3">

<div>
<h4 class="fw-bold mb-0">Edit Profil</h4>
<div class="hint">Kemaskini maklumat akaun.</div>
</div>

<a href="<?= htmlspecialchars($backUrl) ?>" class="btn btn-outline-dark">
⬅ Kembali
</a>

</div>

<?php if($err): ?>
<div class="alert alert-danger"><?= htmlspecialchars($err) ?></div>
<?php endif; ?>

<?php if($ok): ?>
<div class="alert alert-success"><?= htmlspecialchars($ok) ?></div>
<?php endif; ?>

<div class="card shadow-sm border-0">
<div class="card-body">

<form method="post" class="row g-3">

<div class="col-md-6">
<label class="form-label">Nama</label>
<input type="text"
name="user_nama"
class="form-control"
required
value="<?= htmlspecialchars($user['user_nama'] ?? '') ?>">
</div>

<div class="col-md-6">
<label class="form-label">Email</label>
<input type="email"
name="user_email"
class="form-control"
required
value="<?= htmlspecialchars($user['user_email'] ?? '') ?>">
</div>

<div class="col-md-6">
<label class="form-label">No Telefon</label>
<input type="text"
name="no_tel"
class="form-control"
value="<?= htmlspecialchars($user['no_tel'] ?? '') ?>">
</div>

<div class="col-md-6">
<label class="form-label">Role</label>
<input type="text"
class="form-control"
value="<?= htmlspecialchars($user['role']) ?>"
disabled>
</div>

<div class="col-12"><hr></div>

<!-- PASSWORD -->

<div class="col-md-6">

<label class="form-label">Kata Laluan Baru</label>

<div class="input-group">

<input type="password"
name="new_password"
id="new_password"
class="form-control"
placeholder="Minimum 8 aksara">

<button class="btn btn-outline-secondary"
type="button"
onclick="togglePassword('new_password',this)">

<i class="fa fa-eye"></i>

</button>

</div>

</div>

<div class="col-md-6">

<label class="form-label">Sahkan Kata Laluan</label>

<div class="input-group">

<input type="password"
name="confirm_password"
id="confirm_password"
class="form-control"
placeholder="Ulang kata laluan">

<button class="btn btn-outline-secondary"
type="button"
onclick="togglePassword('confirm_password',this)">

<i class="fa fa-eye"></i>

</button>

</div>

</div>

<div class="col-12 d-flex gap-2">

<button type="submit" class="btn btn-primary">
Simpan Perubahan
</button>

<a href="<?= htmlspecialchars($backUrl) ?>"
class="btn btn-outline-secondary">
Batal
</a>

</div>

</form>

</div>
</div>

</div>

<script>

function togglePassword(inputId,btn){

const input=document.getElementById(inputId);
const icon=btn.querySelector("i");

if(input.type==="password"){

 input.type="text";
 icon.classList.remove("fa-eye");
 icon.classList.add("fa-eye-slash");

}else{

 input.type="password";
 icon.classList.remove("fa-eye-slash");
 icon.classList.add("fa-eye");

}

}

</script>

<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>

</body>
</html>