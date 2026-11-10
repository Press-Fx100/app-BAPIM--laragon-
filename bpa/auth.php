<?php
function resolve_bapim_session_user(): ?array
{
    if (!empty($_SESSION['user']) && is_array($_SESSION['user'])) {
        return $_SESSION['user'];
    }

    if (empty($_SESSION['username'])) {
        return null;
    }

    $config = require __DIR__ . '/../config/database.php';
    $dsn = sprintf(
        'mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4',
        $config['host'],
        $config['port'],
        $config['database']
    );

    try {
        $bapimPdo = new PDO($dsn, $config['username'], $config['password'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
    } catch (Throwable $e) {
        return null;
    }

    $statement = $bapimPdo->prepare(
        'SELECT id, username, display_name, email, unit, active, access_level FROM users WHERE username = ? AND active = 1 LIMIT 1'
    );
    $statement->execute([$_SESSION['username']]);
    $account = $statement->fetch();

    if (!$account) {
        return null;
    }

    $accessLevel = (int)($account['access_level'] ?? 2);
    $role = $accessLevel <= 1 ? 'admin' : 'staff';
    $unit = strtoupper(trim((string)($account['unit'] ?? '')));
    $unitMap = ['UAK' => 1, 'UPU' => 2, 'UPA' => 3, 'ULK' => 4];

    $_SESSION['user'] = [
        'user_id' => (int)($account['id'] ?? 0),
        'user_nama' => trim((string)($account['display_name'] ?? $account['username'] ?? 'Admin')),
        'user_email' => (string)($account['email'] ?? ''),
        'role' => $role,
        'access_level' => $accessLevel,
        'unit_id' => $unitMap[$unit] ?? null,
        'status_acc' => 'active',
    ];

    return $_SESSION['user'];
}

function require_login() {
    if (!resolve_bapim_session_user()) {
        header('Location: /app-bapim/log-masuk');
        exit;
    }
}

function require_admin() {
    require_login();
    $role = strtolower((string)($_SESSION['user']['role'] ?? ''));
    $accessLevel = (int)($_SESSION['user']['access_level'] ?? 0);
    if ($role !== 'admin' && $accessLevel > 1) {
        http_response_code(403);
        exit('403 Forbidden - Admin sahaja.');
    }
}

function require_bpa_page_access(string $page): void
{
    require_login();
    $pdo = $GLOBALS['pdo'] ?? null;
    if ($pdo instanceof PDO && function_exists('currentUser') && function_exists('canAccessUserPage')) {
        $user = currentUser($pdo);
        if ($user && canAccessUserPage($user, $page)) {
            return;
        }
        http_response_code(403);
        exit('Anda tidak mempunyai kebenaran untuk mengakses halaman ini.');
    }
    require_admin();
}

function has_bpa_unit_view_permission(string $unit): bool {
    return strtolower((string)($_SESSION['user']['role'] ?? '')) === 'staff'
        && defined('BPA_AUTHORIZED_UNIT')
        && BPA_AUTHORIZED_UNIT === strtoupper(trim($unit));
}
