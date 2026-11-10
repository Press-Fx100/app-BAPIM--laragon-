<?php
session_start();

if (!empty($_SESSION['username']) || !empty($_SESSION['user'])) {
    require_once __DIR__ . '/auth.php';
    $user = resolve_bapim_session_user();
    if ($user) {
        $role = strtolower((string)($user['role'] ?? 'staff'));
        $unitId = (int)($user['unit_id'] ?? 0);
        $redirect = '/bpa/admin/dashboard_admin.php';

        if ($role !== 'admin') {
            $map = [
                1 => '/bpa/uak/dashboard.php',
                2 => '/bpa/upu/dashboard.php',
                3 => '/bpa/upa/dashboard.php',
                4 => '/bpa/ulk/dashboard.php',
            ];
            $redirect = $map[$unitId] ?? '/bpa/admin/dashboard_admin.php';
        }

        header('Location: ' . $redirect);
        exit;
    }
}

header('Location: /app-bapim/log-masuk');
exit;

$error = $_GET['error'] ?? '';
?>
<!DOCTYPE html>
<html lang="ms">
<head>
<meta charset="UTF-8">
<title>Login BPA</title>

<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/css/font-awesome.min.css">

<style>
  body{
    background:#ffffff;
    font-family: Arial, sans-serif;
    margin:0;
    display:flex;
    justify-content:center;
    align-items:center;
    height:100vh;
  }
  .login-box{
    width:420px;
    text-align:center;
    padding:10px;
  }
  .login-logo{
    display:block;
    margin:0 auto 30px auto;
    width:230px;
    max-width:100%;
    height:auto;
  }
  .title{
    font-size:22px;
    font-weight:bold;
    margin-bottom:20px;
  }
  input[type="email"]{
    width:100%;
    padding:14px;
    margin-bottom:16px;
    border:1px solid #999;
    font-size:16px;
    box-sizing:border-box;
    border-radius:8px;
  }
  .password-box{
    position:relative;
    margin-bottom:16px;
  }
  .password-box input{
    width:100%;
    padding:14px;
    border:1px solid #999;
    font-size:16px;
    box-sizing:border-box;
    border-radius:8px;
  }
  .toggle-password{
    position:absolute;
    right:14px;
    top:50%;
    transform:translateY(-50%);
    cursor:pointer;
    font-size:18px;
    color:#333;
  }
  button{
    width:100%;
    padding:14px;
    background:#000;
    color:#fff;
    border:none;
    font-size:16px;
    cursor:pointer;
    border-radius:8px;
    margin-top:6px;
  }
  button:hover{ background:#333; }
  .error{
    color:#c0392b;
    margin-top:14px;
    font-size:14px;
  }
  .hint{
    color:#666;
    font-size:13px;
    margin-top:10px;
  }
</style>
</head>

<body>
<div class="login-box">

  <!-- Tukar ikut logo kau -->
  <img src="/bpa/gambar/logo maiwp.png" alt="MAIWP" class="login-logo">

  <div class="title">Sistem BPA</div>

  <form action="/bpa/login_process.php" method="POST">
    <input type="email" name="email" placeholder="Email" required>

    <div class="password-box">
      <input type="password" name="password" id="password" placeholder="Kata Laluan" required>
      <span class="toggle-password" onclick="togglePassword()">
        <i id="eyeIcon" class="fa fa-eye" aria-hidden="true"></i>
      </span>
    </div>

    <button type="submit">Log Masuk</button>
  </form>

  <?php if ($error): ?>
    <div class="error"><?= htmlspecialchars($error) ?></div>
  <?php endif; ?>

  <div class="hint">© BPA MAIWP</div>
</div>

<script>
function togglePassword() {
  var pwd = document.getElementById("password");
  var icon = document.getElementById("eyeIcon");

  if (pwd.type === "password") {
    pwd.type = "text";
    icon.className = "fa fa-eye-slash";
  } else {
    pwd.type = "password";
    icon.className = "fa fa-eye";
  }
}
</script>
</body>
</html>
