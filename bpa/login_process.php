<?php
session_start();
require_once __DIR__ . "/db_connect.php";

$email = trim($_POST['email'] ?? '');
$password = $_POST['password'] ?? '';

if ($email === '' || $password === '') {
    header("Location: /bpa/login.php?error=" . urlencode("Sila isi email dan kata laluan."));
    exit;
}

// Fetch user
$stmt = $pdo->prepare("
    SELECT user_id, user_nama, user_email, password_hash, role, unit_id, status_acc
    FROM users
    WHERE user_email = ?
    LIMIT 1
");
$stmt->execute([$email]);
$user = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$user) {
    header("Location: /bpa/login.php?error=" . urlencode("Email atau kata laluan salah."));
    exit;
}

// Status account
if (($user['status_acc'] ?? '') !== 'active') {
    header("Location: /bpa/login.php?error=" . urlencode("Akaun tidak aktif. Sila hubungi admin."));
    exit;
}

// Verify password
if (!password_verify($password, $user['password_hash'])) {
    header("Location: /bpa/login.php?error=" . urlencode("Email atau kata laluan salah."));
    exit;
}

// Set session
$_SESSION['user'] = [
    'user_id'    => (int)$user['user_id'],
    'user_nama'  => $user['user_nama'],
    'user_email' => $user['user_email'],
    'role'       => $user['role'], // admin/editor/staff
    'unit_id'    => $user['unit_id'] !== null ? (int)$user['unit_id'] : null
];

$role = $user['role'];
$unit_id = $user['unit_id'] !== null ? (int)$user['unit_id'] : null;

// Admin
if ($role === 'admin') {
    header("Location: /bpa/admin/dashboard_admin.php");
    exit;
}

// editor/staff mesti ada unit
if ($unit_id === null) {
    session_destroy();
    header("Location: /bpa/login.php?error=" . urlencode("Unit belum ditetapkan untuk akaun ini. Sila hubungi admin."));
    exit;
}

// ✅ Mapping unit_id -> folder dashboard.php
$map = [
    1 => "/bpa/uak/dashboard.php",
    2 => "/bpa/upu/dashboard.php",
    3 => "/bpa/upa/dashboard.php",
    4 => "/bpa/ulk/dashboard.php",
];

$redirect = $map[$unit_id] ?? "/bpa/login.php?error=" . urlencode("Unit tidak sah.");
header("Location: " . $redirect);
exit;
