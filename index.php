<?php
declare(strict_types=1);

require_once __DIR__ . '/app-updater.php';

session_start([
    'cookie_httponly' => true,
    'cookie_samesite' => 'Lax',
    'use_strict_mode' => true,
]);

$databaseConfig = require __DIR__ . '/config/database.php';
$storageDirectory = __DIR__ . '/data/csv';

if (!is_dir($storageDirectory) && !mkdir($storageDirectory, 0770, true) && !is_dir($storageDirectory)) {
    throw new RuntimeException('Could not create the private CSV storage directory.');
}

$dsn = sprintf(
    'mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4',
    $databaseConfig['host'],
    $databaseConfig['port'],
    $databaseConfig['database']
);
try {
    $pdo = new PDO($dsn, $databaseConfig['username'], $databaseConfig['password'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
} catch (PDOException $error) {
    error_log('MySQL connection failed: ' . $error->getMessage());
    http_response_code(500);
    header('Content-Type: text/plain; charset=utf-8');
    echo "MySQL connection failed. Start Laragon's MySQL service, import database.sql, and check config/database.php settings.";
    exit;
}

function ensureUserAccessSchema(PDO $pdo): void
{
    $columns = $pdo->query("SHOW COLUMNS FROM users LIKE 'access_level'")->fetch();
    if (!$columns) {
        $pdo->exec('ALTER TABLE users ADD COLUMN access_level TINYINT UNSIGNED NOT NULL DEFAULT 2');
        $pdo->exec("UPDATE users SET access_level = CASE WHEN LOWER(username) = 'tester' THEN 0 WHEN LOWER(username) = 'faiz' THEN 1 ELSE 2 END");
    }
    if (!$pdo->query("SHOW COLUMNS FROM users LIKE 'page_permissions'")->fetch()) {
        $pdo->exec('ALTER TABLE users ADD COLUMN page_permissions LONGTEXT NULL');
    }
}

ensureUserAccessSchema($pdo);

function jsonResponse(array $data, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

function isValidUsername(string $username): bool
{
    return preg_match('/\A[a-z0-9._]{1,100}\z/', $username) === 1;
}

function normalizeDisplayName(string $displayName): string
{
    return mb_strtoupper(trim($displayName), 'UTF-8');
}

function currentUser(PDO $pdo): ?array
{
    if (empty($_SESSION['username'])) {
        return null;
    }

    $statement = $pdo->prepare(
        'SELECT id, username, display_name, email, unit, active, access_level, page_permissions FROM users WHERE username = ? AND active = 1'
    );
    $statement->execute([$_SESSION['username']]);
    return $statement->fetch() ?: null;
}

function requireApiUser(PDO $pdo): array
{
    $user = currentUser($pdo);
    if (!$user) {
        jsonResponse(['success' => false, 'error' => 'Not authenticated.'], 401);
    }
    return $user;
}

function requireUserManagementAccess(PDO $pdo): array
{
    $user = requireApiUser($pdo);
    if ((int)$user['access_level'] > 1) {
        jsonResponse(['success' => false, 'error' => 'You are not authorized to manage users.'], 403);
    }
    return $user;
}

function defaultPagePermissions(int $accessLevel, string $unit = ''): array
{
    $editable = $accessLevel <= 2;
    $unit = strtoupper(trim($unit));
    $permissions = [
        'dashboard' => ['access' => true, 'edit' => false],
        'recipients' => ['access' => true, 'edit' => $editable],
        'participants' => ['access' => true, 'edit' => $editable],
        'upload' => ['access' => true, 'edit' => $editable],
        'dataset' => ['access' => true, 'edit' => $editable],
        'activity' => ['access' => true, 'edit' => false],
        'account' => ['access' => true, 'edit' => $editable],
        'updates' => ['access' => true, 'edit' => false],
        'bpa' => ['access' => true, 'edit' => false],
        'bpaDashboard' => ['access' => false, 'edit' => false],
        'bpaDashboardBPA' => ['access' => $accessLevel <= 1, 'edit' => false],
        'bpaDashboardUAK' => ['access' => $accessLevel <= 1 || $unit === 'UAK', 'edit' => false],
        'bpaDashboardUPU' => ['access' => $accessLevel <= 1 || $unit === 'UPU', 'edit' => false],
        'bpaDashboardUPA' => ['access' => $accessLevel <= 1 || $unit === 'UPA', 'edit' => false],
        'bpaDashboardULK' => ['access' => $accessLevel <= 1 || $unit === 'ULK', 'edit' => false],
        'bpaBudget' => ['access' => $accessLevel === 0, 'edit' => $editable],
        'bpaSku' => ['access' => $accessLevel === 0, 'edit' => $editable],
        'bpaPrograms' => ['access' => false, 'edit' => false],
        'bpaProgramsBPA' => ['access' => $accessLevel <= 1, 'edit' => false],
        'bpaProgramsUAK' => ['access' => $accessLevel <= 1 || $unit === 'UAK', 'edit' => $editable || $unit === 'UAK'],
        'bpaProgramsUPU' => ['access' => $accessLevel <= 1 || $unit === 'UPU', 'edit' => $editable || $unit === 'UPU'],
        'bpaProgramsUPA' => ['access' => $accessLevel <= 1 || $unit === 'UPA', 'edit' => $editable || $unit === 'UPA'],
        'bpaProgramsULK' => ['access' => $accessLevel <= 1 || $unit === 'ULK', 'edit' => $editable || $unit === 'ULK'],
        'manageUsers' => ['access' => $accessLevel <= 1, 'edit' => $accessLevel <= 1],
    ];
    $permissions['bpaDashboard']['access'] = $permissions['bpaDashboardBPA']['access']
        || $permissions['bpaDashboardUAK']['access']
        || $permissions['bpaDashboardUPU']['access']
        || $permissions['bpaDashboardUPA']['access']
        || $permissions['bpaDashboardULK']['access'];
    $permissions['bpaPrograms']['access'] = $permissions['bpaProgramsBPA']['access']
        || $permissions['bpaProgramsUAK']['access']
        || $permissions['bpaProgramsUPU']['access']
        || $permissions['bpaProgramsUPA']['access']
        || $permissions['bpaProgramsULK']['access'];
    $permissions['bpa']['access'] = $permissions['bpaDashboard']['access']
        || $permissions['bpaBudget']['access']
        || $permissions['bpaSku']['access']
        || $permissions['bpaPrograms']['access'];
    return $permissions;
}

function userPagePermissions(array $user): array
{
    $accessLevel = (int)($user['access_level'] ?? 2);
    $unit = (string)($user['unit'] ?? '');
    if ($accessLevel === 0) {
        return defaultPagePermissions(0, $unit);
    }
    $permissions = defaultPagePermissions($accessLevel, $unit);
    $stored = json_decode((string)($user['page_permissions'] ?? ''), true);
    if (is_array($stored)) {
        foreach ($permissions as $page => $defaults) {
            if (!is_array($stored[$page] ?? null)) {
                continue;
            }
            $permissions[$page]['access'] = filter_var($stored[$page]['access'] ?? $defaults['access'], FILTER_VALIDATE_BOOLEAN);
            $permissions[$page]['edit'] = $defaults['edit']
                && filter_var($stored[$page]['edit'] ?? $defaults['edit'], FILTER_VALIDATE_BOOLEAN);
        }
        if (is_array($stored['bpa'] ?? null) && array_key_exists('access', $stored['bpa'])) {
            $legacyBpaAccess = filter_var($stored['bpa']['access'], FILTER_VALIDATE_BOOLEAN);
            foreach (['bpaBudget', 'bpaSku'] as $page) {
                if (!is_array($stored[$page] ?? null)) {
                    $permissions[$page]['access'] = $legacyBpaAccess;
                }
            }
        }
        foreach (['bpaDashboard', 'bpaPrograms'] as $section) {
            $legacyPermission = is_array($stored[$section] ?? null)
                ? $stored[$section]
                : (is_array($stored['bpa'] ?? null) ? $stored['bpa'] : null);
            $unitCodes = ['BPA', 'UAK', 'UPU', 'UPA', 'ULK'];
            foreach ($unitCodes as $unitCode) {
                $child = $section . $unitCode;
                if (!is_array($stored[$child] ?? null)
                    && is_array($legacyPermission)
                    && array_key_exists('access', $legacyPermission)) {
                    $legacyAccess = filter_var($legacyPermission['access'], FILTER_VALIDATE_BOOLEAN);
                    $permissions[$child]['access'] = $accessLevel <= 1
                        ? $legacyAccess
                        : ($unitCode === strtoupper(trim($unit)) && $legacyAccess);
                }
            }
        }
    }
    foreach (['bpaDashboard', 'bpaPrograms'] as $section) {
        $permissions[$section]['access'] = false;
        foreach (['BPA', 'UAK', 'UPU', 'UPA', 'ULK'] as $unitCode) {
            $permissions[$section]['access'] = $permissions[$section]['access']
                || $permissions[$section . $unitCode]['access'];
        }
    }
    $permissions['bpa']['access'] = $permissions['bpaDashboard']['access']
        || $permissions['bpaBudget']['access']
        || $permissions['bpaSku']['access']
        || $permissions['bpaPrograms']['access'];
    $permissions['manageUsers']['edit'] = $permissions['manageUsers']['access'];
    return $permissions;
}

function normalizeSubmittedPagePermissions(
    mixed $submitted,
    int $accessLevel,
    array $fallback = [],
    string $unit = ''
): array
{
    $defaults = defaultPagePermissions($accessLevel, $unit);
    if ($accessLevel === 0) {
        return $defaults;
    }
    $editablePages = array_keys(array_filter(
        defaultPagePermissions(2),
        static fn(array $permission, string $page): bool => $page !== 'manageUsers' && $permission['edit'],
        ARRAY_FILTER_USE_BOTH
    ));
    $normalized = [];
    foreach ($defaults as $page => $default) {
        $provided = is_array($submitted) && is_array($submitted[$page] ?? null)
            ? $submitted[$page]
            : ($fallback[$page] ?? []);
        if (in_array($page, [
            'bpaDashboardBPA', 'bpaDashboardUAK', 'bpaDashboardUPU', 'bpaDashboardUPA', 'bpaDashboardULK',
            'bpaProgramsBPA', 'bpaProgramsUAK', 'bpaProgramsUPU', 'bpaProgramsUPA', 'bpaProgramsULK',
        ], true) && !isset($provided['access'])) {
            $section = str_starts_with($page, 'bpaDashboard') ? 'bpaDashboard' : 'bpaPrograms';
            $legacy = is_array($submitted) ? ($submitted[$section] ?? null) : null;
            if (!is_array($legacy)) {
                $legacy = $fallback[$section] ?? null;
            }
            if ($accessLevel <= 1 && is_array($legacy) && array_key_exists('access', $legacy)) {
                $provided['access'] = $legacy['access'];
            }
        }
        if (in_array($page, ['bpaBudget', 'bpaSku'], true) && !isset($provided['access'])) {
            $legacy = is_array($submitted) ? ($submitted['bpa'] ?? null) : null;
            if (!is_array($legacy)) {
                $legacy = $fallback['bpa'] ?? null;
            }
            if (is_array($legacy) && array_key_exists('access', $legacy)) {
                $provided['access'] = $legacy['access'];
            }
        }
        $access = filter_var($provided['access'] ?? $default['access'], FILTER_VALIDATE_BOOLEAN);
        $normalized[$page] = [
            'access' => $access,
            'edit' => $page === 'manageUsers'
                ? $access
                : (in_array($page, $editablePages, true)
                    && $access
                    && filter_var($provided['edit'] ?? $default['edit'], FILTER_VALIDATE_BOOLEAN)),
        ];
    }
    $normalized['manageUsers']['edit'] = $normalized['manageUsers']['access'];
    foreach (['bpaDashboard', 'bpaPrograms'] as $section) {
        $normalized[$section]['access'] = false;
        foreach (['BPA', 'UAK', 'UPU', 'UPA', 'ULK'] as $unitCode) {
            $normalized[$section]['access'] = $normalized[$section]['access']
                || $normalized[$section . $unitCode]['access'];
        }
    }
    $normalized['bpa']['access'] = $normalized['bpaDashboard']['access']
        || $normalized['bpaBudget']['access']
        || $normalized['bpaSku']['access']
        || $normalized['bpaPrograms']['access'];
    return $normalized;
}

function deriveAccessLevelFromPermissions(array $permissions, int $requestedLevel, string $unit = ''): int
{
    if ($requestedLevel === 0) {
        return 0;
    }
    if (!empty($permissions['manageUsers']['access'])) {
        return 1;
    }
    $unitCode = strtoupper(trim($unit));
    $unitProgramKey = 'bpaPrograms' . $unitCode;
    $hasOnlyAssignedUnitProgramEdit = in_array($unitCode, ['UAK', 'UPU', 'UPA', 'ULK'], true)
        && !empty($permissions[$unitProgramKey]['access'])
        && !empty($permissions[$unitProgramKey]['edit']);
    if ($hasOnlyAssignedUnitProgramEdit) {
        foreach (defaultPagePermissions(2) as $page => $default) {
            if ($page !== 'manageUsers'
                && $page !== $unitProgramKey
                && $default['edit']
                && !empty($permissions[$page]['access'])
                && !empty($permissions[$page]['edit'])) {
                $hasOnlyAssignedUnitProgramEdit = false;
                break;
            }
        }
    }
    if ($requestedLevel === 3 && $hasOnlyAssignedUnitProgramEdit) {
        return 3;
    }
    foreach (defaultPagePermissions(2) as $page => $default) {
        if ($page !== 'manageUsers'
            && $default['edit']
            && !empty($permissions[$page]['access'])
            && !empty($permissions[$page]['edit'])) {
            return 2;
        }
    }
    return 3;
}

function canAccessUserPage(array $user, string $page): bool
{
    $permissions = userPagePermissions($user);
    return (bool)($permissions[$page]['access'] ?? false);
}

function requiredBpaPageForPath(string $path, ?PDO $pdo = null): string
{
    $route = preg_replace('#^/app-bapim#', '', $path) ?? $path;
    if (preg_match('#^/bpa/(uak|upu|upa|ulk)/dashboard(?:\\.php)?$#i', $route, $match)) {
        return 'bpaDashboard' . strtoupper($match[1]);
    }
    if (preg_match('#^/bpa/admin/dashboard_admin_export_[^/]+(?:\\.php)?$#i', $route)) {
        return 'bpaDashboardBPA';
    }
    if (preg_match('#^/bpa/(?:dashboard|admin/dashboard_admin)(?:\\.php)?$#i', $route)) {
        $unit = strtoupper((string)($_GET['unit'] ?? $_SERVER['HTTP_X_BPA_DASHBOARD_UNIT'] ?? ''));
        return in_array($unit, ['UAK', 'UPU', 'UPA', 'ULK'], true)
            ? 'bpaDashboard' . $unit
            : ($unit === 'BPA' ? 'bpaDashboardBPA' : 'bpaDashboard');
    }
    if (preg_match('#^/bpa/admin/bajet(?:_|/|\\.|$)#i', $route)) {
        return 'bpaBudget';
    }
    if (preg_match('#^/bpa/admin/sku(?:_|/|\\.|$)#i', $route)) {
        return 'bpaSku';
    }
    if (preg_match('#^/bpa/(uak|upu|upa|ulk)/program_#i', $route, $match)) {
        return 'bpaPrograms' . strtoupper($match[1]);
    }
    if (preg_match('#^/bpa/laporan/program_list(?:\\.php)?$#i', $route)) {
        $unit = strtoupper((string)($_GET['unit'] ?? $_SERVER['HTTP_X_BPA_PROGRAM_LIST_UNIT'] ?? ''));
        return in_array($unit, ['UAK', 'UPU', 'UPA', 'ULK'], true)
            ? 'bpaPrograms' . $unit
            : ($unit === 'BPA' ? 'bpaProgramsBPA' : 'bpaPrograms');
    }
    if (preg_match('#^/bpa/laporan/program_export_#i', $route)) {
        $unit = '';
        if (isset($_GET['unit_id']) && (string)$_GET['unit_id'] !== '' && $pdo !== null) {
            $unitId = filter_var($_GET['unit_id'], FILTER_VALIDATE_INT);
            if ($unitId !== false) {
                $statement = $pdo->prepare('SELECT UPPER(nama_unit) FROM unit WHERE unit_id = ? LIMIT 1');
                $statement->execute([$unitId]);
                $unit = (string)($statement->fetchColumn() ?: '');
            }
        }
        return in_array($unit, ['UAK', 'UPU', 'UPA', 'ULK'], true)
            ? 'bpaPrograms' . $unit
            : 'bpaProgramsBPA';
    }
    if (preg_match('#^/bpa/laporan/program_#i', $route)) {
        return 'bpaPrograms';
    }
    return 'bpa';
}

function requirePageCapability(PDO $pdo, string $page, bool $edit = false): array
{
    $user = requireApiUser($pdo);
    if (!canAccessUserPage($user, $page) || ($edit && empty(userPagePermissions($user)[$page]['edit']))) {
        jsonResponse(['success' => false, 'error' => 'You do not have permission to perform this action.'], 403);
    }
    return $user;
}

function requiredPageForPath(string $path): ?string
{
    if ($path === '/') return 'dashboard';
    if ($path === '/penerima-bantuan') return 'recipients';
    if ($path === '/peserta-program') return 'participants';
    if ($path === '/muat-naik') return 'upload';
    if ($path === '/set-data' || preg_match('#^/set-data/\\d+$#', $path)) return 'dataset';
    if ($path === '/aktiviti-pengguna') return 'activity';
    if ($path === '/akaun-pengguna') return 'account';
    if ($path === '/log-perisian') return 'updates';
    if ($path === '/pengurusan-pengguna') return 'manageUsers';
    return null;
}

function requireCsrfToken(array $payload): void
{
    $providedToken = (string)($payload['csrfToken'] ?? '');
    if ($providedToken === '' || !hash_equals(appCsrfToken(), $providedToken)) {
        jsonResponse(['success' => false, 'error' => 'Your session expired. Refresh the page and try again.'], 403);
    }
}

function requestData(): array
{
    $type = $_SERVER['CONTENT_TYPE'] ?? '';
    if (str_contains(strtolower($type), 'application/json')) {
        $decoded = json_decode(file_get_contents('php://input'), true);
        return is_array($decoded) ? $decoded : [];
    }
    return $_POST;
}

function appCsrfToken(): string
{
    if (!isset($_SESSION['app_csrf_token']) || !is_string($_SESSION['app_csrf_token'])) {
        $_SESSION['app_csrf_token'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['app_csrf_token'];
}

function csvRowsFromFile(string $path): array
{
    $handle = fopen($path, 'rb');
    if ($handle === false) {
        throw new RuntimeException('Could not read the dataset CSV file.');
    }

    $rows = [];
    while (($row = fgetcsv($handle, null, ',', '"', '')) !== false) {
        if (count($rows) === 0 && isset($row[0])) {
            $row[0] = preg_replace('/^\xEF\xBB\xBF/', '', (string)$row[0]);
        }
        if (array_filter($row, static fn($value): bool => trim((string)$value) !== '') !== []) {
            $rows[] = array_map(static fn($value): string => (string)($value ?? ''), $row);
        }
    }
    fclose($handle);
    return normalizeRows($rows);
}

function csvRowsFromString(string $csv): array
{
    $stream = fopen('php://temp', 'r+');
    fwrite($stream, preg_replace('/^\xEF\xBB\xBF/', '', $csv) ?? $csv);
    rewind($stream);
    $rows = [];
    while (($row = fgetcsv($stream, null, ',', '"', '')) !== false) {
        if (array_filter($row, static fn($value): bool => trim((string)$value) !== '') !== []) {
            $rows[] = array_map(static fn($value): string => (string)($value ?? ''), $row);
        }
    }
    fclose($stream);
    return normalizeRows($rows);
}

function normalizeRows(array $rows): array
{
    if ($rows === []) {
        return [];
    }
    $width = max(array_map('count', $rows));
    return array_map(static fn(array $row): array => array_pad(array_slice($row, 0, $width), $width, ''), $rows);
}

function ensureRecipientEmploymentStatusColumn(array $rows): array
{
    if ($rows === []) {
        return [];
    }

    $headers = array_map(
        static fn($value): string => strtoupper(trim((string)$value)),
        $rows[0]
    );
    if (in_array('PEKERJAAN', $headers, true) || in_array('STATUS PEKERJAAN', $headers, true)) {
        return normalizeRows($rows);
    }

    $statusIndex = array_search('STATUS', $headers, true);
    $insertIndex = $statusIndex === false ? count($headers) : $statusIndex;
    $width = max(array_map('count', $rows));
    foreach ($rows as $rowIndex => &$row) {
        $row = array_pad($row, $width, '');
        array_splice($row, $insertIndex, 0, [$rowIndex === 0 ? 'PEKERJAAN' : '']);
    }
    unset($row);
    return normalizeRows($rows);
}

function encodeCsv(array $rows): string
{
    $stream = fopen('php://temp', 'r+');
    foreach ($rows as $row) {
        fputcsv($stream, $row, ',', '"', '', "\r\n");
    }
    rewind($stream);
    $csv = stream_get_contents($stream);
    fclose($stream);
    return $csv === false ? '' : $csv;
}

function datasetById(PDO $pdo, int $id): ?array
{
    $statement = $pdo->prepare('SELECT * FROM datasets WHERE id = ?');
    $statement->execute([$id]);
    return $statement->fetch() ?: null;
}

function recordActivity(PDO $pdo, string $username, ?int $datasetId, ?string $datasetName, string $action, ?string $rowId = null, ?string $column = null, ?string $oldValue = null, ?string $newValue = null, int $progress = 0): void
{
    $statement = $pdo->prepare(
        'INSERT INTO user_activity (username, dataset_id, dataset_name, action, row_id, column_name, old_value, new_value, progress_change) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    $statement->execute([$username, $datasetId, $datasetName, $action, $rowId, $column, $oldValue, $newValue, $progress]);
}

function updateCsvDataset(PDO $pdo, array $dataset, array $rows, string $username): array
{
    $oldRows = is_file($dataset['filepath']) ? csvRowsFromFile($dataset['filepath']) : [];
    $headers = array_map(static fn($value): string => strtolower(trim((string)$value)), $rows[0] ?? []);
    $oldHeaders = array_map(static fn($value): string => strtolower(trim((string)$value)), $oldRows[0] ?? []);
    $kpIndex = array_search('kp', $headers, true);
    if ($kpIndex === false) {
        $kpIndex = array_search('kad pengenalan', $headers, true);
    }
    $oldKpIndex = array_search('kp', $oldHeaders, true);
    if ($oldKpIndex === false) {
        $oldKpIndex = array_search('kad pengenalan', $oldHeaders, true);
    }
    $oldMap = [];
    $oldRowNumbers = [];
    foreach (array_slice($oldRows, 1, null, true) as $index => $row) {
        $key = $oldKpIndex !== false && trim($row[$oldKpIndex] ?? '') !== '' ? trim($row[$oldKpIndex]) : 'ROW_' . $index;
        $oldMap[$key] = $row;
        $oldRowNumbers[$key] = $index;
    }
    $newMap = [];
    $newRowNumbers = [];
    foreach (array_slice($rows, 1, null, true) as $index => $row) {
        $key = $kpIndex !== false && trim($row[$kpIndex] ?? '') !== '' ? trim($row[$kpIndex]) : 'ROW_' . $index;
        $newMap[$key] = $row;
        $newRowNumbers[$key] = $index;
    }

    $temporaryPath = $dataset['filepath'] . '.tmp-' . bin2hex(random_bytes(6));
    $backupPath = $dataset['filepath'] . '.bak-' . bin2hex(random_bytes(6));
    $hadOriginal = is_file($dataset['filepath']);
    if ($hadOriginal && !copy($dataset['filepath'], $backupPath)) {
        throw new RuntimeException('Could not protect the current dataset before saving.');
    }

    $pdo->beginTransaction();
    try {
        $csv = encodeCsv($rows);
        if (file_put_contents($temporaryPath, $csv, LOCK_EX) === false || !rename($temporaryPath, $dataset['filepath'])) {
            throw new RuntimeException('Could not save the dataset CSV file.');
        }
        $update = $pdo->prepare(
            "UPDATE datasets SET row_count = ?, column_count = ?, file_size = ?, version = version + 1, updated_at = NOW(), sync_status = 'modified' WHERE id = ?"
        );
        $update->execute([max(count($rows) - 1, 0), count($rows[0] ?? []), strlen($csv), $dataset['id']]);

        foreach ($newMap as $key => $row) {
            if (isset($oldMap[$key])) {
                continue;
            }
            foreach ($row as $columnIndex => $value) {
                if ((string)$value === '') {
                    continue;
                }
                $column = $rows[0][$columnIndex] ?? 'Column ' . ($columnIndex + 1);
                $isStatus = strtolower(trim((string)$column)) === 'status';
                $oldValue = '';
                $newValue = (string)$value;
                $progress = $isStatus ? 1 : 0;
                recordActivity($pdo, $username, (int)$dataset['id'], $dataset['name'], $isStatus ? 'status_change' : 'add', (string)$newRowNumbers[$key], (string)$column, $oldValue, $newValue, $progress);
            }
        }
        $updateUser = $pdo->prepare('SELECT display_name FROM users WHERE username = ?');
        $updateUser->execute([$_SESSION['username'] ?? '']);
        $activityUsername = (string)($updateUser->fetchColumn() ?: $username);
        foreach ($newMap as $key => $row) {
            if (!isset($oldMap[$key])) {
                continue;
            }
            foreach ($row as $columnIndex => $value) {
                $previous = (string)($oldMap[$key][$columnIndex] ?? '');
                $value = (string)$value;
                if ($previous === $value) {
                    continue;
                }
                $column = $rows[0][$columnIndex] ?? 'Column ' . ($columnIndex + 1);
                $isStatus = strtolower(trim((string)$column)) === 'status';
                $progress = $isStatus ? (int)(trim($previous) === '' && trim($value) !== '') - (int)(trim($previous) !== '' && trim($value) === '') : 0;
                recordActivity($pdo, $activityUsername, (int)$dataset['id'], $dataset['name'], $isStatus ? 'status_change' : 'UPDATE', (string)$newRowNumbers[$key], (string)$column, $previous, $value, $progress);
            }
        }
        foreach ($oldMap as $key => $row) {
            if (!isset($newMap[$key])) {
                recordActivity($pdo, $activityUsername, (int)$dataset['id'], $dataset['name'], 'delete', (string)$oldRowNumbers[$key]);
            }
        }
        $pdo->commit();
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        if ($hadOriginal && is_file($backupPath)) {
            copy($backupPath, $dataset['filepath']);
        } elseif (!$hadOriginal && is_file($dataset['filepath'])) {
            unlink($dataset['filepath']);
        }
        if (is_file($temporaryPath)) {
            unlink($temporaryPath);
        }
        if (is_file($backupPath)) {
            unlink($backupPath);
        }
        throw $error;
    }
    if (is_file($backupPath)) {
        unlink($backupPath);
    }
    return datasetById($pdo, (int)$dataset['id']) ?? $dataset;
}

function editMappedRecord(PDO $pdo, array $payload, string $username, bool $participant, bool $delete): void
{
    $record = is_array($payload['record'] ?? null) ? $payload['record'] : $payload;
    if ($participant) {
        $identity = trim((string)($record['kadPengenalan'] ?? $record['KAD PENGENALAN'] ?? ''));
        if ($identity === '') {
            jsonResponse(['success' => false, 'error' => 'kadPengenalan is required.'], 400);
        }
        $datasets = $pdo->query('SELECT * FROM datasets ORDER BY id')->fetchAll();
        $changedRows = 0;
        $filesChanged = 0;
        foreach ($datasets as $dataset) {
            if (!is_file($dataset['filepath'])) {
                continue;
            }
            $rows = csvRowsFromFile($dataset['filepath']);
            if ($rows === []) {
                continue;
            }
            $headers = array_map(static fn($value): string => strtoupper(trim((string)$value)), $rows[0]);
            if (!in_array('NAMA', $headers, true) || !in_array('KAD PENGENALAN', $headers, true) || !in_array('PROGRAM', $headers, true)) {
                continue;
            }
            $identityIndex = array_search('KAD PENGENALAN', $headers, true);
            $programIndex = array_search('PROGRAM', $headers, true);
            $categoryIndex = array_search('KATEGORI', $headers, true);
            if ($categoryIndex === false) {
                $categoryIndex = array_search('KETEGORI', $headers, true);
            }
            $nameIndex = array_search('NAMA', $headers, true);
            $changes = is_array($payload['changes'] ?? null) ? $payload['changes'] : [];
            $matched = 0;
            foreach ($rows as $index => &$row) {
                if ($index === 0 || trim($row[$identityIndex] ?? '') !== $identity) {
                    continue;
                }
                $matched++;
                if (!$delete) {
                    foreach ($changes as $key => $value) {
                        $normalizedKey = strtolower(preg_replace('/[^a-z0-9]/i', '', (string)$key) ?? '');
                        $columnIndex = match ($normalizedKey) {
                            'nama' => $nameIndex,
                            'kadpengenalan', 'kp' => $identityIndex,
                            'kategori', 'ketegori' => $categoryIndex,
                            'program', 'programs' => $programIndex,
                            default => false,
                        };
                        if ($columnIndex !== false) {
                            $row[$columnIndex] = (string)$value;
                        }
                    }
                }
            }
            unset($row);
            if ($matched === 0) {
                continue;
            }
            if ($delete) {
                $rows = array_values(array_filter($rows, static fn($row, $index): bool => $index === 0 || trim($row[$identityIndex] ?? '') !== $identity, ARRAY_FILTER_USE_BOTH));
            }
            updateCsvDataset($pdo, $dataset, normalizeRows($rows), $username);
            $changedRows += $matched;
            $filesChanged++;
        }
        if ($changedRows === 0) {
            jsonResponse(['success' => false, 'error' => 'Participant record not found.'], 404);
        }
        jsonResponse(['success' => true, ($delete ? 'deleted' : 'updated') => true, 'filesChanged' => $filesChanged, 'rowsChanged' => $changedRows]);
    }

    $source = $record['sourceRecords'][0] ?? $record;
    $datasetId = filter_var($source['datasetId'] ?? $record['datasetId'] ?? null, FILTER_VALIDATE_INT);
    $rowIndex = filter_var($source['rowIndex'] ?? $record['rowIndex'] ?? null, FILTER_VALIDATE_INT);
    $dataset = $datasetId ? datasetById($pdo, (int)$datasetId) : null;
    if (!$dataset || !is_file($dataset['filepath'])) {
        jsonResponse(['success' => false, 'error' => 'Source dataset not found.'], 404);
    }
    $rows = csvRowsFromFile($dataset['filepath']);
    if ($rowIndex === false || $rowIndex < 1 || $rowIndex >= count($rows)) {
        jsonResponse(['success' => false, 'error' => 'Source record not found.'], 404);
    }
    $headers = array_map(static fn($value): string => strtoupper(trim((string)$value)), $rows[0]);
    if (in_array('NAMA', $headers, true) && in_array('KAD PENGENALAN', $headers, true) && in_array('PROGRAM', $headers, true)) {
        jsonResponse(['success' => false, 'error' => 'The source record is a participant record.'], 400);
    }
    if (!in_array('NAMA', $headers, true) && !in_array('KAD PENGENALAN', $headers, true)) {
        jsonResponse(['success' => false, 'error' => 'The source dataset is not a recipient dataset.'], 400);
    }
    if ($delete) {
        array_splice($rows, $rowIndex, 1);
    } else {
        foreach (($payload['changes'] ?? []) as $key => $value) {
            $normalizedKey = preg_replace('/[^A-Z0-9]/', '', strtoupper((string)$key));
            $columnIndex = false;
            foreach ($headers as $headerIndex => $header) {
                $normalizedHeader = preg_replace('/[^A-Z0-9]/', '', $header);
                $employmentHeader = in_array($normalizedHeader, ['PEKERJAAN', 'STATUSPEKERJAAN'], true);
                $employmentKey = in_array($normalizedKey, ['PEKERJAAN', 'STATUSPEKERJAAN'], true);
                if (
                    $normalizedHeader === $normalizedKey ||
                    ($employmentHeader && $employmentKey)
                ) {
                    $columnIndex = $headerIndex;
                    break;
                }
            }
            if ($columnIndex !== false) {
                $rows[$rowIndex][$columnIndex] = (string)$value;
            }
        }
    }
    updateCsvDataset($pdo, $dataset, normalizeRows($rows), $username);
    jsonResponse(['success' => true, ($delete ? 'deleted' : 'updated') => true, 'datasetId' => (int)$dataset['id'], 'rowIndex' => $rowIndex]);
}

function runApi(PDO $pdo, string $path, string $method, string $storageDirectory): never
{
    $payload = requestData();
    $query = $_GET;
    $username = (string)($_SESSION['username'] ?? 'Unknown');
    $user = currentUser($pdo);

    if ($path === '/api/app-update/check' && $method === 'GET') {
        requirePageCapability($pdo, 'updates');
        try {
            $latest = bapimLatestGitHubCommit();
            $installed = bapimInstalledCommit(dirname($storageDirectory));
        } catch (Throwable $error) {
            error_log('App update check failed: ' . $error->getMessage());
            jsonResponse(['success' => false, 'error' => $error->getMessage()], 502);
        }
        jsonResponse([
            'success' => true,
            'available' => !hash_equals($installed, $latest['sha']),
            'installedCommit' => $installed,
            'latestCommit' => $latest['sha'],
        ]);
    }
    if ($path === '/api/app-update/install' && $method === 'POST') {
        $updater = requireApiUser($pdo);
        if ((int)$updater['access_level'] !== 0) {
            jsonResponse(['success' => false, 'error' => 'Only a dev can install application updates.'], 403);
        }
        $providedToken = (string)($payload['csrfToken'] ?? '');
        if ($providedToken === '' || !hash_equals(appCsrfToken(), $providedToken)) {
            jsonResponse(['success' => false, 'error' => 'Your session expired. Refresh the page and try again.'], 403);
        }
        $commit = (string)($payload['commit'] ?? '');
        if (!preg_match('/^[a-f0-9]{40}$/i', $commit)) {
            jsonResponse(['success' => false, 'error' => 'The requested update version is invalid.'], 400);
        }
        try {
            $result = bapimApplyGitHubUpdate(__DIR__, dirname($storageDirectory), $commit, $pdo);
        } catch (Throwable $error) {
            error_log('App update installation failed: ' . $error->getMessage());
            $status = $error->getMessage() === 'The app is already up to date.' ? 409 : 500;
            jsonResponse(['success' => false, 'error' => $error->getMessage()], $status);
        }
        jsonResponse(['success' => true, ...$result]);
    }

    if ($path === '/api/auth/start' && $method === 'GET') {
        jsonResponse(['success' => true, 'online' => true, 'hasCachedUsers' => false, 'users' => []]);
    }
    if ($path === '/api/auth/me' && $method === 'GET') {
        if (!$user) {
            jsonResponse(['success' => false, 'error' => 'Not authenticated.'], 401);
        }
        jsonResponse([
            'success' => true,
            'username' => $user['username'],
            'displayName' => $user['display_name'],
            'email' => $user['email'],
            'unit' => $user['unit'],
            'accessLevel' => (int)$user['access_level'],
            'permissions' => userPagePermissions($user),
        ]);
    }
    if ($path === '/api/auth/account' && $method === 'PUT') {
        $account = requirePageCapability($pdo, 'account', true);
        $providedToken = (string)($payload['csrfToken'] ?? '');
        if ($providedToken === '' || !hash_equals(appCsrfToken(), $providedToken)) {
            jsonResponse(['success' => false, 'error' => 'Your session expired. Refresh the page and try again.'], 403);
        }

        $displayName = normalizeDisplayName((string)($payload['displayName'] ?? ''));
        $email = trim((string)($payload['email'] ?? $account['email'] ?? ''));
        $currentPassword = (string)($payload['currentPassword'] ?? '');
        $newPassword = (string)($payload['newPassword'] ?? '');
        $confirmPassword = (string)($payload['confirmPassword'] ?? '');
        if ($displayName === '' || strlen($displayName) > 160) {
            jsonResponse(['success' => false, 'error' => 'Display name is required and must be 160 characters or fewer.'], 400);
        }
        if (strlen($email) > 254 || ($email !== '' && filter_var($email, FILTER_VALIDATE_EMAIL) === false)) {
            jsonResponse(['success' => false, 'error' => 'Alamat e-mel tidak sah.'], 400);
        }
        if ($newPassword !== '') {
            if ($newPassword !== $confirmPassword) {
                jsonResponse(['success' => false, 'error' => 'The new password confirmation does not match.'], 400);
            }
            $statement = $pdo->prepare('SELECT password_hash FROM users WHERE username = ? AND active = 1 LIMIT 1');
            $statement->execute([$account['username']]);
            $passwordHash = $statement->fetchColumn();
            if (!is_string($passwordHash) || $currentPassword === '' || !password_verify($currentPassword, $passwordHash)) {
                jsonResponse(['success' => false, 'error' => 'Your current password is incorrect.'], 403);
            }
        }

        if ($newPassword !== '') {
            $statement = $pdo->prepare('UPDATE users SET display_name = ?, email = ?, password_hash = ? WHERE username = ? AND active = 1');
            $statement->execute([$displayName, $email, password_hash($newPassword, PASSWORD_DEFAULT), $account['username']]);
        } else {
            $statement = $pdo->prepare('UPDATE users SET display_name = ?, email = ? WHERE username = ? AND active = 1');
            $statement->execute([$displayName, $email, $account['username']]);
        }
        jsonResponse(['success' => true, 'displayName' => $displayName, 'email' => $email, 'unit' => $account['unit']]);
    }
    if ($path === '/api/auth/login' && $method === 'POST') {
        $loginName = trim((string)($payload['username'] ?? ''));
        $password = (string)($payload['password'] ?? '');
        if ($loginName === '' || $password === '') {
            jsonResponse(['success' => false, 'error' => 'Username or email and password are required.'], 400);
        }
        if (str_contains($loginName, '@')) {
            if (strlen($loginName) > 254 || filter_var($loginName, FILTER_VALIDATE_EMAIL) === false) {
                jsonResponse(['success' => false, 'error' => 'Sila masukkan username atau alamat e-mel yang sah.'], 400);
            }
            $statement = $pdo->prepare('SELECT username, display_name, password_hash, active FROM users WHERE email = ? LIMIT 1');
        } else {
            if (!isValidUsername($loginName)) {
                jsonResponse(['success' => false, 'error' => 'Username hanya boleh mengandungi huruf kecil, nombor, titik (.) dan garis bawah (_).'], 400);
            }
            $statement = $pdo->prepare('SELECT username, display_name, password_hash, active FROM users WHERE username = ? LIMIT 1');
        }
        $statement->execute([$loginName]);
        $account = $statement->fetch();
        if (!$account || !(int)$account['active'] || !password_verify($password, $account['password_hash'])) {
            jsonResponse(['success' => false, 'error' => 'Invalid username or password.'], 401);
        }
        session_regenerate_id(true);
        $_SESSION['username'] = $account['username'];
        $statement = $pdo->prepare('INSERT INTO login_history (username) VALUES (?)');
        $statement->execute([$account['username']]);
        jsonResponse(['success' => true, 'online' => true, 'username' => $account['username'], 'displayName' => $account['display_name']]);
    }
    if ($path === '/api/auth/offline-login' && $method === 'POST') {
        jsonResponse(['success' => false, 'error' => 'Please sign in with your username and password.'], 401);
    }
    if ($path === '/api/auth/session' && $method === 'POST') {
        if (!$user) {
            jsonResponse(['success' => false, 'error' => 'Please sign in with your username and password.'], 401);
        }
        jsonResponse(['success' => true, 'username' => $user['username'], 'displayName' => $user['display_name']]);
    }
    if ($path === '/api/auth/create-account' && $method === 'POST') {
        $name = (string)($payload['username'] ?? '');
        $email = trim((string)($payload['email'] ?? ''));
        $displayName = normalizeDisplayName((string)($payload['displayName'] ?? ''));
        $password = (string)($payload['password'] ?? '');
        if ($name === '' || $email === '' || $displayName === '' || $password === '') {
            jsonResponse(['success' => false, 'error' => 'All fields are required.'], 400);
        }
        if (!isValidUsername($name)) {
            jsonResponse(['success' => false, 'error' => 'Nama pengguna hanya boleh mengandungi huruf kecil, nombor, titik (.) dan garis bawah (_).'], 400);
        }
        if (strlen($displayName) > 160) {
            jsonResponse(['success' => false, 'error' => 'Display name must be 160 characters or fewer.'], 400);
        }
        if (strlen($email) > 254 || filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
            jsonResponse(['success' => false, 'error' => 'Sila masukkan alamat e-mel yang sah.'], 400);
        }
        try {
            $statement = $pdo->prepare('INSERT INTO users (username, display_name, email, password_hash, access_level) VALUES (?, ?, ?, ?, 3)');
            $statement->execute([$name, $displayName, $email, password_hash($password, PASSWORD_DEFAULT)]);
        } catch (PDOException $error) {
            if ($error->getCode() === '23000') {
                jsonResponse(['success' => false, 'error' => 'Username already exists.'], 409);
            }
            throw $error;
        }
        session_regenerate_id(true);
        $_SESSION['username'] = $name;
        jsonResponse(['success' => true, 'username' => $name, 'displayName' => $displayName, 'email' => $email], 201);
    }
    if ($path === '/api/auth/logout' && $method === 'POST') {
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $parameters = session_get_cookie_params();
            setcookie(session_name(), '', ['expires' => time() - 42000, 'path' => $parameters['path'], 'domain' => $parameters['domain'], 'secure' => $parameters['secure'], 'httponly' => $parameters['httponly'], 'samesite' => 'Lax']);
        }
        session_destroy();
        jsonResponse(['success' => true]);
    }
    if ($path === '/api/auth/sync-history' && $method === 'POST') {
        jsonResponse(['success' => false, 'error' => 'Cloud activity sync is not configured in the PHP/MySQL version.'], 501);
    }
    if (preg_match('#^/api/auth/users/([^/]+)$#', $path, $matches) && $method === 'DELETE') {
        $account = requireApiUser($pdo);
        $targetUsername = rawurldecode($matches[1]);
        if ($targetUsername !== $account['username']) {
            jsonResponse(['success' => false, 'error' => 'You can only remove your own local account.'], 403);
        }
        if ((int)$account['access_level'] === 0) {
            $activeDevs = (int)$pdo->query('SELECT COUNT(*) FROM users WHERE active = 1 AND access_level = 0')->fetchColumn();
            if ($activeDevs <= 1) {
                jsonResponse(['success' => false, 'error' => 'At least one active dev account must remain.'], 400);
            }
        }
        $statement = $pdo->prepare('UPDATE users SET active = 0 WHERE username = ?');
        $statement->execute([$targetUsername]);
        jsonResponse(['success' => true]);
    }
    if ($path === '/api/auth/users' && $method === 'GET') {
        requireApiUser($pdo);
        $users = $pdo->query('SELECT username, display_name AS displayName FROM users WHERE active = 1 ORDER BY display_name')->fetchAll();
        jsonResponse(['success' => true, 'users' => $users]);
    }
    if ($path === '/api/admin/users' && $method === 'GET') {
        requirePageCapability($pdo, 'manageUsers');
        $users = $pdo->query('SELECT id, username, display_name AS displayName, email, unit, active, access_level AS accessLevel, page_permissions AS pagePermissions, created_at AS createdAt FROM users ORDER BY active DESC, display_name, username')->fetchAll();
        foreach ($users as &$managedUser) {
            $managedUser['accessLevel'] = (int)$managedUser['accessLevel'];
            $managedUser['permissions'] = userPagePermissions([
                'access_level' => $managedUser['accessLevel'],
                'unit' => $managedUser['unit'],
                'page_permissions' => $managedUser['pagePermissions'],
            ]);
            unset($managedUser['pagePermissions']);
        }
        unset($managedUser);
        jsonResponse(['success' => true, 'users' => $users]);
    }
    if ($path === '/api/admin/users' && $method === 'POST') {
        $manager = requirePageCapability($pdo, 'manageUsers', true);
        requireCsrfToken($payload);
        $newUsername = (string)($payload['username'] ?? '');
        $displayName = normalizeDisplayName((string)($payload['displayName'] ?? ''));
        $email = trim((string)($payload['email'] ?? ''));
        $unit = trim((string)($payload['unit'] ?? ''));
        $password = (string)($payload['password'] ?? '');
        $accessLevel = filter_var($payload['accessLevel'] ?? 3, FILTER_VALIDATE_INT);
        if (!isValidUsername($newUsername)) {
            jsonResponse(['success' => false, 'error' => 'Nama pengguna hanya boleh mengandungi huruf kecil, nombor, titik (.) dan garis bawah (_).'], 400);
        }
        if ($displayName === '' || strlen($displayName) > 160) {
            jsonResponse(['success' => false, 'error' => 'Nama paparan diperlukan dan tidak boleh melebihi 160 aksara.'], 400);
        }
        if (strlen($email) > 254 || ($email !== '' && filter_var($email, FILTER_VALIDATE_EMAIL) === false)) {
            jsonResponse(['success' => false, 'error' => 'Alamat e-mel tidak sah.'], 400);
        }
        if (!in_array($unit, ['', 'UAK', 'UPU', 'UPA', 'ULK', 'UPP'], true)) {
            jsonResponse(['success' => false, 'error' => 'Unit yang dipilih tidak sah.'], 400);
        }
        if ($password === '') {
            jsonResponse(['success' => false, 'error' => 'Password is required.'], 400);
        }
        if ($accessLevel === false || $accessLevel < 0 || $accessLevel > 3 || ($accessLevel === 0 && (int)$manager['access_level'] !== 0)) {
            jsonResponse(['success' => false, 'error' => 'You are not allowed to assign that access level.'], 403);
        }
        $permissions = normalizeSubmittedPagePermissions($payload['permissions'] ?? null, $accessLevel, [], $unit);
        if ($accessLevel !== 0) {
            $accessLevel = deriveAccessLevelFromPermissions($permissions, $accessLevel, $unit);
            $permissions = normalizeSubmittedPagePermissions($permissions, $accessLevel, [], $unit);
        }
        try {
            $statement = $pdo->prepare('INSERT INTO users (username, display_name, email, unit, password_hash, access_level, page_permissions) VALUES (?, ?, ?, ?, ?, ?, ?)');
            $statement->execute([$newUsername, $displayName, $email, $unit, password_hash($password, PASSWORD_DEFAULT), $accessLevel, json_encode($permissions, JSON_THROW_ON_ERROR)]);
        } catch (PDOException $error) {
            if ($error->getCode() === '23000') {
                jsonResponse(['success' => false, 'error' => 'That username already exists.'], 409);
            }
            throw $error;
        }
        jsonResponse(['success' => true, 'id' => (int)$pdo->lastInsertId()], 201);
    }
    if (preg_match('#^/api/admin/users/(\d+)$#', $path, $matches) && $method === 'PUT') {
        $manager = requirePageCapability($pdo, 'manageUsers', true);
        requireCsrfToken($payload);
        $targetId = (int)$matches[1];
        $statement = $pdo->prepare('SELECT id, username, email, unit, active, access_level, page_permissions FROM users WHERE id = ? LIMIT 1');
        $statement->execute([$targetId]);
        $target = $statement->fetch();
        if (!$target) {
            jsonResponse(['success' => false, 'error' => 'User not found.'], 404);
        }
        $newUsername = array_key_exists('username', $payload)
            ? (string)$payload['username']
            : (string)$target['username'];
        $usernameChanged = $newUsername !== (string)$target['username'];
        if ($usernameChanged && (int)$manager['access_level'] !== 0) {
            jsonResponse(['success' => false, 'error' => 'Only a dev can change a username.'], 403);
        }
        if ($usernameChanged && !isValidUsername($newUsername)) {
            jsonResponse(['success' => false, 'error' => 'Nama pengguna hanya boleh mengandungi huruf kecil, nombor, titik (.) dan garis bawah (_).'], 400);
        }
        $displayName = normalizeDisplayName((string)($payload['displayName'] ?? ''));
        $password = (string)($payload['password'] ?? '');
        $accessLevel = filter_var($payload['accessLevel'] ?? $target['access_level'], FILTER_VALIDATE_INT);
        if ($displayName === '' || strlen($displayName) > 160) {
            jsonResponse(['success' => false, 'error' => 'Display name is required and must be 160 characters or fewer.'], 400);
        }
        $email = trim((string)($payload['email'] ?? $target['email']));
        if (strlen($email) > 254 || ($email !== '' && filter_var($email, FILTER_VALIDATE_EMAIL) === false)) {
            jsonResponse(['success' => false, 'error' => 'Alamat e-mel tidak sah.'], 400);
        }
        $unit = trim((string)($payload['unit'] ?? $target['unit']));
        if (!in_array($unit, ['', 'UAK', 'UPU', 'UPA', 'ULK', 'UPP'], true)) {
            jsonResponse(['success' => false, 'error' => 'Unit yang dipilih tidak sah.'], 400);
        }
        if ($accessLevel === false || $accessLevel < 0 || $accessLevel > 3 || ($accessLevel === 0 && (int)$manager['access_level'] !== 0)) {
            jsonResponse(['success' => false, 'error' => 'You are not allowed to assign that access level.'], 403);
        }
        $permissions = normalizeSubmittedPagePermissions(
            $payload['permissions'] ?? null,
            $accessLevel,
            userPagePermissions($target),
            $unit
        );
        if ($accessLevel !== 0) {
            $accessLevel = deriveAccessLevelFromPermissions($permissions, $accessLevel, $unit);
            $permissions = normalizeSubmittedPagePermissions($permissions, $accessLevel, [], $unit);
        }
        if ((int)$target['access_level'] <= 1
            && (int)$manager['access_level'] !== 0
            && (int)$target['id'] !== (int)$manager['id']) {
            jsonResponse(['success' => false, 'error' => 'Only a dev can change an admin or dev account.'], 403);
        }
        if ((int)$manager['access_level'] === 1 && (int)$target['id'] === (int)$manager['id'] && $accessLevel !== 1) {
            jsonResponse(['success' => false, 'error' => 'An admin cannot remove their own admin access.'], 400);
        }
        $active = isset($payload['active']) ? filter_var($payload['active'], FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE) : (bool)$target['active'];
        if ($active === null) {
            jsonResponse(['success' => false, 'error' => 'User status is invalid.'], 400);
        }
        if (!$active && (int)$target['id'] === (int)$manager['id']) {
            jsonResponse(['success' => false, 'error' => 'You cannot deactivate your own account.'], 400);
        }
        if (!$active && (int)$target['access_level'] <= 1 && (int)$manager['access_level'] !== 0) {
            jsonResponse(['success' => false, 'error' => 'Only a dev can deactivate an admin or dev account.'], 403);
        }
        if ((int)$target['access_level'] === 0 && (!$active || $accessLevel !== 0)) {
            $activeDevs = (int)$pdo->query('SELECT COUNT(*) FROM users WHERE active = 1 AND access_level = 0')->fetchColumn();
            if ($activeDevs <= 1) {
                jsonResponse(['success' => false, 'error' => 'At least one active dev account must remain.'], 400);
            }
        }
        $encodedPermissions = json_encode($permissions, JSON_THROW_ON_ERROR);
        try {
            $pdo->beginTransaction();
            if ($password !== '') {
                $statement = $pdo->prepare('UPDATE users SET username = ?, display_name = ?, email = ?, unit = ?, password_hash = ?, active = ?, access_level = ?, page_permissions = ? WHERE id = ?');
                $statement->execute([$newUsername, $displayName, $email, $unit, password_hash($password, PASSWORD_DEFAULT), (int)$active, $accessLevel, $encodedPermissions, $targetId]);
            } else {
                $statement = $pdo->prepare('UPDATE users SET username = ?, display_name = ?, email = ?, unit = ?, active = ?, access_level = ?, page_permissions = ? WHERE id = ?');
                $statement->execute([$newUsername, $displayName, $email, $unit, (int)$active, $accessLevel, $encodedPermissions, $targetId]);
            }
            if ($usernameChanged) {
                $statement = $pdo->prepare('UPDATE login_history SET username = ? WHERE username = ?');
                $statement->execute([$newUsername, $target['username']]);
                $statement = $pdo->prepare('UPDATE user_activity SET username = ? WHERE username = ?');
                $statement->execute([$newUsername, $target['username']]);
            }
            $pdo->commit();
        } catch (PDOException $error) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            if ($usernameChanged && $error->getCode() === '23000') {
                jsonResponse(['success' => false, 'error' => 'Nama pengguna itu sudah digunakan.'], 409);
            }
            throw $error;
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $error;
        }
        if ((int)$target['id'] === (int)$manager['id'] && $usernameChanged) {
            $_SESSION['username'] = $newUsername;
        }
        jsonResponse(['success' => true, 'username' => $newUsername, 'email' => $email, 'unit' => $unit]);
    }
    if (preg_match('#^/api/admin/users/(\d+)$#', $path, $matches) && $method === 'DELETE') {
        $manager = requirePageCapability($pdo, 'manageUsers', true);
        requireCsrfToken($payload);
        $targetId = (int)$matches[1];
        $statement = $pdo->prepare('SELECT username, active, access_level FROM users WHERE id = ? LIMIT 1');
        $statement->execute([$targetId]);
        $target = $statement->fetch();
        if (!$target) {
            jsonResponse(['success' => false, 'error' => 'User not found.'], 404);
        }
        if ((int)$targetId === (int)$manager['id']) {
            jsonResponse(['success' => false, 'error' => 'You cannot deactivate your own account.'], 400);
        }
        if ((int)$target['access_level'] <= 1 && (int)$manager['access_level'] !== 0) {
            jsonResponse(['success' => false, 'error' => 'Only a dev can deactivate an admin or dev account.'], 403);
        }
        if ((int)$target['access_level'] === 0) {
            $activeDevs = (int)$pdo->query('SELECT COUNT(*) FROM users WHERE active = 1 AND access_level = 0')->fetchColumn();
            if ($activeDevs <= 1) {
                jsonResponse(['success' => false, 'error' => 'At least one active dev account must remain.'], 400);
            }
        }
        $statement = $pdo->prepare('UPDATE users SET active = 0 WHERE id = ?');
        $statement->execute([$targetId]);
        jsonResponse(['success' => true]);
    }

    if ($path === '/api/datasets' && $method === 'GET') {
        $user = requireApiUser($pdo);
        if (!canAccessUserPage($user, 'upload') && !canAccessUserPage($user, 'dashboard')) {
            jsonResponse(['success' => false, 'error' => 'You do not have permission to view datasets.'], 403);
        }
        jsonResponse($pdo->query('SELECT id, name, filename, row_count, column_count, file_size, version, created_at, updated_at, remote_version, last_synced_at, sync_status, dataset_type FROM datasets ORDER BY updated_at DESC')->fetchAll());
    }
    if (preg_match('#^/api/datasets/(\d+)(?:/columns)?$#', $path, $matches) && $method === 'GET') {
        requirePageCapability($pdo, 'dataset');
        $dataset = datasetById($pdo, (int)$matches[1]);
        if (!$dataset || !is_file($dataset['filepath'])) {
            jsonResponse(['success' => false, 'error' => 'Dataset not found.'], 404);
        }
        $rows = csvRowsFromFile($dataset['filepath']);
        if (str_ends_with($path, '/columns')) {
            jsonResponse(['success' => true, 'columns' => array_map(static fn($index, $value): array => ['index' => $index, 'name' => $value !== '' ? $value : 'Column ' . ($index + 1)], array_keys($rows[0] ?? []), $rows[0] ?? [])]);
        }
        $csv = file_get_contents($dataset['filepath']) ?: '';
        unset($dataset['filepath']);
        jsonResponse(['success' => true, ...$dataset, 'csv' => $csv]);
    }
    if ($path === '/api/dashboard/summary' && $method === 'GET') {
        requirePageCapability($pdo, 'dashboard');
        $summary = $pdo->query('SELECT COUNT(*) AS totalDatasets, COALESCE(SUM(row_count), 0) AS totalRecords, COALESCE(SUM(file_size), 0) AS uploadSize FROM datasets')->fetch();
        $summary['success'] = true;
        $summary['totalColumns'] = 0;
        $summary['databaseSize'] = 0;
        $summary['recent'] = $pdo->query('SELECT id, name, filename, row_count, column_count, file_size, version, created_at, updated_at, sync_status FROM datasets ORDER BY updated_at DESC LIMIT 5')->fetchAll();
        jsonResponse($summary);
    }
    if ($path === '/api/peserta-program' && $method === 'GET') {
        $user = requireApiUser($pdo);
        if (!canAccessUserPage($user, 'participants') && !canAccessUserPage($user, 'dashboard')) {
            jsonResponse(['success' => false, 'error' => 'You do not have permission to view participant records.'], 403);
        }
        $participants = [];
        foreach ($pdo->query('SELECT * FROM datasets ORDER BY updated_at DESC')->fetchAll() as $dataset) {
            if (!is_file($dataset['filepath'])) {
                continue;
            }
            $rows = csvRowsFromFile($dataset['filepath']);
            if (count($rows) < 2) {
                continue;
            }
            $headers = array_map(static fn($value): string => strtoupper(trim($value)), $rows[0]);
            if (!in_array('NAMA', $headers, true) || !in_array('KAD PENGENALAN', $headers, true) || !in_array('PROGRAM', $headers, true)) {
                continue;
            }
            $nameIndex = array_search('NAMA', $headers, true);
            $identityIndex = array_search('KAD PENGENALAN', $headers, true);
            $categoryIndex = array_search('KATEGORI', $headers, true);
            if ($categoryIndex === false) {
                $categoryIndex = array_search('KETEGORI', $headers, true);
            }
            $programIndex = array_search('PROGRAM', $headers, true);
            $unitIndex = array_search('UNIT', $headers, true);
            foreach (array_slice($rows, 1, null, true) as $rowIndex => $row) {
                $identity = trim($row[$identityIndex] ?? '');
                if ($identity === '') {
                    continue;
                }
                if (!isset($participants[$identity])) {
                    $participants[$identity] = ['nama' => trim($row[$nameIndex] ?? ''), 'kadPengenalan' => $identity, 'ketegori' => $categoryIndex !== false ? trim($row[$categoryIndex] ?? '') : '', 'programs' => [], 'units' => [], 'sourceFiles' => [], 'sourceRecords' => []];
                }
                $item = &$participants[$identity];
                $unit = $unitIndex !== false ? trim($row[$unitIndex] ?? '') : '';
                if ($unit !== '' && !in_array($unit, $item['units'], true)) {
                    $item['units'][] = $unit;
                }
                if (!in_array($dataset['filename'], $item['sourceFiles'], true)) {
                    $item['sourceFiles'][] = $dataset['filename'];
                }
                $item['sourceRecords'][] = ['datasetId' => (int)$dataset['id'], 'rowIndex' => $rowIndex, 'sourceFile' => $dataset['filename']];
                $program = trim($row[$programIndex] ?? '');
                if ($program !== '') {
                    foreach (explode(',', $program) as $part) {
                        $part = trim($part);
                        if ($part !== '' && !in_array($part, $item['programs'], true)) {
                            $item['programs'][] = $part;
                        }
                    }
                }
                unset($item);
            }
        }
        $output = [];
        foreach (array_values($participants) as $index => $item) {
            $output[] = ['index' => $index + 1, 'nama' => $item['nama'], 'kadPengenalan' => $item['kadPengenalan'], 'ketegori' => $item['ketegori'], 'jumlahProgram' => count($item['programs']), 'programs' => $item['programs'], 'unit' => implode(', ', $item['units']), 'sourceFile' => implode(', ', $item['sourceFiles']), 'datasetId' => $item['sourceRecords'][0]['datasetId'] ?? null, 'sourceRecords' => $item['sourceRecords']];
        }
        jsonResponse(['success' => true, 'participants' => $output]);
    }
    if ($path === '/api/penerima-bantuan' && $method === 'GET') {
        $user = requireApiUser($pdo);
        if (!canAccessUserPage($user, 'recipients') && !canAccessUserPage($user, 'dashboard')) {
            jsonResponse(['success' => false, 'error' => 'You do not have permission to view recipient records.'], 403);
        }
        $recipients = [];
        foreach ($pdo->query('SELECT * FROM datasets ORDER BY updated_at DESC')->fetchAll() as $dataset) {
            if (!is_file($dataset['filepath'])) {
                continue;
            }
            $rows = csvRowsFromFile($dataset['filepath']);
            if (count($rows) < 2) {
                continue;
            }
            $headers = array_map(static fn($value): string => strtoupper(trim($value)), $rows[0]);
            $isParticipantDataset = in_array('NAMA', $headers, true) && in_array('KAD PENGENALAN', $headers, true) && in_array('PROGRAM', $headers, true);
            if ($isParticipantDataset || (!in_array('NAMA', $headers, true) && !in_array('KAD PENGENALAN', $headers, true))) {
                continue;
            }
            $indices = [];
            foreach (['NAMA', 'KAD PENGENALAN', 'TELEFON', 'EMAIL', 'STATUS', 'CATATAN', 'PIC'] as $field) {
                $indices[$field] = array_search($field, $headers, true);
            }
            $employmentIndex = array_search('PEKERJAAN', $headers, true);
            if ($employmentIndex === false) {
                $employmentIndex = array_search('STATUS PEKERJAAN', $headers, true);
            }
            foreach (array_slice($rows, 1, null, true) as $rowIndex => $row) {
                $recipients[] = ['nama' => $indices['NAMA'] !== false ? trim($row[$indices['NAMA']] ?? '') : '', 'kadPengenalan' => $indices['KAD PENGENALAN'] !== false ? trim($row[$indices['KAD PENGENALAN']] ?? '') : '', 'telefon' => $indices['TELEFON'] !== false ? trim($row[$indices['TELEFON']] ?? '') : '', 'email' => $indices['EMAIL'] !== false ? trim($row[$indices['EMAIL']] ?? '') : '', 'status' => $indices['STATUS'] !== false ? trim($row[$indices['STATUS']] ?? '') : '', 'statusPekerjaan' => $employmentIndex !== false ? trim($row[$employmentIndex] ?? '') : '', 'catatan' => $indices['CATATAN'] !== false ? trim($row[$indices['CATATAN']] ?? '') : '', 'pic' => $indices['PIC'] !== false ? trim($row[$indices['PIC']] ?? '') : '', 'sourceFile' => $dataset['filename'], 'datasetId' => (int)$dataset['id'], 'rowIndex' => $rowIndex, 'sourceRecords' => [['datasetId' => (int)$dataset['id'], 'rowIndex' => $rowIndex, 'sourceFile' => $dataset['filename']]]];
            }
        }
        jsonResponse(['success' => true, 'recipients' => $recipients]);
    }
    if ($path === '/api/user/activity' && $method === 'GET') {
        $account = requirePageCapability($pdo, 'activity');
        $limit = min(max((int)($query['limit'] ?? 1000), 1), 1000);
        $activityUsername = trim((string)$account['display_name']);
        $picUsername = $activityUsername !== '' ? $activityUsername : (string)$account['username'];
        $statusCount = 0;
        foreach ($pdo->query('SELECT filepath FROM datasets ORDER BY id')->fetchAll(PDO::FETCH_COLUMN) as $filepath) {
            if (!is_file($filepath)) {
                continue;
            }
            $rows = csvRowsFromFile($filepath);
            if ($rows === []) {
                continue;
            }
            $headers = array_map(static fn($value): string => strtolower(trim($value)), $rows[0]);
            $picIndex = array_search('pic', $headers, true);
            $statusIndex = array_search('status', $headers, true);
            if ($picIndex === false || $statusIndex === false) {
                continue;
            }
            foreach (array_slice($rows, 1) as $row) {
                if (strcasecmp(trim($row[$picIndex] ?? ''), $picUsername) === 0 && trim($row[$statusIndex] ?? '') !== '') {
                    $statusCount++;
                }
            }
        }
        $progressStatement = $pdo->prepare(
            "SELECT COALESCE(SUM(progress_change), 0) FROM user_activity WHERE (LOWER(TRIM(username)) IN (LOWER(TRIM(?)), LOWER(TRIM(?))) OR LOWER(TRIM(username)) = 'unknown') AND created_at >= DATE_SUB(NOW(), INTERVAL 1 MONTH)"
        );
        $progressStatement->execute([$activityUsername, $account['username']]);
        $progressChange = (int)$progressStatement->fetchColumn();
        $statement = $pdo->prepare("SELECT activity.id, COALESCE((SELECT account.username FROM users AS account WHERE LOWER(TRIM(account.username)) = LOWER(TRIM(activity.username)) LIMIT 1), (SELECT account.username FROM users AS account WHERE LOWER(TRIM(account.display_name)) = LOWER(TRIM(activity.username)) LIMIT 1), activity.username) AS username, activity.dataset_id, COALESCE(NULLIF(dataset.name, ''), activity.dataset_name) AS dataset_name, activity.action, activity.row_id, activity.column_name, activity.old_value, activity.new_value, activity.progress_change, activity.created_at FROM user_activity AS activity LEFT JOIN datasets AS dataset ON dataset.id = activity.dataset_id ORDER BY activity.created_at DESC, activity.id DESC LIMIT ?");
        $statement->bindValue(1, $limit, PDO::PARAM_INT);
        $statement->execute();
        $activities = $statement->fetchAll();
        $earliest = $pdo->query("SELECT MIN(DATE_FORMAT(created_at, '%Y-%m')) FROM user_activity WHERE action = 'status_change' OR (action = 'UPDATE' AND UPPER(TRIM(column_name)) = 'STATUS')")->fetchColumn();
        jsonResponse(['success' => true, 'user' => ['username' => $account['username'], 'displayName' => $account['display_name']], 'activityUsername' => $activityUsername, 'statusCount' => $statusCount, 'progressChange' => $progressChange, 'totalActivity' => $statusCount + $progressChange, 'activities' => $activities, 'earliestActivityMonth' => $earliest ?: '']);
    }
    if ($path === '/api/user/activity/month' && $method === 'GET') {
        requirePageCapability($pdo, 'activity');
        $month = (string)($query['month'] ?? '');
        if (!preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', $month)) {
            jsonResponse(['success' => false, 'error' => 'A valid month in YYYY-MM format is required.'], 400);
        }
        if ($month > date('Y-m')) {
            jsonResponse(['success' => false, 'error' => 'Activity cannot be requested for a future month.'], 400);
        }
        $earliest = $pdo->query("SELECT MIN(DATE_FORMAT(created_at, '%Y-%m')) FROM user_activity WHERE action = 'status_change' OR (action = 'UPDATE' AND UPPER(TRIM(column_name)) = 'STATUS')")->fetchColumn();
        $statement = $pdo->prepare("SELECT username, day, SUM(progress_change) AS progress_change FROM (SELECT COALESCE((SELECT account.username FROM users AS account WHERE LOWER(TRIM(account.username)) = LOWER(TRIM(user_activity.username)) LIMIT 1), (SELECT account.username FROM users AS account WHERE LOWER(TRIM(account.display_name)) = LOWER(TRIM(user_activity.username)) LIMIT 1), user_activity.username) AS username, DAY(created_at) AS day, SUM(CASE WHEN TRIM(COALESCE(old_value,'')) = '' AND TRIM(COALESCE(new_value,'')) <> '' THEN 1 WHEN TRIM(COALESCE(old_value,'')) <> '' AND TRIM(COALESCE(new_value,'')) = '' THEN -1 ELSE 0 END) AS progress_change FROM user_activity WHERE (action = 'status_change' OR (action = 'UPDATE' AND UPPER(TRIM(column_name)) = 'STATUS')) AND DATE_FORMAT(created_at, '%Y-%m') = ? GROUP BY user_activity.username, DAY(created_at)) AS daily_activity GROUP BY username, day ORDER BY username, day");
        $statement->execute([$month]);
        $activities = $statement->fetchAll();
        jsonResponse([
            'success' => true,
            'month' => $month,
            'earliestActivityMonth' => $earliest ?: '',
            'activities' => $activities
        ]);
    }
    if ($path === '/api/audit' && $method === 'GET') {
        requirePageCapability($pdo, 'activity');
        $activities = $pdo->query("SELECT activity.id, COALESCE((SELECT account.username FROM users AS account WHERE LOWER(TRIM(account.username)) = LOWER(TRIM(activity.username)) LIMIT 1), (SELECT account.username FROM users AS account WHERE LOWER(TRIM(account.display_name)) = LOWER(TRIM(activity.username)) LIMIT 1), activity.username) AS username, activity.dataset_id, COALESCE(NULLIF(dataset.name, ''), activity.dataset_name) AS dataset_name, activity.action, activity.row_id, activity.column_name, activity.old_value, activity.new_value, activity.progress_change, activity.created_at FROM user_activity AS activity LEFT JOIN datasets AS dataset ON dataset.id = activity.dataset_id WHERE activity.created_at >= DATE_SUB(NOW(), INTERVAL 1 MONTH) ORDER BY activity.created_at DESC, activity.id DESC")->fetchAll();
        jsonResponse($activities);
    }

    if ($path === '/api/preview' && $method === 'POST') {
        requirePageCapability($pdo, 'upload');
        if (empty($_FILES['file']['tmp_name'])) {
            jsonResponse(['success' => false, 'error' => 'No file uploaded.'], 400);
        }
        $extension = strtolower(pathinfo($_FILES['file']['name'], PATHINFO_EXTENSION));
        if ($extension !== 'csv') {
            jsonResponse(['success' => false, 'error' => 'Excel preview requires a browser-normalized CSV file.'], 400);
        }
        $rows = csvRowsFromFile($_FILES['file']['tmp_name']);
        jsonResponse(['type' => 'csv', 'name' => pathinfo($_FILES['file']['name'], PATHINFO_FILENAME), 'rows' => array_slice($rows, 0, 101)]);
    }
    if ($path === '/api/datasets' && $method === 'POST') {
        $account = requirePageCapability($pdo, 'upload', true);
        $file = $_FILES['file'] ?? null;
        if (!$file || $file['error'] !== UPLOAD_ERR_OK) {
            jsonResponse(['success' => false, 'error' => 'No file uploaded or the upload failed.'], 400);
        }
        if ($file['size'] > 104857600) {
            jsonResponse(['success' => false, 'error' => 'The uploaded file exceeds the 100 MB limit.'], 413);
        }
        if (strtolower(pathinfo($file['name'], PATHINFO_EXTENSION)) !== 'csv') {
            jsonResponse(['success' => false, 'error' => 'Only CSV uploads are accepted. Convert Excel files in the browser first.'], 400);
        }
        $rows = csvRowsFromFile($file['tmp_name']);
        if ($rows === []) {
            jsonResponse(['success' => false, 'error' => 'CSV is empty.'], 400);
        }
        $datasetType = ($payload['datasetType'] ?? '') === 'peserta' ? 'peserta' : 'penerima';
        if ($datasetType === 'penerima') {
            $rows = ensureRecipientEmploymentStatusColumn($rows);
        }
        $safeOriginal = preg_replace('/[^A-Za-z0-9._ -]/', '_', basename($file['name'])) ?: 'dataset.csv';
        $storedName = bin2hex(random_bytes(16)) . '.csv';
        $filepath = $storageDirectory . DIRECTORY_SEPARATOR . $storedName;
        $csv = encodeCsv($rows);
        if (file_put_contents($filepath, $csv, LOCK_EX) === false) {
            throw new RuntimeException('Could not save uploaded CSV.');
        }
        $name = trim((string)($payload['name'] ?? pathinfo($safeOriginal, PATHINFO_FILENAME)));
        if ($name === '') {
            $name = pathinfo($safeOriginal, PATHINFO_FILENAME);
        }
        $pdo->beginTransaction();
        try {
            $statement = $pdo->prepare("INSERT INTO datasets (name, filename, filepath, row_count, column_count, file_size, dataset_type, created_at, updated_at, sync_status) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), 'local')");
            $statement->execute([$name, $safeOriginal, $filepath, max(count($rows) - 1, 0), count($rows[0]), strlen($csv), $datasetType]);
            $id = (int)$pdo->lastInsertId();
            recordActivity($pdo, $account['username'], $id, $name, 'dataset_create');
            $pdo->commit();
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            @unlink($filepath);
            throw $error;
        }
        jsonResponse(['success' => true, 'type' => 'csv', 'id' => $id, 'name' => $name, 'filename' => $safeOriginal, 'rows' => max(count($rows) - 1, 0), 'columns' => count($rows[0]), 'version' => 1, 'sync_status' => 'local'], 201);
    }

    if (preg_match('#^/api/(peserta-program|penerima-bantuan)/records$#', $path, $matches) && in_array($method, ['POST', 'PUT', 'DELETE'], true)) {
        $participant = $matches[1] === 'peserta-program';
        $account = requirePageCapability($pdo, $participant ? 'participants' : 'recipients', true);
        if ($method === 'POST') {
            $datasetId = filter_var($payload['datasetId'] ?? null, FILTER_VALIDATE_INT);
            $dataset = $datasetId ? datasetById($pdo, (int)$datasetId) : null;
            if (!$dataset || !is_file($dataset['filepath'])) {
                jsonResponse(['success' => false, 'error' => 'Source dataset not found.'], 404);
            }
            $rows = csvRowsFromFile($dataset['filepath']);
            $headers = array_map(static fn($value): string => strtoupper(trim($value)), $rows[0] ?? []);
            $isParticipantDataset = in_array('NAMA', $headers, true) && in_array('KAD PENGENALAN', $headers, true) && in_array('PROGRAM', $headers, true);
            if ($participant !== $isParticipantDataset) {
                jsonResponse(['success' => false, 'error' => 'Selected file does not match this page.'], 400);
            }
            $changes = is_array($payload['changes'] ?? null) ? $payload['changes'] : [];
            $row = array_fill(0, count($headers), '');
            foreach ($headers as $index => $header) {
                $key = strtolower(preg_replace('/[^a-z0-9]/i', '', $header) ?? '');
                $alternates = $header === 'KATEGORI' ? ['kategori', 'ketegori'] : [$key];
                if ($header === 'KAD PENGENALAN') {
                    $alternates = ['kadpengenalan', 'kp'];
                }
                if ($header === 'PROGRAM') {
                    $alternates = ['program', 'programs'];
                }
                if ($header === 'PEKERJAAN' || $header === 'STATUS PEKERJAAN') {
                    $alternates = ['pekerjaan', 'statuspekerjaan'];
                }
                foreach ($alternates as $alternate) {
                    if (array_key_exists($alternate, $changes)) {
                        $row[$index] = (string)$changes[$alternate];
                        break;
                    }
                }
            }
            $rows[] = $row;
            updateCsvDataset($pdo, $dataset, normalizeRows($rows), $account['username']);
            jsonResponse(['success' => true, 'datasetId' => (int)$dataset['id']], 201);
        }
        editMappedRecord($pdo, $payload, $account['username'], $participant, $method === 'DELETE');
    }
    if (preg_match('#^/api/datasets/(\d+)$#', $path, $matches) && $method === 'PUT') {
        $account = requirePageCapability($pdo, 'dataset', true);
        $dataset = datasetById($pdo, (int)$matches[1]);
        if (!$dataset) {
            jsonResponse(['success' => false, 'error' => 'Dataset not found.'], 404);
        }
        if (!isset($payload['csv']) || !is_string($payload['csv'])) {
            jsonResponse(['success' => false, 'error' => 'CSV data is required.'], 400);
        }
        $rows = csvRowsFromString($payload['csv']);
        if ($rows === []) {
            jsonResponse(['success' => false, 'error' => 'Dataset cannot be empty.'], 400);
        }
        $updated = updateCsvDataset($pdo, $dataset, $rows, $account['username']);
        jsonResponse(['success' => true, 'id' => (int)$updated['id'], 'row_count' => (int)$updated['row_count'], 'column_count' => (int)$updated['column_count'], 'file_size' => (int)$updated['file_size'], 'version' => (int)$updated['version'], 'sync_status' => 'modified']);
    }
    $isUploadDelete = preg_match('#^/api/upload/datasets/\d+$#', $path) === 1;
    if (($path === '/api/datasets' || preg_match('#^/api/datasets/\d+$#', $path) || $isUploadDelete) && $method === 'DELETE') {
        $account = requirePageCapability($pdo, $isUploadDelete ? 'upload' : 'dataset', true);
        $ids = $path === '/api/datasets' ? ($payload['ids'] ?? []) : [(int)basename($path)];
        if (!is_array($ids) || $ids === []) {
            jsonResponse(['success' => false, 'error' => 'No datasets selected.'], 400);
        }
        $statement = $pdo->prepare('DELETE FROM datasets WHERE id = ?');
        foreach (array_unique(array_map('intval', $ids)) as $id) {
            if ($id < 1) {
                continue;
            }
            $dataset = datasetById($pdo, $id);
            if (!$dataset) {
                continue;
            }
            $pdo->beginTransaction();
            try {
                recordActivity($pdo, $account['username'], $id, $dataset['name'], 'dataset_delete');
                $statement->execute([$id]);
                $pdo->commit();
            } catch (Throwable $error) {
                if ($pdo->inTransaction()) {
                    $pdo->rollBack();
                }
                throw $error;
            }
            if (is_file($dataset['filepath']) && !unlink($dataset['filepath'])) {
                error_log('Could not remove uploaded dataset file: ' . $dataset['filepath']);
            }
        }
        jsonResponse(['success' => true]);
    }

    jsonResponse(['success' => false, 'error' => 'Endpoint not found.'], 404);
}

$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$path = rawurldecode($path);
$scriptName = str_replace('\\', '/', $_SERVER['SCRIPT_NAME'] ?? '/index.php');
$basePath = rtrim(dirname($scriptName), '/.');
if ($basePath === '.' || $basePath === '/') {
    $basePath = '';
}
if (($basePath === '' || $basePath === '/app-bapim') && isset($_SERVER['REQUEST_URI']) && preg_match('#^/app-bapim(?:/|$)#', $_SERVER['REQUEST_URI'])) {
    $basePath = '/app-bapim';
}
if ($basePath !== '' && ($path === $basePath || str_starts_with($path, $basePath . '/'))) {
    $path = substr($path, strlen($basePath)) ?: '/';
}
$path = rtrim($path, '/') ?: '/';

if (preg_match('#^(/bpa/.+)\.php$#i', $path, $extensionPath)
    && in_array($method, ['GET', 'HEAD'], true)) {
    $query = parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_QUERY);
    $cleanPath = $extensionPath[1];
    if ($cleanPath === '/bpa/admin/dashboard_admin') {
        $cleanPath = '/bpa/dashboard';
    } elseif (preg_match('#^/bpa/(uak|upu|upa|ulk)/dashboard$#i', $cleanPath, $unitDashboard)) {
        $cleanPath = '/bpa/dashboard';
        $queryParameters = [];
        if (is_string($query)) {
            parse_str($query, $queryParameters);
        }
        $queryParameters['unit'] = strtoupper($unitDashboard[1]);
        $query = http_build_query($queryParameters);
    } elseif (preg_match('#^/bpa/(uak|upu|upa|ulk)/program_list$#i', $cleanPath, $unitProgramList)) {
        $cleanPath = '/bpa/laporan/program_list';
        $queryParameters = [];
        if (is_string($query)) {
            parse_str($query, $queryParameters);
        }
        $queryParameters['unit'] = strtoupper($unitProgramList[1]);
        $query = http_build_query($queryParameters);
    }
    $location = $basePath . $cleanPath;
    if (is_string($query) && $query !== '') {
        $location .= '?' . $query;
    }
    header('Location: ' . $location, true, 301);
    exit;
}

if ($path === '/bpa/admin/dashboard_admin'
    && !isset($_SERVER['HTTP_X_BPA_DASHBOARD_UNIT'])) {
    header('Location: ' . $basePath . '/bpa/dashboard', true, 301);
    exit;
}
if (preg_match('#^/bpa/(uak|upu|upa|ulk)/dashboard$#i', $path, $unitDashboard)
    && !isset($_SERVER['HTTP_X_BPA_DASHBOARD_UNIT'])) {
    $queryParameters = [];
    parse_str((string)(parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_QUERY) ?? ''), $queryParameters);
    $queryParameters['unit'] = strtoupper($unitDashboard[1]);
    $location = $basePath . '/bpa/dashboard?' . http_build_query($queryParameters);
    if ($queryParameters === ['unit' => strtoupper($unitDashboard[1])]) {
        $location = $basePath . '/bpa/dashboard?unit=' . strtoupper($unitDashboard[1]);
    }
    header('Location: ' . $location, true, 302);
    exit;
}
if (preg_match('#^/bpa/(uak|upu|upa|ulk)/program_list$#i', $path, $unitProgramList)
    && !isset($_SERVER['HTTP_X_BPA_PROGRAM_LIST_UNIT'])
    && in_array($method, ['GET', 'HEAD'], true)) {
    $queryParameters = [];
    parse_str((string)(parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_QUERY) ?? ''), $queryParameters);
    $queryParameters['unit'] = strtoupper($unitProgramList[1]);
    $location = $basePath . '/bpa/laporan/program_list?' . http_build_query($queryParameters);
    header('Location: ' . $location, true, 302);
    exit;
}

if (str_starts_with($path, '/api/')) {
    try {
        runApi($pdo, $path, $method, $storageDirectory);
    } catch (Throwable $error) {
        error_log(sprintf('Application API error: %s in %s:%d', $error->getMessage(), $error->getFile(), $error->getLine()));
        jsonResponse(['success' => false, 'error' => 'The request could not be completed. Check the PHP error log.'], 500);
    }
}

if (preg_match('#^/data-set/(\d+)$#', $path, $legacyDatasetMatch)) {
    $queryParameters = [];
    parse_str((string)(parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_QUERY) ?? ''), $queryParameters);
    $queryParameters['id'] = $legacyDatasetMatch[1];
    $legacyDestination = '/set-data?' . http_build_query($queryParameters);
} else {
    $legacyPagePaths = [
        '/user' => '/aktiviti-pengguna',
        '/upload' => '/muat-naik',
        '/data-set' => '/set-data',
        '/account' => '/akaun-pengguna',
        '/manage-users' => '/pengurusan-pengguna',
        '/updates' => '/log-perisian',
        '/login' => '/log-masuk',
        '/create-account' => '/cipta-akaun',
    ];
    $legacyDestination = $legacyPagePaths[$path] ?? null;
}
if ($legacyDestination !== null) {
    $query = parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_QUERY);
    $location = $basePath . $legacyDestination;
    if (!str_contains($legacyDestination, '?') && is_string($query) && $query !== '') {
        $location .= '?' . $query;
    }
    header('Location: ' . $location, true, 302);
    exit;
}

if ($path === '/bpa/logout.php') {
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $parameters = session_get_cookie_params();
        setcookie(session_name(), '', [
            'expires' => time() - 42000,
            'path' => $parameters['path'],
            'domain' => $parameters['domain'],
            'secure' => $parameters['secure'],
            'httponly' => $parameters['httponly'],
            'samesite' => 'Lax',
        ]);
    }
    session_destroy();
    header('Location: ' . $basePath . '/log-masuk', true, 302);
    exit;
}

if (preg_match('#^(?:/app-bapim)?/bpa/(.+)$#', $path, $bpaMatch)) {
    $isUnifiedBpaDashboard = $bpaMatch[1] === 'dashboard';
    $isUnifiedBpaProgramList = $bpaMatch[1] === 'laporan/program_list';
    $bpaFile = $isUnifiedBpaDashboard
        ? __DIR__ . '/bpa/admin/dashboard_admin.php'
        : __DIR__ . '/bpa/' . $bpaMatch[1];
    if (!is_file($bpaFile) && pathinfo($bpaFile, PATHINFO_EXTENSION) === '') {
        $bpaFile .= '.php';
    }
    if (!is_file($bpaFile)) {
        http_response_code(404);
        echo 'BPA page not found.';
        exit;
    }

    $user = currentUser($pdo);
    if (!$user) {
        header('Location: ' . $basePath . '/log-masuk');
        exit;
    }

    $requiredBpaPermission = requiredBpaPageForPath($path, $pdo);
    if (!canAccessUserPage($user, $requiredBpaPermission)) {
        http_response_code(403);
        echo 'Anda tidak mempunyai kebenaran untuk mengakses sistem BPA.';
        exit;
    }
    if (preg_match('/^bpa(?:Dashboard|Programs)(UAK|UPU|UPA|ULK)$/', $requiredBpaPermission, $authorizedUnit)) {
        define('BPA_AUTHORIZED_UNIT', $authorizedUnit[1]);
    }

    $bpaInitialDashboardUnit = null;
    if ($isUnifiedBpaDashboard) {
        $requestedUnit = strtoupper((string)($_GET['unit'] ?? $_SERVER['HTTP_X_BPA_DASHBOARD_UNIT'] ?? ''));
        $dashboardUnits = ['BPA', 'UAK', 'UPU', 'UPA', 'ULK'];
        $bpaInitialDashboardUnit = in_array($requestedUnit, $dashboardUnits, true) ? $requestedUnit : null;
        if ($bpaInitialDashboardUnit === null) {
            foreach ($dashboardUnits as $unitCode) {
                if (canAccessUserPage($user, 'bpaDashboard' . $unitCode)) {
                    $bpaInitialDashboardUnit = $unitCode;
                    break;
                }
            }
        }
        if ($bpaInitialDashboardUnit !== null && $bpaInitialDashboardUnit !== 'BPA') {
            $bpaFile = __DIR__ . '/bpa/' . strtolower($bpaInitialDashboardUnit) . '/dashboard.php';
        }
        if ($bpaInitialDashboardUnit !== null && !defined('BPA_AUTHORIZED_UNIT')) {
            define('BPA_AUTHORIZED_UNIT', $bpaInitialDashboardUnit);
        }
    }

    $bpaInitialProgramUnit = null;
    if ($isUnifiedBpaProgramList) {
        $requestedUnit = strtoupper((string)($_GET['unit'] ?? $_SERVER['HTTP_X_BPA_PROGRAM_LIST_UNIT'] ?? ''));
        $programUnits = ['BPA', 'UAK', 'UPU', 'UPA', 'ULK'];
        $bpaInitialProgramUnit = in_array($requestedUnit, $programUnits, true) ? $requestedUnit : null;
        if ($bpaInitialProgramUnit === null) {
            foreach ($programUnits as $unitCode) {
                if (canAccessUserPage($user, 'bpaPrograms' . $unitCode)) {
                    $bpaInitialProgramUnit = $unitCode;
                    break;
                }
            }
        }
        if ($bpaInitialProgramUnit !== null && $bpaInitialProgramUnit !== 'BPA') {
            $bpaFile = __DIR__ . '/bpa/' . strtolower($bpaInitialProgramUnit) . '/program_list.php';
        }
        if ($bpaInitialProgramUnit !== null && !defined('BPA_AUTHORIZED_UNIT')) {
            define('BPA_AUTHORIZED_UNIT', $bpaInitialProgramUnit);
        }
    }
    $effectiveBpaPermission = $isUnifiedBpaProgramList && $bpaInitialProgramUnit !== null
        ? 'bpaPrograms' . $bpaInitialProgramUnit
        : $requiredBpaPermission;
    $bpaCanEdit = (bool)(userPagePermissions($user)[$effectiveBpaPermission]['edit'] ?? false);
    if (preg_match('#^/bpa/(uak|upu|upa|ulk)/program_edit(?:\\.php)?$#i', $path) && !$bpaCanEdit) {
        http_response_code(403);
        echo 'Anda tidak mempunyai kebenaran untuk menyunting program.';
        exit;
    }
    if (!is_file($bpaFile)) {
        http_response_code(404);
        echo 'BPA page not found.';
        exit;
    }

    if (isset($_SERVER['HTTP_X_APP_FRAGMENT'])) {
        header('Content-Type: text/html; charset=utf-8');
        require $bpaFile;
        exit;
    }

    $shellPath = __DIR__ . '/views/dashboard.html';
    if (!is_file($shellPath)) {
        require_once __DIR__ . '/bpa/init.php';
        require $bpaFile;
        exit;
    }

    if (!defined('BPA_RENDER_IN_APP_SHELL')) {
        define('BPA_RENDER_IN_APP_SHELL', true);
    }
    require_once __DIR__ . '/bpa/init.php';
    $bpaUnitDescriptions = [];
    if ($isUnifiedBpaDashboard || $isUnifiedBpaProgramList) {
        $unitDescriptions = $pdo->query(
            "SELECT nama_unit, keterangan FROM unit WHERE nama_unit IN ('UAK', 'UPU', 'UPA', 'ULK')"
        )->fetchAll(PDO::FETCH_KEY_PAIR);
        foreach ($unitDescriptions as $unitCode => $description) {
            $bpaUnitDescriptions[strtoupper((string)$unitCode)] = (string)$description;
        }
    }
    ob_start();
    require $bpaFile;
    $bodyMarkup = ob_get_clean();

    $preservedBpaStyles = [];
    $preservedBpaScripts = [];
    $bodyMarkup = preg_replace_callback(
        '#<(style|script)\b[^>]*>.*?</\1\s*>#is',
        static function (array $match) use (&$preservedBpaStyles, &$preservedBpaScripts): string {
            if (str_starts_with(strtolower($match[0]), '<style')) {
                $preservedBpaStyles[] = $match[0];
            } else {
                $preservedBpaScripts[] = $match[0];
            }
            return '';
        },
        $bodyMarkup
    );
    if ($bodyMarkup === null) {
        throw new RuntimeException('Could not extract BPA page assets.');
    }

    $bodyMarkup = preg_replace('#<!DOCTYPE[^>]*>#is', '', $bodyMarkup);
    $bodyMarkup = preg_replace('#<html\b[^>]*>#is', '', $bodyMarkup);
    $bodyMarkup = preg_replace('#</html\s*>#is', '', $bodyMarkup);
    $bodyMarkup = preg_replace('#<head\b[^>]*>.*?</head\s*>#is', '', $bodyMarkup);
    $bodyMarkup = preg_replace('#<body\b[^>]*>#is', '', $bodyMarkup);
    $bodyMarkup = preg_replace('#</body\s*>#is', '', $bodyMarkup);
    $bodyMarkup = preg_replace('#<style\b[^>]*>.*?</style\s*>#is', '', $bodyMarkup);
    $bodyMarkup = preg_replace('#<link\b[^>]*rel=["\']stylesheet["\'][^>]*>#is', '', $bodyMarkup);
    $bodyMarkup = preg_replace('#<script\b[^>]*>.*?</script\s*>#is', '', $bodyMarkup);
    $bodyMarkup = preg_replace('#<meta\b[^>]*>#is', '', $bodyMarkup);
    $bodyMarkup = preg_replace('#<title\b[^>]*>.*?</title\s*>#is', '', $bodyMarkup);
    $unitDescriptionAttribute = ($isUnifiedBpaDashboard || $isUnifiedBpaProgramList)
        ? ' data-unit-descriptions="' . htmlspecialchars(
            json_encode($bpaUnitDescriptions, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE),
            ENT_QUOTES,
            'UTF-8'
        ) . '"'
        : '';
    $bpaInitialUnitAttribute = $isUnifiedBpaDashboard && $bpaInitialDashboardUnit !== null
        ? ' data-dashboard-initial-unit="' . htmlspecialchars($bpaInitialDashboardUnit, ENT_QUOTES, 'UTF-8')
            . '" data-dashboard-unit="' . htmlspecialchars($bpaInitialDashboardUnit, ENT_QUOTES, 'UTF-8') . '"'
        : '';
    if ($isUnifiedBpaProgramList && $bpaInitialProgramUnit !== null) {
        $bpaInitialUnitAttribute = ' data-program-list-initial-unit="'
            . htmlspecialchars($bpaInitialProgramUnit, ENT_QUOTES, 'UTF-8')
            . '" data-program-list-unit="'
            . htmlspecialchars($bpaInitialProgramUnit, ENT_QUOTES, 'UTF-8')
            . '"';
    }
    $dashboardContentClass = $isUnifiedBpaDashboard ? ' bpa-dashboard-content' : '';
    $bodyMarkup = '<div class="dashboard-content bpa-shell-page' . $dashboardContentClass . '"'
        . $unitDescriptionAttribute . $bpaInitialUnitAttribute . '>' . trim($bodyMarkup) . '</div>';

    $rewriteBpaUrls = static function (string $markup) use ($basePath): string {
        $rewritten = preg_replace_callback(
            '~(\b(?:href|src|action)\s*=\s*)(["\'])(/(?!/)([^"\']*?))\2~i',
            static function (array $match) use ($basePath): string {
                $value = $match[3];
                if (preg_match('~^/bpa/.+\.php(?:[?#]|$)~i', $value)) {
                    $pathEnd = strcspn($value, '?#');
                    $urlPath = substr($value, 0, $pathEnd);
                    $value = substr($urlPath, 0, -4) . substr($value, $pathEnd);
                }
                if ($value === '' || str_starts_with($value, $basePath . '/')) {
                    return $match[0];
                }
                return $match[1] . $match[2] . $basePath . '/' . ltrim($value, '/') . $match[2];
            },
            $markup
        );
        if ($rewritten === null) {
            throw new RuntimeException('Could not rewrite BPA asset URLs.');
        }
        $extensionless = preg_replace_callback(
            '~(\b(?:href|action)\s*=\s*)(["\'])([^"\']+)\2~i',
            static function (array $match) use ($basePath): string {
                $value = $match[3];
                $parts = parse_url($value);
                if ($parts === false || isset($parts['scheme']) || isset($parts['host'])) {
                    return $match[0];
                }

                $urlPath = $parts['path'] ?? '';
                $isBpaPath = str_starts_with($urlPath, '/bpa/')
                    || ($basePath !== '' && str_starts_with($urlPath, $basePath . '/bpa/'));
                $isRelativePath = $urlPath !== '' && !str_starts_with($urlPath, '/');
                if ((!$isBpaPath && !$isRelativePath) || !preg_match('/\.php$/i', $urlPath)) {
                    return $match[0];
                }

                $suffix = substr($value, strlen($urlPath));
                return $match[1] . $match[2] . substr($urlPath, 0, -4) . $suffix . $match[2];
            },
            $rewritten
        );
        if ($extensionless === null) {
            throw new RuntimeException('Could not remove PHP extensions from BPA page URLs.');
        }
        return $extensionless;
    };
    $bodyMarkup = $rewriteBpaUrls($bodyMarkup);
    $bodyMarkup = trim($bodyMarkup);

    if ($bodyMarkup === '') {
        $bodyMarkup = '<div class="content-card"><div class="card-header-custom"><div><h5>BPA</h5><span>Konten telah dimuat.</span></div></div></div>';
    }

    $html = file_get_contents($shellPath);
    if ($html === false) {
        throw new RuntimeException('Could not read the dashboard shell.');
    }

    $rewriteShellUrls = static function (string $markup) use ($basePath): string {
        $rewritten = preg_replace_callback(
            '~(\b(?:href|src|action)\s*=\s*)(["\'])(/(?!/)([^"\']*?))\2~i',
            static function (array $match) use ($basePath): string {
                $value = $match[3];
                if ($value === '' || str_starts_with($value, $basePath . '/')) {
                    return $match[0];
                }
                return $match[1] . $match[2] . $basePath . '/' . ltrim($value, '/') . $match[2];
            },
            $markup
        );
        if ($rewritten === null) {
            throw new RuntimeException('Could not rewrite the application shell URLs.');
        }
        return $rewritten;
    };

    $start = strpos($html, '<main class="main-content" id="page-content">');
    $end = $start === false ? false : strpos($html, '</main>', $start);
    if ($start === false || $end === false) {
        throw new RuntimeException('The application shell is missing the page-content area.');
    }

    $html = substr($html, 0, $start) . '<main class="main-content" id="page-content">' . $bodyMarkup . substr($html, $end + strlen('</main>'));
    $html = preg_replace('/<title>.*?<\/title>/is', '<title>BPA</title>', $html, 1);
    $html = $rewriteShellUrls($html);

    $themeCss = <<<'CSS'
<style>
    html,
    body {
        margin: 0 !important;
        padding: 0 !important;
        background: #f4f7fb !important;
        color: #172033 !important;
        font-family: var(--app-font-family, Arial, Helvetica, sans-serif) !important;
    }
    .bpa-shell-page .bpa-topbar,
    .bpa-shell-page .side-menu-shell,
    .bpa-shell-page #sideMenu,
    .bpa-shell-page aside.sidebar {
        display: none !important;
    }
    .bpa-shell-page {
        background: transparent;
        color: #172033;
        font-family: var(--app-font-family, Arial, Helvetica, sans-serif);
        min-height: 100%;
        padding: 32px 36px;
    }
    .bpa-shell-page > .container,
    .bpa-shell-page > .container-fluid {
        max-width: none;
        width: 100%;
        margin-top: 0 !important;
        padding: 0;
    }
    .bpa-shell-page .kpi-row {
        display: grid !important;
        grid-template-columns: repeat(auto-fit, minmax(min(100%, 170px), 1fr));
        gap: 12px;
    }
    .bpa-shell-page .kpi-big,
    .bpa-shell-page .kpi-small {
        flex: initial;
        min-width: 0;
    }
    .bpa-shell-page .kpi-card,
    .bpa-shell-page .kpi-card.gradient-blue,
    .bpa-shell-page .kpi-card.gradient-green,
    .bpa-shell-page .kpi-card.gradient-orange,
    .bpa-shell-page .kpi-card.gradient-dark,
    .bpa-shell-page .kpi-card.gradient-purple {
        position: relative;
        overflow: hidden;
        background: #fff !important;
        border: 1px solid #e2e8f0 !important;
        border-radius: 14px !important;
        box-shadow: 0 8px 24px rgba(15, 23, 42, 0.045) !important;
        color: #172033 !important;
        min-height: 136px;
        padding: 22px !important;
        transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.18s ease;
    }
    .bpa-shell-page .kpi-card::after {
        position: absolute;
        right: -24px;
        bottom: -34px;
        width: 110px;
        height: 110px;
        border-radius: 50%;
        background: rgba(80, 111, 244, 0.055);
        content: "";
        pointer-events: none;
    }
    .bpa-shell-page .kpi-card:hover {
        transform: translateY(-3px);
        box-shadow: 0 14px 28px rgba(15, 23, 42, 0.08) !important;
    }
    .bpa-shell-page .kpi-card > div:first-child {
        color: #7b8494;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.7px;
        text-transform: uppercase;
    }
    .bpa-shell-page .kpi-number,
    .bpa-shell-page .kpi-sub {
        position: relative;
        z-index: 1;
        color: #182338 !important;
    }
    .bpa-shell-page .kpi-number {
        font-size: 16px !important;
        line-height: 1.4;
        white-space: nowrap;
    }
    .bpa-shell-page .kpi-sub {
        color: #7b8494 !important;
        font-size: 11px;
    }
    .bpa-shell-page .card,
    .bpa-shell-page .sku-card,
    .bpa-shell-page .alert {
        border: 1px solid #e2e8f0 !important;
        border-radius: 14px !important;
        box-shadow: 0 8px 24px rgba(15, 23, 42, 0.045) !important;
        transition: border-color 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
    }
    .bpa-shell-page .card {
        overflow: hidden;
    }
    .bpa-shell-page .card-header {
        padding: 19px 20px;
        background: #fff;
        border-bottom: 1px solid #e2e8f0;
        color: #182338;
        font-size: 14px;
        font-weight: 600;
    }
    .bpa-shell-page .card-footer {
        padding: 14px 20px;
        background: #fff;
        border-top: 1px solid #e2e8f0;
    }
    .bpa-shell-page .card-body {
        padding: 19px 20px;
    }
    .bpa-shell-page table.table:not(.table-report) {
        margin-bottom: 0;
        color: #687386;
        font-family: var(--app-font-family, Arial, Helvetica, sans-serif);
        font-size: 12px;
    }
    .bpa-shell-page table.table:not(.table-report) thead th {
        background: #e5e7eb !important;
        color: #687386 !important;
        font-size: 11px;
        font-weight: 600;
        padding: 9px 8px;
    }
    .bpa-shell-page table.table:not(.table-report) tbody td {
        background: #fff;
        color: #687386;
        font-size: 12px;
        font-weight: 500;
        padding: 9px 8px;
        transition: background 0.18s ease;
    }
    .bpa-shell-page table.table:not(.table-report) tbody tr:nth-child(even) td {
        background: #f3f4f6;
    }
    .bpa-shell-page table.table:not(.table-report) tbody tr:hover td {
        background: #edf3ff;
    }
    .bpa-shell-page .form-control,
    .bpa-shell-page .form-select {
        min-height: 42px;
        border: 1px solid #d7dfeb !important;
        border-radius: 9px !important;
        background-color: #fff;
        color: #202632;
        font-family: var(--app-font-family, Arial, Helvetica, sans-serif) !important;
        font-size: 13px;
        padding: 8px 12px;
        box-shadow: none !important;
        transition: border-color 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
    }
    .bpa-shell-page .form-control:focus,
    .bpa-shell-page .form-select:focus {
        border-color: #8ca3ff !important;
        box-shadow: 0 0 0 3px rgba(79, 109, 245, 0.12) !important;
    }
    .bpa-shell-page .btn,
    .bpa-shell-page button {
        font-family: var(--app-font-family, Arial, Helvetica, sans-serif);
        transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease !important;
    }
    .bpa-shell-page .btn {
        border-radius: 8px !important;
        font-size: 11px;
        font-weight: 600;
        padding: 6px 12px;
    }
    .bpa-shell-page .btn:hover {
        transform: translateY(-1px);
    }
    .bpa-shell-page .btn:active {
        transform: translateY(0);
    }
    .bpa-shell-page .badge,
    .bpa-shell-page .status-badge {
        border-radius: 999px !important;
        font-family: var(--app-font-family, Arial, Helvetica, sans-serif) !important;
        font-weight: 700;
    }
    .bpa-shell-page .form-control,
    .bpa-shell-page .form-select,
    .bpa-shell-page .alert {
        background: #fff;
    }
    .bpa-shell-page .btn-primary {
        background: #4f6df5;
        border-color: #4f6df5;
    }
    .bpa-shell-page .btn-outline-dark {
        color: #1f2a37;
        border-color: rgba(31,42,55,0.2);
        background: transparent;
    }
    .bpa-shell-page .table:not(.table-report) thead th {
        background: #edf3ff;
        color: #2a3142;
        font-weight: 700;
        letter-spacing: 0.02em;
    }
    .bpa-shell-page .table:not(.table-report) td,
    .bpa-shell-page .table:not(.table-report) th {
        color: #202632;
        border-color: #edf0f5;
        vertical-align: middle;
    }
    .bpa-shell-page h1,
    .bpa-shell-page h2,
    .bpa-shell-page h3,
    .bpa-shell-page h4,
    .bpa-shell-page h5,
    .bpa-shell-page h6 {
        font-family: var(--app-font-family, Arial, Helvetica, sans-serif);
        color: #182338;
        font-weight: 600;
        margin-top: 0;
        margin-bottom: 8px;
    }
    .bpa-shell-page h4 {
        font-size: 14px;
        line-height: 1.2;
    }
    .bpa-shell-page h5 {
        font-size: 14px;
        line-height: 1.3;
    }
    .bpa-shell-page .card h5,
    .bpa-shell-page .card h6 {
        font-size: 14px;
        font-weight: 600 !important;
        line-height: 1.3;
    }
    .bpa-shell-page h1.fw-bold,
    .bpa-shell-page h2.fw-bold,
    .bpa-shell-page h3.fw-bold,
    .bpa-shell-page h4.fw-bold,
    .bpa-shell-page h5.fw-bold,
    .bpa-shell-page h6.fw-bold {
        font-weight: 600 !important;
    }
    .bpa-shell-page .text-muted,
    .bpa-shell-page .small,
    .bpa-shell-page small,
    .bpa-shell-page .small-muted {
        color: #7b8494 !important;
    }
    .bpa-dashboard-content > .container > .d-flex.justify-content-between.align-items-center.mb-3,
    .bpa-dashboard-content > .container-fluid > .d-flex.justify-content-between.align-items-center.mb-3 {
        margin-bottom: 16px !important;
        box-sizing: border-box;
        height: auto;
        min-height: 0;
        padding: 0;
        background: transparent;
        border: 0;
        border-radius: 0;
        box-shadow: none;
    }
    .bpa-dashboard-content > .container > .d-flex.justify-content-between.align-items-center.mb-3 > form,
    .bpa-dashboard-content > .container-fluid > .d-flex.justify-content-between.align-items-center.mb-3 > form {
        flex-wrap: nowrap;
    }
    .bpa-dashboard-content > .container > .d-flex.justify-content-between.align-items-center.mb-3 > form > .btn,
    .bpa-dashboard-content > .container > .d-flex.justify-content-between.align-items-center.mb-3 > form > a,
    .bpa-dashboard-content > .container-fluid > .d-flex.justify-content-between.align-items-center.mb-3 > form > .btn,
    .bpa-dashboard-content > .container-fluid > .d-flex.justify-content-between.align-items-center.mb-3 > form > a {
        flex-shrink: 0;
        white-space: nowrap;
    }
    .bpa-dashboard-content > .container > .d-flex h4,
    .bpa-dashboard-content > .container-fluid > .d-flex h4 {
        color: #172033;
        font-size: 19px;
        font-weight: 700 !important;
        letter-spacing: -.025em;
    }
    .bpa-dashboard-content > .container > .d-flex .small-muted,
    .bpa-dashboard-content > .container-fluid > .d-flex .small-muted {
        margin-top: 4px;
        font-size: 12px;
    }
    .bpa-dashboard-content .kpi-row {
        gap: 16px;
        margin-bottom: 16px !important;
    }
    .bpa-dashboard-content[data-dashboard-unit="BPA"] .kpi-row {
        grid-template-columns: repeat(5, minmax(0, 1fr));
    }
    .bpa-dashboard-content .kpi-row .kpi-card {
        display: flex;
        min-height: 126px;
        flex-direction: column;
        align-items: flex-start;
        justify-content: flex-start;
        gap: 4px;
        padding: 32px 20px 20px !important;
    }
    .bpa-dashboard-content[data-dashboard-unit="BPA"] .kpi-row .kpi-card {
        padding-right: 12px !important;
        padding-left: 12px !important;
    }
    .bpa-dashboard-content[data-dashboard-unit]:not([data-dashboard-unit="BPA"]) > .container > .d-flex.justify-content-between.align-items-center.mb-3 + .row.g-3.mb-3 {
        margin-top: 0 !important;
        margin-bottom: 16px !important;
    }
    .bpa-dashboard-content .kpi-big:nth-child(1) .kpi-card::before,
    .bpa-dashboard-content .kpi-big:nth-child(2) .kpi-card::before,
    .bpa-dashboard-content .kpi-big:nth-child(3) .kpi-card::before,
    .bpa-dashboard-content .kpi-small:nth-child(4) .kpi-card::before,
    .bpa-dashboard-content .kpi-small:nth-child(5) .kpi-card::before {
        position: absolute;
        inset: 0 0 auto;
        height: 4px;
        background: var(--bpa-kpi-accent);
        content: "";
    }
    .bpa-dashboard-content .kpi-big:nth-child(1) .kpi-card {
        --bpa-kpi-accent: #21946a;
        --bpa-kpi-tint: rgba(33, 148, 106, .07);
    }
    .bpa-dashboard-content .kpi-big:nth-child(2) .kpi-card {
        --bpa-kpi-accent: #d78a1f;
        --bpa-kpi-tint: rgba(215, 138, 31, .08);
    }
    .bpa-dashboard-content .kpi-big:nth-child(3) .kpi-card {
        --bpa-kpi-accent: #7354c7;
        --bpa-kpi-tint: rgba(115, 84, 199, .07);
    }
    .bpa-dashboard-content .kpi-small:nth-child(4) .kpi-card {
        --bpa-kpi-accent: #3e6bc3;
        --bpa-kpi-tint: rgba(62, 107, 195, .07);
    }
    .bpa-dashboard-content .kpi-small:nth-child(5) .kpi-card {
        --bpa-kpi-accent: #d64553;
        --bpa-kpi-tint: rgba(214, 69, 83, .07);
    }
    .bpa-dashboard-content .kpi-card::after {
        background: var(--bpa-kpi-tint, rgba(80, 111, 244, .055));
    }
    .bpa-dashboard-content .kpi-card > div:first-child {
        color: #748096;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: .045em;
        line-height: 1.4;
        text-transform: uppercase;
    }
    .bpa-dashboard-content .kpi-number {
        color: #1b2639 !important;
        font-size: clamp(18px, 1.55vw, 23px) !important;
        font-weight: 750;
        letter-spacing: -.025em;
        line-height: 1.25;
        white-space: nowrap;
        overflow-wrap: normal;
        font-variant-numeric: tabular-nums;
    }
    .bpa-dashboard-content[data-dashboard-unit="BPA"] .kpi-number,
    .bpa-dashboard-content[data-dashboard-unit="BPA"] .kpi-card.sm .kpi-number {
        font-size: clamp(13px, 1.2vw, 18px) !important;
    }
    .bpa-dashboard-content .kpi-card.sm .kpi-number {
        font-size: clamp(18px, 1.55vw, 23px) !important;
    }
    .bpa-dashboard-content .kpi-sub {
        margin-top: 0;
        color: #748096 !important;
        font-size: 12px;
        font-weight: 400;
        line-height: 1.4;
    }
    .bpa-dashboard-content > .container > .row.g-4.mb-4,
    .bpa-dashboard-content > .container-fluid > .row.g-4.mb-4 {
        margin-bottom: 16px;
    }
    .bpa-dashboard-content .bpa-admin-toolbar {
        gap: 20px;
        padding: 0;
        border: 0;
        border-radius: 0;
        background: transparent;
        box-shadow: none;
    }
    .bpa-dashboard-content .bpa-admin-heading h4 {
        color: #172554;
        font-size: 20px;
        letter-spacing: -.025em;
    }
    .bpa-dashboard-content .bpa-admin-tools {
        display: flex;
        flex: 0 0 auto;
        align-items: center;
        gap: 10px;
    }
    .bpa-dashboard-content .bpa-admin-year-form {
        flex: 0 0 115px;
        width: 115px;
        margin: 0;
    }
    .bpa-dashboard-content .bpa-admin-year-form .custom-select,
    .bpa-dashboard-content .bpa-admin-year-select {
        box-sizing: border-box;
        width: 100%;
        min-width: 0;
        min-height: 44px;
    }
    .bpa-dashboard-content .bpa-admin-year-select {
        border-color: #e0e7f1;
        border-radius: 11px;
        background-color: #fff;
        color: #243554;
        font-size: 14px;
        font-weight: 700;
        box-shadow: 0 2px 6px rgba(30, 55, 90, .04);
    }
    .bpa-dashboard-content .bpa-admin-actions {
        display: flex;
        align-items: center;
        gap: 8px;
    }
    .bpa-dashboard-content .bpa-admin-action {
        display: grid;
        box-sizing: border-box;
        width: 115px;
        flex: 0 0 115px;
        grid-template-columns: 32px minmax(0, 1fr);
        min-height: 44px;
        align-items: center;
        column-gap: 6px;
        padding: 5px 6px;
        border: 1px solid #e2e8f2;
        border-radius: 12px;
        background: #fff;
        color: #344563;
        font-size: 13px;
        font-weight: 700;
        text-decoration: none;
        white-space: nowrap;
        box-shadow: 0 2px 6px rgba(30, 55, 90, .04);
        transition: transform .16s ease, box-shadow .16s ease, border-color .16s ease;
    }
    .bpa-dashboard-content .bpa-admin-action:hover {
        transform: translateY(-1px);
        border-color: #cbd7ea;
        color: #172554;
        box-shadow: 0 6px 14px rgba(30, 55, 90, .1);
    }
    .bpa-dashboard-content .bpa-admin-action-icon {
        display: inline-grid;
        width: 32px;
        height: 32px;
        flex: 0 0 32px;
        grid-column: 1;
        grid-row: 1;
        place-items: center;
        border-radius: 9px;
        background: #edf3ff;
        color: #315da8;
        font-size: 14px;
    }
    .bpa-dashboard-content .bpa-admin-action > span:last-child {
        grid-column: 2;
        grid-row: 1;
        text-align: center;
    }
    .bpa-dashboard-content .bpa-admin-action--budget .bpa-admin-action-icon {
        background: #eaf7f0;
        color: #248653;
    }
    .bpa-dashboard-content .bpa-admin-action--pdf {
        border-color: #f0d9dd;
        color: #a92c3b;
    }
    .bpa-dashboard-content .bpa-admin-action--pdf:hover {
        border-color: #e9b9c0;
        color: #8f1e2d;
    }
    .bpa-dashboard-content .bpa-admin-action--pdf .bpa-admin-action-icon {
        background: #fff0f1;
        color: #c43849;
    }
    .bpa-dashboard-content .bpa-unit-dashboard-year-form {
        flex: 0 0 115px;
        width: 115px;
        margin: 0;
    }
    .bpa-dashboard-content .bpa-unit-dashboard-tools {
        display: flex;
        flex: 0 0 auto;
        align-items: center;
        gap: 10px;
    }
    .bpa-dashboard-content .bpa-unit-dashboard-year-form .bpa-admin-year-select {
        box-sizing: border-box;
        width: 100%;
        min-width: 0;
        min-height: 44px;
    }
    .bpa-dashboard-content .bpa-unit-dashboard-actions {
        display: flex;
        flex: 0 0 auto;
    }
    .bpa-dashboard-content .bpa-unit-dashboard-actions .bpa-admin-action--program {
        width: 115px;
        flex: 0 0 115px;
        padding-right: 13px;
    }
    .bpa-dashboard-content .bpa-admin-chart-grid {
        align-items: stretch;
    }
    .bpa-dashboard-content .bpa-admin-chart-grid > [class*="col-"] {
        min-width: 0;
    }
    .bpa-dashboard-content .bpa-admin-chart-card {
        display: flex;
        width: 100%;
        height: 100%;
        min-height: 430px;
        flex-direction: column;
        background: #fff;
    }
    .bpa-dashboard-content .bpa-admin-chart-card .card-header-custom {
        flex: 0 0 auto;
        padding: 22px 25px;
        border-bottom: 1px solid #e7ebf2;
        background: linear-gradient(180deg, #fff, #fbfcff);
    }
    .bpa-dashboard-content .bpa-admin-chart-card .card-header-custom h5 {
        margin: 0;
        color: #111844;
        font-size: 15px;
        font-weight: 600;
        letter-spacing: -.01em;
    }
    .bpa-dashboard-content .bpa-admin-chart-card .card-header-custom span {
        display: block;
        margin-top: 4px;
        color: #7288ae;
        font-size: 11px;
    }
    .bpa-dashboard-content .bpa-admin-chart-card .pie-wrapper,
    .bpa-dashboard-content .bpa-admin-chart-card .chart-wrapper {
        box-sizing: border-box;
        flex: 0 0 330px;
    }
    .bpa-dashboard-content .bpa-admin-chart-card .chart-legend {
        flex: 0 0 auto;
    }
    .bpa-dashboard-content .bpa-admin-chart-card .bpa-admin-chart-legend {
        box-sizing: border-box;
        display: flex;
        width: 100%;
        flex-wrap: nowrap;
        justify-content: flex-start;
        gap: 7px 14px;
        overflow-x: auto;
    }
    .bpa-dashboard-content .bpa-admin-chart-card .bpa-admin-chart-legend .legend-item {
        flex: 0 0 auto;
        min-width: max-content;
        white-space: nowrap;
    }
    .bpa-dashboard-content .bpa-admin-chart-card .bpa-admin-chart-legend:not(.bpa-admin-status-legend) .legend-count {
        display: none;
    }
    .bpa-dashboard-content .bpa-admin-chart-card .pie-wrapper canvas,
    .bpa-dashboard-content .bpa-admin-chart-card .chart-wrapper canvas {
        position: relative;
        z-index: 1;
    }
    .bpa-dashboard-content .bpa-admin-chart-tooltip {
        position: absolute;
        z-index: 2;
        box-sizing: border-box;
        overflow: hidden;
        padding: 6px;
        border: 1px solid rgba(255, 255, 255, .16);
        border-radius: 6px;
        background: rgba(0, 0, 0, .38);
        box-shadow: 0 4px 14px rgba(15, 23, 42, .12);
        color: #fff;
        font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
        font-size: 12px;
        line-height: 1.2;
        pointer-events: none;
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        opacity: 0;
        transition: opacity .1s ease;
    }
    .bpa-dashboard-content .bpa-admin-chart-tooltip-title {
        margin-bottom: 6px;
        color: #fff;
        font-size: 12px;
        font-weight: 700;
        line-height: 1.2;
    }
    .bpa-dashboard-content .bpa-admin-chart-tooltip-row {
        display: flex;
        align-items: center;
        gap: 5px;
        min-height: 14px;
        color: #fff;
        white-space: nowrap;
    }
    .bpa-dashboard-content .bpa-admin-chart-tooltip-marker {
        width: 8px;
        height: 8px;
        flex: 0 0 8px;
        border-radius: 2px;
    }
    .bpa-dashboard-content .bpa-admin-chart-card .bpa-admin-chart-legend.bpa-admin-status-legend {
        display: flex;
        justify-content: space-between;
    }
    .bpa-dashboard-content .row.g-4.mb-4 > [class*="col-"] > .card {
        height: 100%;
    }
    .bpa-dashboard-content .row.g-4.mb-4 > [class*="col-"] > .card .card-body {
        padding: 20px 22px;
    }
    .bpa-dashboard-content .row.g-4.mb-4 h6 {
        font-size: 14px !important;
        font-weight: 700 !important;
        letter-spacing: -.01em;
    }
    .bpa-dashboard-content .badge-soft {
        background: #f0f3ff;
        color: #5263a6;
        font-size: 11px;
        font-weight: 600;
    }
    .bpa-dashboard-content > .container > .card.shadow-sm.border-0 > .card-body,
    .bpa-dashboard-content > .container-fluid > .card.shadow-sm.border-0 > .card-body {
        padding: 22px;
    }
    .bpa-dashboard-content .accordion {
        margin-top: 16px;
    }
    .bpa-dashboard-content .accordion-item {
        overflow: hidden;
        border: 1px solid #e4e9f2;
        border-radius: 12px !important;
    }
    .bpa-dashboard-content .accordion-item + .accordion-item {
        margin-top: 10px;
    }
    .bpa-dashboard-content .accordion-button {
        min-height: 54px;
        padding: 14px 18px;
        background: #f8faff;
        color: #263248;
        font-size: 13px;
        font-weight: 700;
        box-shadow: none;
    }
    .bpa-dashboard-content .accordion-button:not(.collapsed) {
        background: #f0f4ff;
        color: #304f91;
    }
    .bpa-dashboard-content .sku-dashboard-heading {
        padding: 22px 25px;
        border-bottom: 1px solid #e7ebf2;
        background: linear-gradient(180deg, #fff, #fbfcff);
    }
    .bpa-dashboard-content .sku-dashboard > .card-body {
        padding: 0 !important;
    }
    .bpa-dashboard-content .sku-dashboard-heading h5 {
        margin-bottom: 4px !important;
        color: #182338;
        font-size: 15px !important;
        font-weight: 600 !important;
    }
    .bpa-dashboard-content .sku-dashboard-section {
        overflow: visible;
        border-bottom: 1px solid #e7ebf2;
        background: #fff;
    }
    .bpa-dashboard-content .sku-section-heading {
        display: flex;
        align-items: center;
        gap: 12px;
        min-height: 56px;
        padding: 14px 25px;
    }
    .bpa-dashboard-content .sku-unit-badge {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        max-width: 100%;
        padding: 7px 12px;
        border: 1px solid color-mix(in srgb, var(--bpa-dashboard-accent) 24%, white);
        border-radius: 999px;
        background: var(--bpa-dashboard-tint);
        color: var(--bpa-dashboard-accent);
        font-size: 12px;
        font-weight: 700;
        line-height: 1.4;
    }
    .bpa-dashboard-content .sku-badge-separator {
        color: color-mix(in srgb, var(--bpa-dashboard-accent) 55%, white);
        font-weight: 500;
    }
    .bpa-dashboard-content .sku-section-count {
        color: var(--bpa-dashboard-accent);
        font-size: inherit;
        font-weight: 700;
        white-space: nowrap;
    }
    .bpa-dashboard-content .sku-section-content {
        padding: 4px 25px 20px;
        background: #fff;
    }
    .bpa-dashboard-content .sku-unit-group {
        padding: 16px 25px 28px;
        border-bottom: 1px solid #e7ebf2;
    }
    .bpa-dashboard-content .sku-unit-group:last-child {
        padding-bottom: 28px;
        border-bottom: 0;
    }
    .bpa-dashboard-content .sku-card {
        height: 100%;
        overflow: hidden;
        border-color: #e2e8f0 !important;
        border-radius: 12px !important;
        background: #fff;
        box-shadow: 0 4px 16px rgba(15, 23, 42, .035) !important;
        transition: box-shadow .16s ease, border-color .16s ease;
    }
    .bpa-dashboard-content .sku-card:hover {
        border-color: #cdd8ea !important;
        box-shadow: 0 8px 20px rgba(15, 23, 42, .07) !important;
    }
    .bpa-dashboard-content .sku-card .card-body {
        padding: 18px;
    }
    .bpa-dashboard-content .sku-card-layout {
        align-items: center;
    }
    .bpa-dashboard-content .sku-card-details {
        flex: 1;
        min-width: 0;
    }
    .bpa-dashboard-content .sku-chart {
        flex: 0 0 104px;
        width: 104px !important;
        padding: 8px 4px;
        border-radius: 8px;
        background: #fff;
    }
    .bpa-dashboard-content .sku-title {
        color: #273248;
        font-size: 13px;
        font-weight: 600;
        line-height: 1.5;
    }
    .bpa-dashboard-content .sku-card .badge-soft {
        padding: 5px 9px;
        background: #edf3ff;
        color: #4f6df5;
        font-size: 10px;
        font-weight: 600;
    }
    .bpa-dashboard-content .sku-card .badge {
        padding: 5px 9px;
        background: #f0f3ff !important;
        color: #5263a6 !important;
        font-size: 10px;
        font-weight: 600;
    }
    .bpa-dashboard-content .sku-card-details > .mt-2.small-muted {
        display: grid;
        gap: 4px;
        color: #778398;
        line-height: 1.45;
    }
    .bpa-dashboard-content .sku-card-details > .mt-2.small-muted b {
        color: #536176;
        font-weight: 600;
    }
    .bpa-dashboard-content .sku-target-exceeded {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        padding: 6px 9px;
        border: 1px solid #ccebdc;
        border-radius: 8px;
        background: #f0faf5;
        color: #21835b;
        font-size: 11px;
        font-weight: 600;
        line-height: 1.35;
    }
    .bpa-dashboard-content .sku-target-exceeded i {
        font-size: 14px;
        line-height: 1;
    }
    .bpa-dashboard-content .progress {
        height: 8px;
        background: #edf1f7;
    }
    .bpa-dashboard-content .sku-progress-bar {
        width: 0;
        transition: none;
    }
    .bpa-dashboard-content .miniChartWrap {
        width: 78px;
        height: 78px;
    }
    .bpa-dashboard-content .sku-chart > .small-muted {
        font-size: 10px;
    }
    @media (prefers-reduced-motion: reduce) {
        .bpa-dashboard-content .sku-progress-bar {
            transition: none;
        }
    }
    @media (max-width: 575.98px) {
        .bpa-dashboard-content .sku-dashboard-heading {
            padding: 18px 16px;
        }
        .bpa-dashboard-content .sku-dashboard-heading {
            align-items: flex-start !important;
            flex-direction: column;
            padding: 18px 16px;
        }
        .bpa-dashboard-content .sku-section-heading {
            padding: 13px 16px;
        }
        .bpa-dashboard-content .sku-section-content {
            padding: 4px 16px 16px;
        }
        .bpa-dashboard-content .sku-unit-group {
            padding: 14px 16px 24px;
        }
        .bpa-dashboard-content .sku-card .card-body {
            padding: 14px;
        }
        .bpa-dashboard-content .sku-card-layout {
            align-items: flex-start;
        }
        .bpa-dashboard-content .sku-chart {
            flex-basis: 76px;
            width: 76px !important;
            padding: 6px 2px;
        }
        .bpa-dashboard-content .miniChartWrap {
            width: 62px;
            height: 62px;
        }
    }
    .bpa-dashboard-content[data-dashboard-unit]:not([data-dashboard-unit="BPA"]) > .container > .d-flex h4 {
        font-size: 20px;
    }
    .bpa-dashboard-content[data-dashboard-unit]:not([data-dashboard-unit="BPA"]) > .container > .row.g-3.mb-3 {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(min(100%, 155px), 1fr));
        gap: 16px;
        margin: 0 0 16px !important;
    }
    .bpa-dashboard-content[data-dashboard-unit]:not([data-dashboard-unit="BPA"]) > .container > .row.g-3.mb-3 > [class*="col-"] {
        width: 100%;
        max-width: none;
        padding: 0;
        margin-top: 0 !important;
    }
    .bpa-dashboard-content[data-dashboard-unit]:not([data-dashboard-unit="BPA"]) .card-kpi {
        --bpa-unit-kpi-accent: #3478d4;
        --bpa-unit-kpi-tint: rgba(52, 120, 212, .07);
        position: relative;
        min-height: 126px;
        padding: 0 !important;
        background: #fff;
    }
    .bpa-dashboard-content[data-dashboard-unit]:not([data-dashboard-unit="BPA"]) .row.g-3.mb-3 > [class*="col-"]:nth-child(2) .card-kpi {
        --bpa-unit-kpi-accent: #8251c8;
        --bpa-unit-kpi-tint: rgba(130, 81, 200, .07);
    }
    .bpa-dashboard-content[data-dashboard-unit]:not([data-dashboard-unit="BPA"]) .row.g-3.mb-3 > [class*="col-"]:nth-child(3) .card-kpi {
        --bpa-unit-kpi-accent: #d78a1f;
        --bpa-unit-kpi-tint: rgba(215, 138, 31, .08);
    }
    .bpa-dashboard-content[data-dashboard-unit]:not([data-dashboard-unit="BPA"]) .row.g-3.mb-3 > [class*="col-"]:nth-child(4) .card-kpi {
        --bpa-unit-kpi-accent: #21946a;
        --bpa-unit-kpi-tint: rgba(33, 148, 106, .07);
    }
    .bpa-dashboard-content[data-dashboard-unit]:not([data-dashboard-unit="BPA"]) .row.g-3.mb-3:nth-of-type(3) > [class*="col-"]:first-child .card-kpi {
        --bpa-unit-kpi-accent: #d64553;
        --bpa-unit-kpi-tint: rgba(214, 69, 83, .07);
    }
    .bpa-dashboard-content[data-dashboard-unit]:not([data-dashboard-unit="BPA"]) .row.g-3.mb-3:nth-of-type(3) > [class*="col-"]:last-child .card-kpi {
        --bpa-unit-kpi-accent: #26976a;
        --bpa-unit-kpi-tint: rgba(38, 151, 106, .07);
    }
    .bpa-dashboard-content[data-dashboard-unit]:not([data-dashboard-unit="BPA"]) .card-kpi::before {
        position: absolute;
        inset: 0 0 auto;
        z-index: 1;
        height: 4px;
        background: var(--bpa-unit-kpi-accent);
        content: "";
    }
    .bpa-dashboard-content[data-dashboard-unit]:not([data-dashboard-unit="BPA"]) .card-kpi::after {
        position: absolute;
        right: -24px;
        bottom: -34px;
        width: 105px;
        height: 105px;
        border-radius: 50%;
        background: var(--bpa-unit-kpi-tint);
        content: "";
        pointer-events: none;
    }
    .bpa-dashboard-content[data-dashboard-unit]:not([data-dashboard-unit="BPA"]) .card-kpi .card-body {
        position: relative;
        z-index: 1;
        display: flex;
        min-height: 126px;
        flex-direction: column;
        align-items: flex-start;
        justify-content: center;
        gap: 4px;
        padding: 20px !important;
    }
    .bpa-dashboard-content[data-dashboard-unit]:not([data-dashboard-unit="BPA"]) .card-kpi .small-muted:first-child {
        color: #748096 !important;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: .045em;
        line-height: 1.4;
        text-transform: uppercase;
    }
    .bpa-dashboard-content[data-dashboard-unit]:not([data-dashboard-unit="BPA"]) .card-kpi .kpi-number {
        color: #1b2639 !important;
        font-size: clamp(18px, 1.55vw, 23px) !important;
        font-weight: 750;
        letter-spacing: -.025em;
        line-height: 1.25;
        white-space: nowrap;
        overflow-wrap: normal;
        font-variant-numeric: tabular-nums;
    }
    .bpa-dashboard-content .bpa-dashboard-sku-enter {
        animation: bpa-dashboard-fade-in-up .45s cubic-bezier(.2, .75, .25, 1) both;
        animation-delay: .08s;
    }
    .bpa-dashboard-content .bpa-dashboard-content-enter {
        animation: bpa-dashboard-fade-in-up .75s cubic-bezier(.2, .75, .25, 1) both;
    }
    .bpa-dashboard-content .bpa-dashboard-title-enter {
        animation: bpa-dashboard-fade-in-up .45s cubic-bezier(.2, .75, .25, 1) both;
    }
    .bpa-dashboard-content .bpa-dashboard-toolbar-control-enter {
        animation: bpa-dashboard-toolbar-fade-in-up .6s cubic-bezier(.2, .75, .25, 1) both;
        animation-delay: var(--bpa-dashboard-toolbar-enter-delay, 0ms);
    }
    .bpa-shell-page[data-program-list-view] .bpa-dashboard-content-enter {
        animation: bpa-dashboard-fade-in-up .75s cubic-bezier(.2, .75, .25, 1) both;
        animation-delay: var(--bpa-dashboard-toolbar-enter-delay, 0ms);
    }
    .bpa-shell-page[data-program-list-view] .bpa-dashboard-title-enter {
        animation: bpa-dashboard-fade-in-up .45s cubic-bezier(.2, .75, .25, 1) both;
    }
    .bpa-shell-page[data-program-list-view] .bpa-dashboard-toolbar-control-enter {
        animation: bpa-dashboard-toolbar-fade-in-up .6s cubic-bezier(.2, .75, .25, 1) both;
        animation-delay: var(--bpa-dashboard-toolbar-enter-delay, 0ms);
    }
    @media (prefers-reduced-motion: reduce) {
        .bpa-shell-page.bpa-dashboard-content .bpa-dashboard-content-enter {
            animation-name: bpa-dashboard-fade-in-up !important;
            animation-duration: .6s !important;
        }
        .bpa-shell-page[data-program-list-view] .bpa-dashboard-content-enter,
        .bpa-shell-page[data-program-list-view] .bpa-dashboard-title-enter,
        .bpa-shell-page[data-program-list-view] .bpa-dashboard-toolbar-control-enter {
            animation-duration: .01ms !important;
            animation-delay: 0ms !important;
        }
        .bpa-shell-page.bpa-dashboard-content .bpa-dashboard-title-enter {
            animation-duration: .35s !important;
        }
        .bpa-shell-page.bpa-dashboard-content .bpa-dashboard-toolbar-control-enter {
            animation-duration: .4s !important;
        }
    }
    @keyframes bpa-dashboard-fade-in-up {
        from {
            opacity: 0;
            transform: translateY(12px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }
    @keyframes bpa-dashboard-toolbar-fade-in-up {
        from {
            opacity: 0;
            transform: translateY(16px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }
    .bpa-dashboard-content[data-dashboard-unit]:not([data-dashboard-unit="BPA"]) .card-kpi .small-muted:not(:first-child) {
        font-size: 11px;
        line-height: 1.4;
    }
    .bpa-dashboard-content[data-dashboard-unit]:not([data-dashboard-unit="BPA"]) .container > .card.shadow-sm.border-0.mb-3 > .card-body,
    .bpa-dashboard-content[data-dashboard-unit]:not([data-dashboard-unit="BPA"]) .container > .row.g-3:not(.mb-3) > [class*="col-"] > .card > .card-body {
        padding: 20px;
    }
    .bpa-dashboard-content[data-dashboard-unit]:not([data-dashboard-unit="BPA"]) .container > .card.shadow-sm.border-0.mb-3 h6,
    .bpa-dashboard-content[data-dashboard-unit]:not([data-dashboard-unit="BPA"]) .container > .row.g-3:not(.mb-3) h6 {
        margin-bottom: 16px !important;
        color: #202c41;
        font-size: 14px !important;
        font-weight: 700 !important;
        letter-spacing: -.01em;
    }
    .bpa-dashboard-content[data-dashboard-unit]:not([data-dashboard-unit="BPA"]) .bpa-unit-card-header {
        position: relative;
        z-index: 1;
        flex: 0 0 auto;
        margin: 0 !important;
        padding: 22px 25px;
        border-bottom: 1px solid #e7ebf2;
        background: linear-gradient(180deg, #fff, #fbfcff);
    }
    .bpa-dashboard-content[data-dashboard-unit]:not([data-dashboard-unit="BPA"]) .bpa-unit-card-header h5 {
        margin: 0;
        color: #111844;
        font-size: 15px;
        font-weight: 600;
        letter-spacing: -.01em;
    }
    .bpa-dashboard-content[data-dashboard-unit]:not([data-dashboard-unit="BPA"]) .bpa-unit-card-header span {
        display: block;
        margin-top: 4px;
        color: #7288ae;
        font-size: 11px;
    }
    .bpa-dashboard-content[data-dashboard-unit]:not([data-dashboard-unit="BPA"]) table.table thead th {
        background: #f0f4fb !important;
        border-color: #e3e9f2 !important;
        color: #526078 !important;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: .045em;
        padding: 11px 10px;
        text-transform: uppercase;
    }
    .bpa-dashboard-content[data-dashboard-unit]:not([data-dashboard-unit="BPA"]) table.table tbody td {
        border-color: #edf0f5 !important;
        font-size: 12px;
        line-height: 1.5;
        padding: 11px 10px;
    }
    .bpa-dashboard-content[data-dashboard-unit]:not([data-dashboard-unit="BPA"]) table.table tbody tr:nth-child(odd) td {
        background: #fff !important;
    }
    .bpa-dashboard-content[data-dashboard-unit]:not([data-dashboard-unit="BPA"]) table.table tbody tr:nth-child(even) td {
        background: #f8faff !important;
    }
    .bpa-dashboard-content[data-dashboard-unit]:not([data-dashboard-unit="BPA"]) table.table tbody tr:hover td {
        background: #edf3ff !important;
    }
    .bpa-dashboard-content[data-dashboard-unit]:not([data-dashboard-unit="BPA"]) .status-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 24px;
        padding: 0 9px;
        border: 0;
        border-radius: 5px !important;
        font-size: 10px;
        font-weight: 600;
        letter-spacing: .3px;
        line-height: 1.2;
        text-transform: uppercase;
    }
    .bpa-dashboard-content[data-dashboard-unit]:not([data-dashboard-unit="BPA"]) .status-badge.bg-secondary {
        background: #e2e8f0 !important;
        color: #475569 !important;
    }
    .bpa-dashboard-content[data-dashboard-unit]:not([data-dashboard-unit="BPA"]) .status-badge.bg-primary {
        background: #dbeafe !important;
        color: #1d4ed8 !important;
    }
    .bpa-dashboard-content[data-dashboard-unit]:not([data-dashboard-unit="BPA"]) .status-badge.bg-success {
        background: #dcfce7 !important;
        color: #166534 !important;
    }
    .bpa-dashboard-content[data-dashboard-unit]:not([data-dashboard-unit="BPA"]) .status-badge.bg-danger {
        background: #fee2e2 !important;
        color: #b91c1c !important;
    }
    .bpa-dashboard-content[data-dashboard-unit]:not([data-dashboard-unit="BPA"]) table.table tbody td.bpa-sku-achievement-over {
        color: #16803c !important;
        font-weight: 700;
        font-size: 10px;
    }
    .bpa-dashboard-content[data-dashboard-unit]:not([data-dashboard-unit="BPA"]) > .container > .card.shadow-sm.border-0.mb-3,
    .bpa-dashboard-content[data-dashboard-unit]:not([data-dashboard-unit="BPA"]) > .container > .card.shadow-sm.border-0.mb-3 + .row.g-3 > [class*="col-"] > .card {
        position: relative;
        overflow: hidden;
        border-color: #e2e8f0 !important;
        border-radius: 12px !important;
        box-shadow: 0 8px 24px rgba(15, 23, 42, .045) !important;
    }
    .bpa-dashboard-content[data-dashboard-unit]:not([data-dashboard-unit="BPA"]) > .container > .card.shadow-sm.border-0.mb-3::before,
    .bpa-dashboard-content[data-dashboard-unit]:not([data-dashboard-unit="BPA"]) > .container > .card.shadow-sm.border-0.mb-3 + .row.g-3 > [class*="col-"] > .card::before {
        position: absolute;
        inset: 0 0 auto;
        z-index: 1;
        height: 3px;
        background: #3478d4;
        content: "";
    }
    .bpa-dashboard-content[data-dashboard-unit]:not([data-dashboard-unit="BPA"]) > .container > .card.shadow-sm.border-0.mb-3 > .card-body,
    .bpa-dashboard-content[data-dashboard-unit]:not([data-dashboard-unit="BPA"]) > .container > .card.shadow-sm.border-0.mb-3 + .row.g-3 > [class*="col-"] > .card > .card-body {
        padding: 0 !important;
    }
    .bpa-dashboard-content[data-dashboard-unit]:not([data-dashboard-unit="BPA"]) > .container > .card.shadow-sm.border-0.mb-3 h6,
    .bpa-dashboard-content[data-dashboard-unit]:not([data-dashboard-unit="BPA"]) > .container > .card.shadow-sm.border-0.mb-3 + .row.g-3 > [class*="col-"] > .card h6 {
        position: relative;
        z-index: 1;
        display: flex;
        min-height: 58px;
        align-items: center;
        margin: 0 !important;
        padding: 17px 20px;
        border-bottom: 1px solid #e8edf5;
        background: linear-gradient(180deg, #fff, #fbfcff);
    }
    .bpa-dashboard-content[data-dashboard-unit]:not([data-dashboard-unit="BPA"]) > .container > .card.shadow-sm.border-0.mb-3 .table-responsive,
    .bpa-dashboard-content[data-dashboard-unit]:not([data-dashboard-unit="BPA"]) > .container > .card.shadow-sm.border-0.mb-3 + .row.g-3 > [class*="col-"] > .card .table-responsive {
        padding: 0;
    }
    .bpa-dashboard-content[data-dashboard-unit]:not([data-dashboard-unit="BPA"]) > .container > .card.shadow-sm.border-0.mb-3 table.table,
    .bpa-dashboard-content[data-dashboard-unit]:not([data-dashboard-unit="BPA"]) > .container > .card.shadow-sm.border-0.mb-3 + .row.g-3 > [class*="col-"] > .card table.table {
        overflow: hidden;
        margin-bottom: 0;
        border: 0;
        border-radius: 0;
    }
    .bpa-dashboard-content[data-dashboard-unit]:not([data-dashboard-unit="BPA"]) > .container > .card.shadow-sm.border-0.mb-3 table.table > :not(caption) > * > *,
    .bpa-dashboard-content[data-dashboard-unit]:not([data-dashboard-unit="BPA"]) > .container > .card.shadow-sm.border-0.mb-3 + .row.g-3 > [class*="col-"] > .card table.table > :not(caption) > * > * {
        border-right: 0 !important;
        border-left: 0 !important;
        border-bottom-color: #edf0f5 !important;
    }
    .bpa-dashboard-content[data-dashboard-unit]:not([data-dashboard-unit="BPA"]) > .container > .card.shadow-sm.border-0.mb-3 table.table tbody tr:last-child td,
    .bpa-dashboard-content[data-dashboard-unit]:not([data-dashboard-unit="BPA"]) > .container > .card.shadow-sm.border-0.mb-3 + .row.g-3 > [class*="col-"] > .card table.table tbody tr:last-child td {
        border-bottom: 0 !important;
    }
    .bpa-dashboard-content[data-dashboard-unit]:not([data-dashboard-unit="BPA"]) > .container > .card.shadow-sm.border-0.mb-3 table.table tbody td:nth-child(2),
    .bpa-dashboard-content[data-dashboard-unit]:not([data-dashboard-unit="BPA"]) > .container > .card.shadow-sm.border-0.mb-3 + .row.g-3 > [class*="col-"] > .card table.table tbody td:first-child {
        color: #344054;
        font-weight: 600;
    }
    .bpa-dashboard-content[data-dashboard-unit]:not([data-dashboard-unit="BPA"]) > .container > .card.shadow-sm.border-0.mb-3 table.table tbody td:last-child {
        color: #3478d4;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
    }
    .bpa-dashboard-content[data-dashboard-unit]:not([data-dashboard-unit="BPA"]) > .container > .card.shadow-sm.border-0.mb-3 > .card-body > .text-muted,
    .bpa-dashboard-content[data-dashboard-unit]:not([data-dashboard-unit="BPA"]) > .container > .card.shadow-sm.border-0.mb-3 + .row.g-3 > [class*="col-"] > .card > .card-body > .text-muted {
        margin: 16px 20px 20px;
        padding: 14px 16px;
        border: 1px dashed #dfe6f0;
        border-radius: 9px;
        background: #f8faff;
        color: #748096 !important;
        font-size: 13px;
        line-height: 1.5;
    }
    .bpa-dashboard-content[data-dashboard-unit]:not([data-dashboard-unit="BPA"]) > .container > .card.shadow-sm.border-0.mb-3 + .row.g-3 > [class*="col-"] {
        display: flex;
        align-items: flex-start;
    }
    .bpa-dashboard-content[data-dashboard-unit]:not([data-dashboard-unit="BPA"]) > .container > .card.shadow-sm.border-0.mb-3 + .row.g-3 > [class*="col-"] > .card {
        width: 100%;
    }
    .bpa-shell-page [data-bpa-list-page] > .d-flex.justify-content-between.align-items-center.mb-3 {
        min-height: 0;
        margin-bottom: 16px !important;
        padding: 0;
        border: 0;
        border-radius: 0;
        background: transparent;
        box-shadow: none;
    }
    .bpa-shell-page > [data-bpa-list-page="program"].container-fluid {
        padding-right: 0 !important;
        padding-left: 0 !important;
    }
    .bpa-shell-page [data-bpa-list-page] > .d-flex.justify-content-between.align-items-center.mb-3 h4 {
        color: #172033;
        font-size: 19px;
        font-weight: 700 !important;
        letter-spacing: -.025em;
    }
    .bpa-shell-page [data-bpa-list-page] > .d-flex.justify-content-between.align-items-center.mb-3 small {
        display: block;
        margin-top: 5px;
        color: #748096 !important;
        font-size: 12px;
        line-height: 1.5;
    }
    .bpa-shell-page [data-bpa-list-page] > .d-flex.justify-content-between.align-items-center.mb-3 > div:last-child,
    .bpa-shell-page [data-bpa-list-page] > .d-flex.justify-content-between.align-items-center.mb-3 > .d-flex {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: flex-end;
        gap: 8px;
    }
    .bpa-shell-page [data-bpa-list-page] > .card.shadow-sm.border-0.mb-3,
    .bpa-shell-page [data-bpa-list-page] > .card.filter-card {
        border-color: #e2e8f0 !important;
        border-radius: 12px !important;
        box-shadow: 0 8px 24px rgba(15, 23, 42, .04) !important;
    }
    .bpa-shell-page [data-bpa-list-page] > .card.shadow-sm.border-0.mb-3 > .card-body,
    .bpa-shell-page [data-bpa-list-page] > .card.filter-card > .card-body {
        padding: 20px !important;
    }
    .bpa-shell-page [data-bpa-list-page] .form-label {
        margin-bottom: 6px;
        color: #526078;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: .035em;
    }
    .bpa-shell-page [data-bpa-list-page] .row.g-2,
    .bpa-shell-page [data-bpa-list-page] .row.g-3 {
        --bs-gutter-y: 16px;
    }
    .bpa-shell-page [data-bpa-list-page="budget"] .budget-page-header {
        align-items: center;
        gap: 16px;
        height: auto;
        min-height: 0;
        margin-bottom: 16px !important;
        padding: 0;
        overflow: visible;
        box-sizing: border-box;
    }
    .bpa-shell-page [data-bpa-list-page="sku"] .sku-page-header {
        align-items: center;
        gap: 16px;
        height: auto;
        min-height: 0;
        margin-bottom: 16px;
        padding: 0;
        overflow: visible;
        box-sizing: border-box;
    }
    .bpa-shell-page [data-bpa-list-page="sku"] .sku-page-actions {
        display: flex;
        align-items: center;
        gap: 8px;
    }
    .bpa-shell-page [data-bpa-list-page="sku"] .sku-list-action {
        display: grid;
        box-sizing: border-box;
        width: 125px;
        flex: 0 0 125px;
        min-height: 44px;
        grid-template-columns: 32px minmax(0, 1fr);
        align-items: center;
        column-gap: 6px;
        padding: 5px 6px;
        border: 1px solid #e2e8f2;
        border-radius: 12px;
        background: #fff;
        color: #344563;
        font-size: 13px;
        font-weight: 700;
        text-decoration: none;
        white-space: nowrap;
        box-shadow: 0 2px 6px rgba(30, 55, 90, .04);
        transition: transform .16s ease, box-shadow .16s ease, border-color .16s ease;
    }
    .bpa-shell-page [data-bpa-list-page="sku"] .sku-list-action:hover {
        transform: translateY(-1px);
        border-color: #cbd7ea;
        color: #172554;
        box-shadow: 0 6px 14px rgba(30, 55, 90, .1);
    }
    .bpa-shell-page [data-bpa-list-page="sku"] .sku-list-action-icon {
        display: inline-grid;
        width: 32px;
        height: 32px;
        grid-column: 1;
        grid-row: 1;
        place-items: center;
        border-radius: 9px;
        background: #edf3ff;
        color: #315da8;
        font-size: 14px;
    }
    .bpa-shell-page [data-bpa-list-page="sku"] .sku-list-action--primary .sku-list-action-icon {
        background: #eaf7f0;
        color: #248653;
    }
    .bpa-shell-page [data-bpa-list-page="sku"] .sku-list-action--excel {
        border-color: #d3eadc;
        color: #237b4b;
    }
    .bpa-shell-page [data-bpa-list-page="sku"] .sku-list-action--excel:hover {
        border-color: #b7ddc7;
        color: #185f39;
    }
    .bpa-shell-page [data-bpa-list-page="sku"] .sku-list-action--excel .sku-list-action-icon {
        background: #eaf7f0;
        color: #248653;
    }
    .bpa-shell-page [data-bpa-list-page="sku"] .sku-list-action--pdf {
        border-color: #f0d9dd;
        color: #a92c3b;
    }
    .bpa-shell-page [data-bpa-list-page="sku"] .sku-list-action--pdf:hover {
        border-color: #e9b9c0;
        color: #8f1e2d;
    }
    .bpa-shell-page [data-bpa-list-page="sku"] .sku-list-action--pdf .sku-list-action-icon {
        background: #fff0f1;
        color: #c43849;
    }
    .bpa-shell-page [data-bpa-list-page="sku"] .sku-list-action > span:last-child {
        grid-column: 2;
        grid-row: 1;
        text-align: center;
    }
    .bpa-shell-page [data-bpa-list-page="budget"] > .d-flex.justify-content-between.align-items-center.mb-3.budget-page-header {
        height: auto;
        min-height: 0;
    }
    .bpa-shell-page [data-bpa-list-page="budget"] .budget-page-actions,
    .bpa-shell-page[data-program-list-unit] .budget-page-actions {
        display: flex;
        align-items: center;
        gap: 8px;
    }
    .bpa-shell-page [data-bpa-list-page="budget"] .budget-list-action,
    .bpa-shell-page[data-program-list-unit] .budget-list-action {
        display: grid;
        box-sizing: border-box;
        width: 125px;
        flex: 0 0 125px;
        min-height: 44px;
        grid-template-columns: 32px minmax(0, 1fr);
        align-items: center;
        column-gap: 6px;
        padding: 5px 6px;
        border: 1px solid #e2e8f2;
        border-radius: 12px;
        background: #fff;
        color: #344563;
        font-size: 13px;
        font-weight: 700;
        text-decoration: none;
        white-space: nowrap;
        box-shadow: 0 2px 6px rgba(30, 55, 90, .04);
        transition: transform .16s ease, box-shadow .16s ease, border-color .16s ease;
    }
    .bpa-shell-page [data-bpa-list-page="budget"] .budget-list-action:hover,
    .bpa-shell-page[data-program-list-unit] .budget-list-action:hover {
        transform: translateY(-1px);
        border-color: #cbd7ea;
        color: #172554;
        box-shadow: 0 6px 14px rgba(30, 55, 90, .1);
    }
    .bpa-shell-page [data-bpa-list-page="budget"] .budget-list-action-icon,
    .bpa-shell-page[data-program-list-unit] .budget-list-action-icon {
        display: inline-grid;
        width: 32px;
        height: 32px;
        grid-column: 1;
        grid-row: 1;
        place-items: center;
        border-radius: 9px;
        background: #edf3ff;
        color: #315da8;
        font-size: 14px;
    }
    .bpa-shell-page [data-bpa-list-page="budget"] .budget-list-action--primary .budget-list-action-icon,
    .bpa-shell-page[data-program-list-unit] .budget-list-action--primary .budget-list-action-icon {
        background: #eaf7f0;
        color: #248653;
    }
    .bpa-shell-page [data-bpa-list-page="budget"] .budget-list-action > span:last-child,
    .bpa-shell-page[data-program-list-unit] .budget-list-action > span:last-child {
        grid-column: 2;
        grid-row: 1;
        text-align: center;
    }
    .bpa-shell-page [data-bpa-list-page="budget"] .budget-filter-card {
        display: flex;
        align-items: center;
        gap: 24px;
        height: 82px;
        min-height: 82px;
        margin-bottom: 16px !important;
        padding: 12px 24px;
        overflow: visible;
        box-sizing: border-box;
    }
    .bpa-shell-page [data-bpa-list-page="budget"] .budget-summary-cards {
        margin-top: 0 !important;
    }
    .bpa-shell-page [data-bpa-list-page="budget"] .budget-summary-cards > [class*="col-"] {
        margin-top: 0 !important;
    }
    .bpa-shell-page [data-bpa-list-page="budget"] .budget-filter-heading {
        flex: 0 1 420px;
        min-width: 220px;
    }
    .bpa-shell-page [data-bpa-list-page="budget"] .budget-filter-heading h4 {
        margin: 0;
        color: #17243b;
        font-size: 14px;
        font-weight: 600;
    }
    .bpa-shell-page [data-bpa-list-page="budget"] .budget-filter-heading p {
        margin: 5px 0 0;
        color: #64748b;
        font-size: 12px;
        line-height: 1.5;
    }
    .bpa-shell-page [data-bpa-list-page="budget"] .budget-filter-controls {
        display: flex;
        flex: 1 1 620px;
        justify-content: flex-end;
        min-width: 0;
    }
    .bpa-shell-page [data-bpa-list-page="budget"] .budget-filter-toolbar {
        display: flex;
        align-items: center;
        gap: 0;
        flex: 1 1 auto;
        width: min(100%, 820px);
        max-width: 820px;
        height: 44px;
        margin: 0;
        border: 1px solid #d7dfeb;
        border-radius: 11px;
        background: #f8faff;
        box-shadow: 0 4px 12px rgba(15, 23, 42, .04);
        overflow: visible;
    }
    .bpa-shell-page [data-bpa-list-page="budget"] .budget-search-box {
        flex: 1 1 auto;
        min-width: 0;
        height: 42px;
        border: 0;
        border-radius: 10px 0 0 10px;
        background: transparent;
    }
    .bpa-shell-page [data-bpa-list-page="budget"] .budget-search-box:focus-within {
        border-radius: 10px 0 0 10px;
        box-shadow: inset 0 0 0 2px rgba(80, 111, 244, .28);
    }
    .bpa-shell-page [data-bpa-list-page="budget"] .budget-search-box input {
        width: 100%;
        min-width: 0;
        height: 42px;
        padding: 0 14px 0 9px;
        border: 0;
        outline: 0;
        background: transparent;
        color: #344054;
        font: 13px/42px var(--app-font-family);
        box-shadow: none;
    }
    .bpa-shell-page [data-bpa-list-page="budget"] .budget-search-box input::placeholder {
        color: #98a2b3;
    }
    .bpa-shell-page [data-bpa-list-page="budget"] .budget-filter-group {
        display: flex;
        flex: 0 0 auto;
        align-items: center;
        gap: 4px;
        height: 42px;
        margin: 0;
        padding: 0 4px;
        border: 0;
        border-radius: 0 10px 10px 0;
        background: transparent;
    }
    .bpa-shell-page [data-bpa-list-page="budget"] .budget-filter-select {
        width: 112px;
        height: 36px;
        padding: 0 28px 0 11px;
        border: 0;
        border-right: 1px solid #e1e7f0;
        border-radius: 6px 0 0 6px;
        background-color: transparent;
        color: #344054;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
    }
    .bpa-shell-page [data-bpa-list-page="budget"] .budget-filter-select:focus {
        outline: 0;
        box-shadow: inset 0 0 0 1px #91aaf5;
    }
    .bpa-shell-page [data-bpa-list-page="budget"] .budget-filter-select--unit {
        width: 180px;
        border-radius: 0;
    }
    .bpa-shell-page [data-bpa-list-page="budget"] .budget-filter-group > .custom-select:nth-of-type(1) {
        width: 42px;
        flex: 0 0 42px;
    }
    .bpa-shell-page [data-bpa-list-page="budget"] .budget-filter-group > .custom-select:nth-of-type(2) {
        width: 42px;
        flex: 0 0 42px;
        min-width: 0;
    }
    .bpa-shell-page [data-bpa-list-page="budget"] .budget-filter-group .custom-select-button {
        display: flex;
        width: 38px;
        height: 34px;
        min-height: 34px;
        align-items: center;
        justify-content: center;
        gap: 0;
        margin: 0 auto;
        padding: 0;
        border: 1px solid transparent;
        border-radius: 7px;
        background: transparent;
        color: #344054;
        font-size: 18px;
        font-weight: 600;
        transition: background .15s ease, border-color .15s ease, color .15s ease, box-shadow .15s ease;
    }
    .bpa-shell-page [data-bpa-list-page="budget"] .budget-filter-group .custom-select-button:hover:not(:disabled) {
        border-color: #cbd6e6;
        background: #fff;
        color: var(--primary-dark);
        box-shadow: 0 3px 8px rgba(15, 23, 42, .06);
    }
    .bpa-shell-page [data-bpa-list-page="budget"] .budget-filter-group .custom-select-button:hover:not(:disabled) > i {
        color: var(--primary-dark);
    }
    .bpa-shell-page [data-bpa-list-page="budget"] .budget-filter-group .custom-select-button > i {
        flex: 0 0 auto;
        color: #667085;
        font-size: 14px;
    }
    .bpa-shell-page [data-bpa-list-page="budget"] .budget-filter-group .custom-select-button > span {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .bpa-shell-page [data-bpa-list-page="budget"] .budget-filter-group .custom-select-button::after {
        right: 5px;
    }
    .bpa-shell-page [data-bpa-list-page="budget"] .budget-filter-group .custom-select-button[data-icon-only="true"] > i {
        font-size: 18px;
    }
    .bpa-shell-page [data-bpa-list-page="budget"] .budget-filter-group .custom-select.show .custom-select-button {
        border-radius: 6px;
        background: #fff;
    }
    .bpa-shell-page [data-bpa-list-page="budget"] .budget-filter-group .custom-select-button[data-icon-only="true"]::after {
        display: none;
    }
    .bpa-shell-page [data-bpa-list-page="budget"] .budget-filter-group > .custom-select .custom-select-menu {
        left: auto;
        right: 0;
        box-sizing: border-box;
        width: 140px;
        min-width: 140px;
        border: 1px solid #dfe6f0;
        border-radius: 9px;
        background: #fff;
        color: #172033;
        box-shadow: 0 10px 26px rgba(15, 23, 42, .14);
    }
    .bpa-shell-page [data-bpa-list-page="budget"] .budget-filter-group > .custom-select:nth-of-type(2) .custom-select-menu {
        width: 176px;
        min-width: 176px;
    }
    .bpa-shell-page [data-bpa-list-page="budget"] .budget-filter-group .custom-select-option {
        min-height: 34px;
        padding: 8px 10px;
        color: #172033;
        font-size: 13px;
        line-height: 18px;
        white-space: nowrap;
    }
    .bpa-shell-page [data-bpa-list-page="budget"] .budget-filter-group .custom-select-option:hover,
    .bpa-shell-page [data-bpa-list-page="budget"] .budget-filter-group .custom-select-option.active {
        background: #eef4ff;
        color: #3155c8;
    }
    .bpa-shell-page [data-bpa-list-page="budget"] .budget-table-card {
        overflow: hidden;
    }
    .bpa-shell-page [data-bpa-list-page="budget"] .budget-table-card.budget-table-enter {
        animation: bpa-dashboard-fade-in-up .45s cubic-bezier(.2, .75, .25, 1) both;
    }
    .bpa-shell-page [data-bpa-list-page="budget"] .budget-table-header {
        display: flex;
        min-height: 76px;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        padding: 18px 22px;
        border-bottom: 1px solid #e7ebf2;
        background: linear-gradient(180deg, #fff, #fbfcff);
    }
    .bpa-shell-page [data-bpa-list-page="budget"] .budget-table-header h5 {
        margin: 0;
        color: #111844;
        font-size: 15px;
        font-weight: 600;
        letter-spacing: -.01em;
    }
    .bpa-shell-page [data-bpa-list-page="budget"] .budget-table-header span {
        display: block;
        margin-top: 4px;
        color: #7288ae;
        font-size: 11px;
    }
    .bpa-shell-page [data-bpa-list-page="budget"] .budget-table-header .budget-record-count {
        flex: 0 0 auto;
        margin: 0;
        padding: 6px 10px;
        border: 1px solid #e3eaf5;
        border-radius: 999px;
        background: #f6f8fc;
        color: #526078;
        font-weight: 600;
    }
    .bpa-shell-page [data-bpa-list-page="budget"] .budget-table-card > .card-body {
        padding: 0 !important;
    }
    .bpa-shell-page [data-bpa-list-page="budget"] .budget-table-responsive {
        padding: 0;
        overscroll-behavior-x: contain;
    }
    .bpa-shell-page [data-bpa-list-page="budget"] table.budget-table {
        width: 100%;
        min-width: 0;
        table-layout: fixed;
        margin-bottom: 0;
        border-radius: 0;
    }
    .bpa-shell-page [data-bpa-list-page="budget"] table.budget-table thead th {
        text-align: center !important;
    }
    .bpa-shell-page [data-bpa-list-page="budget"] table.budget-table tbody td:nth-child(1),
    .bpa-shell-page [data-bpa-list-page="budget"] table.budget-table tbody td:nth-child(2) {
        text-align: center;
    }
    .bpa-shell-page [data-bpa-list-page="budget"] table.budget-table th:nth-child(1) { width: 6%; }
    .bpa-shell-page [data-bpa-list-page="budget"] table.budget-table th:nth-child(2) { width: 8%; }
    .bpa-shell-page [data-bpa-list-page="budget"] table.budget-table th:nth-child(3) { width: 15%; }
    .bpa-shell-page [data-bpa-list-page="budget"] table.budget-table th:nth-child(4) { width: 17%; }
    .bpa-shell-page [data-bpa-list-page="budget"] table.budget-table th:nth-child(5) { width: 15%; }
    .bpa-shell-page [data-bpa-list-page="budget"] table.budget-table th:nth-child(6) { width: 23%; }
    .bpa-shell-page [data-bpa-list-page="budget"] table.budget-table th:nth-child(7) { width: 16%; }
    .bpa-shell-page [data-bpa-list-page="budget"] table.budget-table .badge {
        border: 0;
        font-size: 10px;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
    }
    .bpa-shell-page [data-bpa-list-page="budget"] table.budget-table .status-badge {
        display: inline-flex;
        min-height: 24px;
        align-items: center;
        justify-content: center;
        padding: 0 9px;
        border: 0;
        border-radius: 5px !important;
        font-size: 10px;
        font-weight: 600;
        letter-spacing: .3px;
        line-height: 1.2;
        text-transform: uppercase;
    }
    .bpa-shell-page [data-bpa-list-page="budget"] table.budget-table .budget-unit-badge {
        border: 0;
        border-radius: 999px;
        background: var(--bpa-dashboard-tint) !important;
        color: var(--bpa-dashboard-accent) !important;
    }
    .bpa-shell-page [data-bpa-list-page="budget"] table.budget-table .badge.bg-success {
        background: #dcfce7 !important;
        color: #166534 !important;
    }
    .bpa-shell-page [data-bpa-list-page="budget"] table.budget-table .status-badge.bg-success {
        background: #dcfce7 !important;
        color: #166534 !important;
    }
    .bpa-shell-page [data-bpa-list-page="budget"] table.budget-table .badge.bg-danger {
        background: #fee2e2 !important;
        color: #b91c1c !important;
    }
    .bpa-shell-page [data-bpa-list-page="budget"] table.budget-table .status-badge.bg-danger {
        background: #fee2e2 !important;
        color: #b91c1c !important;
    }
    .bpa-shell-page [data-bpa-list-page="budget"] table.budget-table .badge.bg-dark {
        background: #e2e8f0 !important;
        color: #475569 !important;
    }
    .bpa-shell-page [data-bpa-list-page="budget"] table.budget-table .status-badge.bg-dark {
        background: #e2e8f0 !important;
        color: #475569 !important;
    }
    .bpa-shell-page [data-bpa-list-page="budget"] .budget-row-actions,
    .bpa-shell-page [data-bpa-list-page="sku"] .budget-row-actions,
    .bpa-shell-page[data-program-list-unit] .budget-row-actions {
        display: inline-flex;
        align-items: center;
        gap: 6px;
    }
    .bpa-shell-page [data-bpa-list-page="budget"] table.budget-table tbody td:last-child .budget-row-actions {
        display: flex;
        justify-content: flex-end;
        width: 100%;
    }
    .bpa-shell-page [data-bpa-list-page="budget"] .budget-row-actions form,
    .bpa-shell-page [data-bpa-list-page="sku"] .budget-row-actions form,
    .bpa-shell-page[data-program-list-unit] .budget-row-actions form {
        margin: 0;
    }
    .bpa-shell-page [data-bpa-list-page="budget"] .budget-row-action,
    .bpa-shell-page [data-bpa-list-page="sku"] .budget-row-action,
    .bpa-shell-page[data-program-list-unit] .budget-row-action {
        display: inline-grid;
        width: 32px;
        height: 32px;
        place-items: center;
        border: 1px solid #dce4ef;
        border-radius: 8px;
        background: #fff;
        color: #526078;
        font-size: 13px;
        text-decoration: none;
        cursor: pointer;
        transition: background .15s ease, border-color .15s ease, color .15s ease;
    }
    .bpa-shell-page [data-bpa-list-page="budget"] .budget-row-action:hover,
    .bpa-shell-page [data-bpa-list-page="sku"] .budget-row-action:hover,
    .bpa-shell-page[data-program-list-unit] .budget-row-action:hover {
        border-color: #aabcf9;
        background: #edf3ff;
        color: #4f6df5;
    }
    .bpa-shell-page [data-bpa-list-page="budget"] .budget-row-action--delete,
    .bpa-shell-page [data-bpa-list-page="sku"] .budget-row-action--delete,
    .bpa-shell-page[data-program-list-unit] .budget-row-action--delete {
        border-color: #f1d5d8;
        color: #c34d55;
    }
    .bpa-shell-page [data-bpa-list-page="budget"] .budget-row-action--delete:hover,
    .bpa-shell-page [data-bpa-list-page="sku"] .budget-row-action--delete:hover,
    .bpa-shell-page[data-program-list-unit] .budget-row-action--delete:hover {
        border-color: #e8b3b8;
        background: #fff1f2;
        color: #b42318;
    }
    .bpa-shell-page [data-bpa-list-page="budget"] .budget-table-note {
        display: flex;
        align-items: center;
        gap: 9px;
        margin: 12px 20px 18px;
        padding: 12px 14px;
        border: 1px solid #e8edf5;
        border-radius: 9px;
        background: #f8faff;
        color: #748096;
        font-size: 11px;
        line-height: 1.55;
    }
    .bpa-shell-page [data-bpa-list-page="budget"] .budget-table-note > i {
        flex: 0 0 auto;
        margin: 0;
        color: #6280b5;
        line-height: 1;
    }
    .bpa-shell-page [data-bpa-list-page="budget"] .budget-table-note > span {
        min-width: 0;
    }
    .bpa-shell-page [data-bpa-list-page="budget"] .budget-table-note code {
        color: #526078;
    }
    .bpa-shell-page [data-bpa-list-page="budget"] .summary-card,
    .bpa-shell-page [data-bpa-list-page="program"] .summary-card {
        position: relative;
        min-height: 112px;
        overflow: hidden;
        border-color: #e2e8f0 !important;
        border-radius: 12px !important;
        box-shadow: 0 8px 24px rgba(15, 23, 42, .04) !important;
    }
    .bpa-shell-page [data-bpa-list-page="budget"] .summary-card::before,
    .bpa-shell-page [data-bpa-list-page="program"] .summary-card::before {
        position: absolute;
        inset: 0 0 auto;
        height: 3px;
        background: var(--bpa-list-accent, #4f6df5);
        content: "";
    }
    .bpa-shell-page [data-bpa-list-page="budget"] .summary-card .card-body,
    .bpa-shell-page [data-bpa-list-page="program"] .summary-card .card-body {
        display: flex;
        min-height: 112px;
        flex-direction: column;
        align-items: flex-start;
        justify-content: center;
        gap: 6px;
        padding: 18px 20px !important;
    }
    .bpa-shell-page [data-bpa-list-page="budget"] .summary-card .text-muted,
    .bpa-shell-page [data-bpa-list-page="program"] .summary-card small.text-muted {
        color: #748096 !important;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: .045em;
        line-height: 1.4;
        text-transform: uppercase;
    }
    .bpa-shell-page [data-bpa-list-page="budget"] .summary-card .fs-5,
    .bpa-shell-page [data-bpa-list-page="program"] .summary-number {
        color: #1b2639;
        font-size: clamp(18px, 1.55vw, 23px);
        font-weight: 750;
        letter-spacing: -.025em;
        line-height: 1.25;
        white-space: nowrap;
        font-variant-numeric: tabular-nums;
    }
    .bpa-shell-page [data-bpa-list-page="budget"] .row.g-3.mb-3 > [class*="col-"]:nth-child(1) .summary-card {
        --bpa-list-accent: #3478d4;
    }
    .bpa-shell-page [data-bpa-list-page="budget"] .row.g-3.mb-3 > [class*="col-"]:nth-child(2) .summary-card {
        --bpa-list-accent: #d78a1f;
    }
    .bpa-shell-page [data-bpa-list-page="budget"] .row.g-3.mb-3 > [class*="col-"]:nth-child(3) .summary-card {
        --bpa-list-accent: #21946a;
    }
    .bpa-shell-page [data-bpa-list-page="program"] .row.g-3.mb-3 > [class*="col-"]:nth-child(1) .summary-card {
        --bpa-list-accent: #3478d4;
    }
    .bpa-shell-page [data-bpa-list-page="program"] .row.g-3.mb-3 > [class*="col-"]:nth-child(2) .summary-card {
        --bpa-list-accent: #7354c7;
    }
    .bpa-shell-page [data-bpa-list-page="program"] .row.g-3.mb-3 > [class*="col-"]:nth-child(3) .summary-card {
        --bpa-list-accent: #21946a;
    }
    .bpa-shell-page [data-bpa-list-page="program"] .row.g-3.mb-3 > [class*="col-"]:nth-child(4) .summary-card {
        --bpa-list-accent: #d78a1f;
    }
    .bpa-shell-page [data-bpa-list-page="program"] .row.g-3.mb-3 > [class*="col-"]:nth-child(5) .summary-card {
        --bpa-list-accent: #d64553;
    }
    .bpa-shell-page [data-bpa-list-page="budget"] > .card:last-child,
    .bpa-shell-page [data-bpa-list-page="sku"] > .card:last-child,
    .bpa-shell-page [data-bpa-list-page="program"] > .card:last-child {
        border-color: #e2e8f0 !important;
        border-radius: 12px !important;
        box-shadow: 0 8px 24px rgba(15, 23, 42, .045) !important;
    }
    .bpa-shell-page [data-bpa-list-page="budget"] > .card:last-child:not(.budget-table-card) > .card-body {
        padding: 16px 20px 20px !important;
    }
    .bpa-shell-page [data-bpa-list-page="budget"] table.table,
    .bpa-shell-page [data-bpa-list-page="sku"] table.sku-table {
        border: 1px solid #e8edf5;
        border-radius: 9px;
        border-collapse: separate;
        border-spacing: 0;
        overflow: hidden;
    }
    .bpa-shell-page [data-bpa-list-page="budget"] table.budget-table {
        border-radius: 0;
    }
    .bpa-shell-page [data-bpa-list-page="budget"] table.table thead th,
    .bpa-shell-page [data-bpa-list-page="sku"] table.sku-table thead th {
        background: #f0f4fb !important;
        border: 0 !important;
        border-bottom: 1px solid #e3e9f2 !important;
        color: #526078 !important;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: .045em;
        line-height: 1.45;
        padding: 12px 10px;
        text-transform: uppercase;
        vertical-align: middle;
    }
    .bpa-shell-page [data-bpa-list-page="budget"] table.table tbody td,
    .bpa-shell-page [data-bpa-list-page="sku"] table.sku-table tbody td {
        border: 0 !important;
        border-bottom: 1px solid #edf0f5 !important;
        color: #5d687b;
        font-size: 12px;
        line-height: 1.5;
        padding: 12px 10px;
        vertical-align: middle;
    }
    .bpa-shell-page [data-bpa-list-page="budget"] table.table tbody tr:nth-child(even) td,
    .bpa-shell-page [data-bpa-list-page="sku"] table.sku-table tbody tr:nth-child(even) td {
        background: #f8faff !important;
    }
    .bpa-shell-page [data-bpa-list-page="budget"] table.budget-table tbody tr:nth-child(odd) td {
        background: #fff !important;
    }
    .bpa-shell-page [data-bpa-list-page="budget"] table.budget-table tbody td {
        box-shadow: none !important;
    }
    .bpa-shell-page [data-bpa-list-page="budget"] table.table tbody tr:hover td,
    .bpa-shell-page [data-bpa-list-page="sku"] table.sku-table tbody tr:hover td {
        background: #edf3ff !important;
    }
    .bpa-shell-page [data-bpa-list-page="budget"] table.table tbody tr:last-child td,
    .bpa-shell-page [data-bpa-list-page="sku"] table.sku-table tbody tr:last-child td {
        border-bottom: 0 !important;
    }
    .bpa-shell-page [data-bpa-list-page="budget"] table.table .money,
    .bpa-shell-page [data-bpa-list-page="sku"] table.sku-table .money {
        color: #344054;
        font-variant-numeric: tabular-nums;
    }
    .bpa-shell-page [data-bpa-list-page="budget"] table.table tbody tr > td:first-child,
    .bpa-shell-page [data-bpa-list-page="sku"] table.sku-table tbody tr > td:first-child {
        color: #344054;
        font-weight: 600;
    }
    .bpa-shell-page [data-bpa-list-page="budget"] > .card:last-child .text-muted.small {
        margin-top: 14px !important;
        padding: 12px 14px;
        border: 1px solid #e8edf5;
        border-radius: 9px;
        background: #f8faff;
        color: #748096 !important;
        line-height: 1.55;
    }
    .bpa-shell-page [data-bpa-list-page="sku"] > .card:last-child > .card-body {
        padding: 0 !important;
    }
    .bpa-shell-page [data-bpa-list-page="sku"] .sku-table-wrapper {
        max-width: 100%;
        overflow-x: auto;
        padding: 16px 20px 20px;
        overscroll-behavior-x: contain;
    }
    .bpa-shell-page [data-bpa-list-page="sku"] table.sku-table {
        width: 100%;
        min-width: 1500px;
        table-layout: fixed;
        border-radius: 0;
    }
    @media (min-width: 769px) {
        .bpa-shell-page [data-bpa-list-page="sku"] table.sku-table {
            width: 100% !important;
            min-width: 0 !important;
        }
        .bpa-shell-page [data-bpa-list-page="sku"] table.sku-table--actions th:nth-child(1) { width: 5% !important; }
        .bpa-shell-page [data-bpa-list-page="sku"] table.sku-table--actions th:nth-child(2) { width: 28% !important; }
        .bpa-shell-page [data-bpa-list-page="sku"] table.sku-table--actions th:nth-child(3) { width: 15% !important; }
        .bpa-shell-page [data-bpa-list-page="sku"] table.sku-table--actions th:nth-child(4) { width: 12% !important; }
        .bpa-shell-page [data-bpa-list-page="sku"] table.sku-table--actions th:nth-child(5) { width: 17% !important; }
        .bpa-shell-page [data-bpa-list-page="sku"] table.sku-table--actions th:nth-child(6) { width: 9% !important; }
        .bpa-shell-page [data-bpa-list-page="sku"] table.sku-table--actions th:nth-child(7) { width: 14% !important; }
        .bpa-shell-page [data-bpa-list-page="sku"] table.sku-table:not(.sku-table--actions) th:nth-child(1) { width: 5% !important; }
        .bpa-shell-page [data-bpa-list-page="sku"] table.sku-table:not(.sku-table--actions) th:nth-child(2) { width: 35% !important; }
        .bpa-shell-page [data-bpa-list-page="sku"] table.sku-table:not(.sku-table--actions) th:nth-child(3) { width: 16% !important; }
        .bpa-shell-page [data-bpa-list-page="sku"] table.sku-table:not(.sku-table--actions) th:nth-child(4) { width: 13% !important; }
        .bpa-shell-page [data-bpa-list-page="sku"] table.sku-table:not(.sku-table--actions) th:nth-child(5) { width: 19% !important; }
        .bpa-shell-page [data-bpa-list-page="sku"] table.sku-table:not(.sku-table--actions) th:nth-child(6) { width: 12% !important; }
    }
    .bpa-shell-page [data-bpa-list-page="sku"] .sku-table-wrapper {
        padding: 0 !important;
    }
    .bpa-shell-page [data-bpa-list-page="sku"] table.sku-table {
        min-width: 1200px;
    }
    .bpa-shell-page [data-bpa-list-page="sku"] table.sku-table .w-aktiviti {
        width: 34%;
    }
    .bpa-shell-page [data-bpa-list-page="sku"] table.sku-table tbody td {
        word-break: normal;
        overflow-wrap: anywhere;
    }
    .bpa-shell-page [data-bpa-list-page="sku"] table.sku-table tbody td.money {
        white-space: nowrap;
        font-size: 11px;
    }
    .bpa-shell-page [data-bpa-list-page="sku"] .sku-achievement-badge {
        display: inline-flex;
        min-height: 24px;
        align-items: center;
        justify-content: center;
        padding: 3px 9px;
        border-radius: 999px;
        background: #e6ddff;
        color: #5b3fa3;
        font-size: 11px;
        font-weight: 700;
        line-height: 1.2;
        white-space: nowrap;
    }

    .bpa-shell-page [data-bpa-list-page="sku"] .scope-mini,
    .bpa-shell-page [data-bpa-list-page="sku"] .sub-mini {
        color: #7b8494;
        font-size: 11px;
        line-height: 1.45;
    }
    .bpa-shell-page [data-bpa-list-page="sku"] .sku-sasaran-rm {
        white-space: nowrap;
        font-size: 9.5px;
    }
    .bpa-shell-page [data-bpa-list-page="sku"] .action-btn {
        width: 32px;
        height: 32px;
        border-color: #dce4ef;
        border-radius: 8px;
        color: #526078;
        transition: background .15s ease, border-color .15s ease, color .15s ease;
    }
    .bpa-shell-page [data-bpa-list-page="sku"] .action-btn:hover {
        border-color: #aabcf9;
        background: #edf3ff;
        color: #4f6df5;
    }
    .bpa-shell-page [data-bpa-list-page="sku"] .action-del {
        border-color: #f1d5d8;
        color: #c34d55;
    }
    .bpa-shell-page [data-bpa-list-page="sku"] .action-del:hover {
        border-color: #e8b3b8;
        background: #fff1f2;
        color: #b42318;
    }
    .bpa-shell-page [data-bpa-list-page="program"] .program-report-card {
        overflow: hidden;
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        background: #fff;
        box-shadow: 0 8px 24px rgba(15, 23, 42, .045);
    }
    .bpa-shell-page [data-bpa-list-page="program"] .program-report-card.program-report-enter {
        animation: bpa-dashboard-fade-in-up .45s cubic-bezier(.2, .75, .25, 1) both;
    }
    .bpa-shell-page [data-bpa-list-page="program"] .sku-table-header {
        display: flex;
        min-height: 76px;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        padding: 18px 22px;
        border-bottom: 1px solid #e7ebf2;
        background: linear-gradient(180deg, #fff, #fbfcff);
    }
    .bpa-shell-page [data-bpa-list-page="program"] .sku-table-header h5 {
        margin: 0;
        color: #111844;
        font-size: 15px;
        font-weight: 600;
        letter-spacing: -.01em;
    }
    .bpa-shell-page [data-bpa-list-page="program"] .sku-table-header span {
        display: block;
        margin-top: 4px;
        color: #7288ae;
        font-size: 11px;
    }
    .bpa-shell-page [data-bpa-list-page="program"] .sku-table-header .sku-record-count {
        display: inline-flex;
        align-items: center;
        flex: 0 0 auto;
        margin: 0;
        padding: 6px 10px;
        border: 1px solid #e3eaf5;
        border-radius: 999px;
        background: #f6f8fc;
        color: #526078;
        font-weight: 600;
        line-height: 1.45;
    }
    .bpa-shell-page [data-bpa-list-page="program"] .program-report-table-card {
        overflow: hidden;
        border: 0;
        border-radius: 0;
        background: #fff;
        box-shadow: none;
    }
    .bpa-shell-page [data-bpa-list-page="program"] .report-table-wrapper {
        max-height: 650px;
        max-width: 100%;
        overflow: auto;
        border: 0;
        border-radius: 0;
        background: #fff;
        padding: 0 !important;
        scrollbar-color: #c4cedc #f4f7fb;
        scrollbar-width: thin;
    }
    .bpa-shell-page [data-bpa-list-page="program"] table.table-report thead th {
        position: sticky;
        top: 0;
        z-index: 5;
        background: #f0f4fb !important;
        border: 0 !important;
        border-bottom: 1px solid #e3e9f2 !important;
        border-right: 0 !important;
        color: #526078 !important;
        font-size: 11px !important;
        font-weight: 700 !important;
        letter-spacing: .035em;
        line-height: 1.45;
        padding: 12px 10px !important;
        text-align: center !important;
        text-transform: uppercase;
        vertical-align: middle;
    }
    .bpa-shell-page [data-bpa-list-page="program"] table.table-report thead th:last-child {
        border-right: 0 !important;
    }
    .bpa-shell-page [data-bpa-list-page="program"] table.table-report tbody td {
        height: auto;
        max-height: none;
        border: 0 !important;
        border-bottom: 1px solid #edf0f5 !important;
        border-right: 0 !important;
        color: #5d687b !important;
        font-size: 12px !important;
        font-weight: 400;
        line-height: 1.5;
        padding: 11px 10px !important;
        vertical-align: middle;
        overflow-wrap: anywhere;
    }
    .bpa-shell-page [data-bpa-list-page="program"] table.table-report tbody td:last-child {
        border-right: 0 !important;
    }
    .bpa-shell-page [data-bpa-list-page="program"] table.table-report tbody tr:nth-child(even) td {
        background: #f8faff !important;
    }
    .bpa-shell-page [data-bpa-list-page="program"] table.table-report tbody tr:hover td {
        background: #edf3ff !important;
    }
    .bpa-shell-page [data-bpa-list-page="program"] table.table-report tbody tr.fw-bold td {
        position: sticky;
        bottom: 0;
        z-index: 4;
        background: #f0f4fb !important;
        color: #344054 !important;
        font-weight: 700;
        border-top: 1px solid #dce4ef !important;
        border-bottom: 0 !important;
    }
    .bpa-shell-page [data-bpa-list-page="program"] table.table-report tbody tr:last-child td {
        border-bottom: 0 !important;
    }
    .bpa-shell-page [data-bpa-list-page="program"] .program-page-actions {
        display: flex;
        align-items: center;
        gap: 8px;
    }
    .bpa-shell-page [data-bpa-list-page="program"] .program-page-header {
        box-sizing: border-box;
        height: auto;
        min-height: 0;
        padding: 0;
    }
    .bpa-shell-page [data-bpa-list-page="program"] .program-page-header > div:first-child {
        min-width: 0;
    }
    .bpa-shell-page [data-bpa-list-page="program"] .program-page-header h4 {
        display: inline-block;
        color: #17243b;
        font-size: 19px;
        font-weight: 700;
        letter-spacing: -.025em;
    }
    .bpa-shell-page [data-bpa-list-page="program"] .program-list-action {
        display: grid;
        box-sizing: border-box;
        width: 125px;
        min-height: 44px;
        flex: 0 0 125px;
        grid-template-columns: 32px minmax(0, 1fr);
        align-items: center;
        column-gap: 6px;
        padding: 5px 6px;
        border: 1px solid #e2e8f2;
        border-radius: 12px;
        background: #fff;
        color: #344563;
        font-size: 13px;
        font-weight: 700;
        text-decoration: none;
        white-space: nowrap;
        box-shadow: 0 2px 6px rgba(30, 55, 90, .04);
        transition: transform .16s ease, box-shadow .16s ease, border-color .16s ease;
    }
    .bpa-shell-page [data-bpa-list-page="program"] .program-list-action:hover {
        transform: translateY(-1px);
        border-color: #cbd7ea;
        color: #172554;
        box-shadow: 0 6px 14px rgba(30, 55, 90, .1);
    }
    .bpa-shell-page [data-bpa-list-page="program"] .program-list-action-icon {
        display: inline-grid;
        width: 32px;
        height: 32px;
        grid-column: 1;
        grid-row: 1;
        place-items: center;
        border-radius: 9px;
        background: #eaf7f0;
        color: #248653;
        font-size: 14px;
    }
    .bpa-shell-page [data-bpa-list-page="program"] .program-list-action--excel {
        border-color: #d3eadc;
        color: #237b4b;
    }
    .bpa-shell-page [data-bpa-list-page="program"] .program-list-action--pdf {
        border-color: #f1d5d8;
        color: #b42332;
    }
    .bpa-shell-page [data-bpa-list-page="program"] .program-list-action--pdf .program-list-action-icon {
        background: #fff0f1;
        color: #c33d49;
    }
    .bpa-shell-page [data-bpa-list-page="program"] .program-list-action > span:last-child {
        grid-column: 2;
        grid-row: 1;
        text-align: center;
    }
    .bpa-shell-page .program-filter-card {
        position: relative;
        z-index: 20;
        height: 82px;
        min-height: 82px;
        overflow: visible !important;
        border-color: #e2e8f0 !important;
        border-radius: 12px !important;
        box-shadow: 0 8px 24px rgba(15, 23, 42, .04) !important;
        box-sizing: border-box;
        margin-bottom: 16px !important;
    }
    .bpa-shell-page .program-filter-card > .card-body {
        display: flex;
        height: 100%;
        align-items: center;
        gap: 24px;
        padding: 12px 20px !important;
        box-sizing: border-box;
    }
    .bpa-shell-page .program-filter-card .program-filter-heading {
        flex: 0 1 420px;
        min-width: 220px;
    }
    .bpa-shell-page .program-filter-card .program-filter-heading h5 {
        margin: 0;
        color: #17243b;
        font-size: 14px;
        font-weight: 600;
    }
    .bpa-shell-page .program-filter-card .program-filter-heading p {
        margin: 5px 0 0;
        color: #64748b;
        font-size: 12px;
        line-height: 1.5;
    }
    .bpa-shell-page .program-filter-card .program-filter-form {
        width: min(100%, 820px);
        max-width: 820px;
        flex: 1 1 620px;
        height: 44px;
        margin: 0 0 0 auto;
    }
    .bpa-shell-page .program-filter-card .program-search-box {
        flex: 1 1 auto;
        min-width: 0;
        height: 42px;
        border: 0;
        border-radius: 10px 0 0 10px;
        background: transparent;
    }
    .bpa-shell-page .program-filter-card .program-search-box > i {
        flex: 0 0 auto;
        margin-left: 14px;
        color: #98a2b3;
        font-size: 14px;
    }
    .bpa-shell-page .program-filter-card .program-search-box input {
        width: 100%;
        min-width: 0;
        height: 42px;
        padding: 0 12px 0 9px;
        border: 0;
        outline: 0;
        background: transparent;
        color: #344054;
        font: 13px/42px var(--app-font-family);
        box-shadow: none;
    }
    .bpa-shell-page .program-filter-card .program-search-box input::placeholder {
        color: #98a2b3;
    }
    .bpa-shell-page .program-filter-card .program-search-box:focus-within {
        box-shadow: inset 0 0 0 2px rgba(80, 111, 244, .28);
    }
    .bpa-shell-page .program-filter-card .program-filter-group {
        display: flex;
        flex: 0 0 auto;
        align-items: center;
        gap: 4px;
        height: 42px;
        margin: 0;
        padding: 0 4px;
        border: 0;
        border-radius: 0 10px 10px 0;
        background: transparent;
    }
    .bpa-shell-page .program-filter-card .program-filter-group > .custom-select {
        width: 42px;
        min-width: 0;
        flex: 0 0 42px;
    }
    .bpa-shell-page .program-filter-card .program-filter-select {
        width: 120px;
        height: 36px;
        padding: 0 28px 0 11px;
        border: 0;
        background: transparent;
        color: #344054;
        font-size: 12px;
        cursor: pointer;
    }
    .bpa-shell-page .program-filter-card .program-filter-group .custom-select-button,
    .bpa-shell-page .program-filter-card .program-date-button,
    .bpa-shell-page .program-filter-card .program-filter-reset {
        display: inline-flex;
        height: 36px;
        min-height: 36px;
        align-items: center;
        justify-content: center;
        padding: 0;
        border: 1px solid transparent;
        border-radius: 7px;
        background: transparent;
        color: #667085;
        font-size: 17px;
        transition: background .15s ease, border-color .15s ease, color .15s ease, box-shadow .15s ease;
    }
    .bpa-shell-page .program-filter-card .program-filter-group .custom-select-button,
    .bpa-shell-page .program-filter-card .program-filter-reset {
        width: 38px;
    }
    .bpa-shell-page .program-filter-card .program-filter-group .custom-select-button > i {
        font-size: 18px;
    }
    .bpa-shell-page .program-filter-card .program-filter-group .custom-select-button[data-icon-only="true"]::after {
        display: none;
    }
    .bpa-shell-page .program-filter-card .program-filter-group .custom-select-button:hover:not(:disabled),
    .bpa-shell-page .program-filter-card .program-date-button:hover,
    .bpa-shell-page .program-filter-card .program-filter-reset:hover,
    .bpa-shell-page .program-filter-card .program-filter-group .custom-select.show .custom-select-button,
    .bpa-shell-page .program-filter-card .program-date-button.active {
        border-color: #cbd6e6;
        background: #fff;
        color: #3155c8;
        box-shadow: 0 3px 8px rgba(15, 23, 42, .06);
    }
    .bpa-shell-page .program-filter-card .program-filter-group .custom-select-menu {
        left: auto;
        right: 0;
        box-sizing: border-box;
        width: 180px;
        min-width: 180px;
        border: 1px solid #dfe6f0;
        border-radius: 9px;
        background: #fff;
        color: #172033;
        box-shadow: 0 10px 26px rgba(15, 23, 42, .14);
    }
    .bpa-shell-page .program-filter-card .program-filter-group .custom-select-option {
        min-height: 34px;
        padding: 8px 10px;
        color: #172033;
        font-size: 13px;
        line-height: 18px;
        white-space: nowrap;
    }
    .bpa-shell-page .program-filter-card .program-filter-group .custom-select-option:hover,
    .bpa-shell-page .program-filter-card .program-filter-group .custom-select-option.active {
        background: #eef4ff;
        color: #3155c8;
    }
    .bpa-shell-page .program-filter-card .program-date-filter {
        position: relative;
    }
    .bpa-shell-page .program-filter-card .program-date-button {
        width: 38px;
        flex: 0 0 38px;
    }
    .bpa-shell-page .program-filter-card .program-date-button > i {
        flex: 0 0 auto;
        font-size: 16px;
    }
    .program-date-range-menu {
        display: none;
        position: absolute;
        top: calc(100% + 8px);
        right: 0;
        z-index: 1100;
        box-sizing: border-box;
        width: 300px;
        padding: 14px;
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        background: #fff;
        box-shadow: 0 18px 42px rgba(15, 23, 42, .18), 0 3px 10px rgba(15, 23, 42, .08);
    }
    .program-date-range-menu.show {
        display: block;
    }
    .program-date-range-heading {
        display: flex;
        min-height: 36px;
        align-items: center;
        justify-content: center;
        margin-bottom: 8px;
        text-align: center;
    }
    .program-date-range-heading strong {
        color: #344054;
        font-size: 12px;
        font-weight: 600;
    }
    .program-date-range-menu .audit-calendar-header {
        margin-bottom: 10px;
    }
    .program-date-range-menu .audit-calendar-header > strong {
        font-size: 13px;
        text-transform: capitalize;
    }
    .program-date-range-days {
        display: grid;
        grid-template-columns: repeat(7, minmax(0, 1fr));
        gap: 3px;
        text-align: center;
    }
    .program-date-range-days .audit-calendar-empty,
    .program-date-range-day {
        display: grid;
        min-width: 0;
        height: 32px;
        place-items: center;
    }
    .program-date-range-day {
        border: 0;
        border-radius: 7px;
        background: transparent;
        color: #344054;
        font-size: 12px;
        cursor: pointer;
    }
    .program-date-range-day:hover {
        background: #edf3ff;
        color: #3155c8;
    }
    .program-date-range-day.in-range {
        border-radius: 0;
        background: #e8efff;
        color: #3155c8;
    }
    .program-date-range-day.range-start,
    .program-date-range-day.range-end {
        border-radius: 7px;
        background: #315da8;
        color: #fff;
        font-weight: 700;
    }
    .program-date-range-day.today:not(.range-start):not(.range-end) {
        box-shadow: inset 0 0 0 1px #91aaf5;
    }
    .program-date-range-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-top: 12px;
        padding-top: 10px;
        border-top: 1px solid #edf0f5;
    }
    .program-date-range-footer button {
        min-height: 32px;
        padding: 6px 9px;
        border: 1px solid transparent;
        border-radius: 7px;
        background: transparent;
        color: #526078;
        font-size: 11px;
        font-weight: 600;
    }
    .program-date-range-footer .program-date-apply {
        border-color: #315da8;
        background: #315da8;
        color: #fff;
    }
    .program-date-range-footer .program-date-apply:hover:not(:disabled) {
        border-color: #244b8d;
        background: #244b8d;
    }
    .program-date-range-footer .program-date-apply:disabled {
        opacity: .45;
        cursor: not-allowed;
    }
    .program-date-range-footer .program-date-clear:hover {
        background: #f8faff;
        color: #3155c8;
    }
    .bpa-shell-page [data-bpa-list-page="program"] table.table-report .status-badge {
        display: inline-flex;
        min-height: 24px;
        align-items: center;
        justify-content: center;
        padding: 0 9px;
        border: 0;
        border-radius: 5px !important;
        font-size: 10px;
        font-weight: 600;
        letter-spacing: .3px;
        line-height: 1.2;
        text-transform: uppercase;
    }
    .bpa-shell-page [data-bpa-list-page="program"] table.table-report .budget-unit-badge {
        border: 0;
        border-radius: 999px;
        background: var(--bpa-dashboard-tint) !important;
        color: var(--bpa-dashboard-accent) !important;
    }
    .bpa-shell-page [data-bpa-list-page="program"] table.table-report .status-badge.bg-secondary {
        background: #e2e8f0 !important;
        color: #475569 !important;
    }
    .bpa-shell-page [data-bpa-list-page="program"] table.table-report .status-badge.bg-primary {
        background: #dbeafe !important;
        color: #1d4ed8 !important;
    }
    .bpa-shell-page [data-bpa-list-page="program"] table.table-report .status-badge.bg-success {
        background: #dcfce7 !important;
        color: #166534 !important;
    }
    .bpa-shell-page [data-bpa-list-page="program"] table.table-report .status-badge.bg-danger {
        background: #fee2e2 !important;
        color: #b91c1c !important;
    }
    .bpa-shell-page[data-program-list-unit] > .container.mt-4 {
        max-width: 1400px;
        margin-top: 0 !important;
    }
    .bpa-shell-page[data-program-list-unit] > .container.mt-4 > .d-flex.justify-content-between.align-items-center.mb-3 {
        height: 47px;
        min-height: 47px;
        margin-bottom: 16px !important;
        padding: 0;
        border: 0;
        border-radius: 0;
        background: transparent;
        box-shadow: none;
        box-sizing: border-box;
    }
    .bpa-shell-page[data-program-list-unit] > .container.mt-4 > .d-flex h4 {
        color: #172033;
        font-size: 19px;
        font-weight: 700 !important;
        letter-spacing: -.025em;
    }
    .bpa-shell-page[data-program-list-unit] > .container.mt-4 > .d-flex small {
        display: block;
        margin-top: 5px;
        color: #748096 !important;
        font-size: 12px;
        line-height: 1.5;
    }
    .bpa-shell-page[data-program-list-unit] .program-unit-filter-card {
        position: relative;
        z-index: 20;
        display: block;
        height: 82px;
        min-height: 82px;
        overflow: visible !important;
        border-color: #e2e8f0 !important;
        border-radius: 12px !important;
        box-shadow: 0 8px 24px rgba(15, 23, 42, .04) !important;
        box-sizing: border-box;
        margin-bottom: 16px !important;
    }
    .bpa-shell-page[data-program-list-unit] .program-unit-filter-card > .card-body {
        display: flex;
        height: 100%;
        align-items: center;
        gap: 24px;
        padding: 20px !important;
        box-sizing: border-box;
    }
    .bpa-shell-page[data-program-list-unit] .program-unit-filter-card .program-filter-heading {
        flex: 0 1 420px;
        min-width: 220px;
    }
    .bpa-shell-page[data-program-list-unit] .program-unit-filter-card .program-filter-heading h5 {
        margin: 0;
        color: #17243b;
        font-size: 14px;
        font-weight: 600;
    }
    .bpa-shell-page[data-program-list-unit] .program-unit-filter-card .program-filter-heading p {
        margin: 5px 0 0;
        color: #64748b;
        font-size: 12px;
        line-height: 1.5;
    }
    .bpa-shell-page[data-program-list-unit] .program-unit-filter-card .sku-filter-toolbar {
        display: flex;
        align-items: center;
        flex: 1 1 620px;
        width: min(100%, 820px);
        max-width: 820px;
        height: 44px;
        margin: 0 0 0 auto;
        border: 1px solid #d7dfeb;
        border-radius: 11px;
        background: #f8faff;
        box-shadow: 0 4px 12px rgba(15, 23, 42, .04);
        overflow: visible;
    }
    .bpa-shell-page[data-program-list-unit] .program-unit-filter-card .sku-search-box {
        flex: 1 1 auto;
        min-width: 0;
        height: 42px;
        border: 0;
        border-radius: 10px 0 0 10px;
        background: transparent;
    }
    .bpa-shell-page[data-program-list-unit] .program-unit-filter-card .sku-search-box:focus-within {
        box-shadow: inset 0 0 0 2px rgba(80, 111, 244, .28);
    }
    .bpa-shell-page[data-program-list-unit] .program-unit-filter-card .sku-search-box,
    .bpa-shell-page [data-bpa-list-page="sku"] .sku-search-box,
    .bpa-shell-page [data-bpa-list-page="budget"] .budget-search-box {
        display: flex;
        align-items: center;
    }
    .bpa-shell-page[data-program-list-unit] .program-unit-filter-card .sku-search-box > i,
    .bpa-shell-page [data-bpa-list-page="sku"] .sku-search-box > i,
    .bpa-shell-page [data-bpa-list-page="budget"] .budget-search-box > i {
        flex: 0 0 auto;
        margin-left: 14px;
        color: #98a2b3;
        font-size: 14px;
    }
    .bpa-shell-page[data-program-list-unit] .program-unit-filter-card .sku-search-box input {
        width: 100%;
        min-width: 0;
        height: 42px;
        padding: 0 12px 0 9px;
        border: 0;
        outline: 0;
        background: transparent;
        color: #344054;
        font: 13px/42px var(--app-font-family);
        box-shadow: none;
    }
    .bpa-shell-page[data-program-list-unit] .program-unit-filter-card .sku-search-box input::placeholder {
        color: #98a2b3;
    }
    .bpa-shell-page[data-program-list-unit] .program-unit-filter-card .sku-filter-group {
        display: flex;
        flex: 0 0 auto;
        align-items: center;
        gap: 4px;
        height: 42px;
        margin: 0;
        padding: 0 4px;
        border: 0;
        border-radius: 0 10px 10px 0;
        background: transparent;
    }
    .bpa-shell-page[data-program-list-unit] .program-unit-filter-card .sku-filter-group > .custom-select {
        width: 42px;
        min-width: 0;
        flex: 0 0 42px;
    }
    .bpa-shell-page[data-program-list-unit] .program-unit-filter-card .sku-filter-select {
        width: 112px;
        height: 36px;
        padding: 0 28px 0 11px;
        border: 0;
        background: transparent;
        color: #344054;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
    }
    .bpa-shell-page[data-program-list-unit] .program-unit-filter-card .sku-filter-group .custom-select-button {
        display: flex;
        width: 38px;
        height: 36px;
        min-height: 36px;
        align-items: center;
        justify-content: center;
        gap: 0;
        margin: 0 auto;
        padding: 0;
        border: 1px solid transparent;
        border-radius: 7px;
        background: transparent;
        color: #344054;
        font-size: 18px;
        font-weight: 600;
    }
    .bpa-shell-page[data-program-list-unit] .program-unit-filter-card .sku-filter-group .custom-select-button > i {
        color: #667085;
        font-size: 18px;
    }
    .bpa-shell-page[data-program-list-unit] .program-unit-filter-card .sku-filter-group .custom-select-button[data-icon-only="true"]::after {
        display: none;
    }
    .bpa-shell-page[data-program-list-unit] .program-unit-filter-card .sku-filter-group .custom-select-button:hover:not(:disabled),
    .bpa-shell-page[data-program-list-unit] .program-unit-filter-card .sku-filter-group .custom-select.show .custom-select-button {
        border-color: #cbd6e6;
        background: #fff;
        color: #3155c8;
        box-shadow: 0 3px 8px rgba(15, 23, 42, .06);
    }
    .bpa-shell-page[data-program-list-unit] .program-unit-filter-card .sku-filter-group .custom-select-menu {
        left: auto;
        right: 0;
        z-index: 20;
        box-sizing: border-box;
        width: 180px;
        min-width: 180px;
        border: 1px solid #dfe6f0;
        border-radius: 9px;
        background: #fff;
        color: #172033;
        box-shadow: 0 10px 26px rgba(15, 23, 42, .14);
    }
    .bpa-shell-page[data-program-list-unit] > .container.mt-4 > .card:not(.program-filter-card) {
        margin-bottom: 12px !important;
        border: 1px solid #e2e8f0 !important;
        border-radius: 12px !important;
        box-shadow: 0 8px 24px rgba(15, 23, 42, .04) !important;
    }
    .bpa-shell-page[data-program-list-unit] > .container.mt-4 > .card:not(.program-filter-card):not(.program-unit-table-card) > .card-body {
        padding: 20px !important;
    }
    .bpa-shell-page[data-program-list-unit] > .container.mt-4 > .card:last-child:not(.program-unit-table-card) {
        margin-bottom: 0 !important;
        border: 0 !important;
        border-radius: 0 !important;
        background: transparent !important;
        box-shadow: none !important;
    }
    .bpa-shell-page[data-program-list-unit] > .container.mt-4 > .card:last-child:not(.program-unit-table-card) > .card-body {
        padding: 0 !important;
    }
    .bpa-shell-page[data-program-list-unit] > .container.mt-4 > .card .form-label {
        margin-bottom: 6px;
        color: #526078;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: .035em;
    }
    .bpa-shell-page[data-program-list-unit] > .container.mt-4 > .card .form-control,
    .bpa-shell-page[data-program-list-unit] > .container.mt-4 > .card .form-select {
        min-height: 42px;
        border-color: #d7dfeb;
        border-radius: 9px;
        color: #344054;
        font-size: 13px;
        box-shadow: none;
    }
    .bpa-shell-page[data-program-list-unit] > .container.mt-4 > .card .form-control:focus,
    .bpa-shell-page[data-program-list-unit] > .container.mt-4 > .card .form-select:focus {
        border-color: #91aaf5;
        box-shadow: 0 0 0 3px rgba(80, 111, 244, .12);
    }
    .bpa-shell-page[data-program-list-unit] > .container.mt-4 > .card .btn-secondary {
        min-height: 42px;
        border-color: #315da8;
        border-radius: 9px;
        background: #315da8;
        color: #fff;
        font-size: 12px;
        font-weight: 700;
    }
    .bpa-shell-page[data-program-list-unit] > .container.mt-4 > .card .table-responsive {
        max-width: 100%;
        border-radius: 0;
        overscroll-behavior-x: contain;
    }
    .bpa-shell-page[data-program-list-unit] > .container.mt-4 > .card table.table {
        min-width: 1100px;
        margin-bottom: 0;
        border: 1px solid #e8edf5;
        border-radius: 9px;
        border-collapse: separate;
        border-spacing: 0;
    }
    .bpa-shell-page[data-program-list-unit] > .container.mt-4 > .card table.table thead th {
        background: #f0f4fb !important;
        border: 0 !important;
        border-bottom: 1px solid #e3e9f2 !important;
        color: #526078 !important;
        font-size: 10px !important;
        font-weight: 700 !important;
        letter-spacing: .045em;
        padding: 12px 10px !important;
        text-transform: uppercase;
        vertical-align: middle;
        white-space: nowrap;
    }
    .bpa-shell-page[data-program-list-unit] > .container.mt-4 > .card table.table tbody td {
        border: 0 !important;
        border-bottom: 1px solid #edf0f5 !important;
        color: #5d687b !important;
        font-size: 12px !important;
        line-height: 1.5;
        padding: 12px 10px !important;
        vertical-align: middle;
    }
    .bpa-shell-page[data-program-list-unit] > .container.mt-4 > .card table.table tbody tr:nth-child(odd) td {
        background: #fff !important;
        box-shadow: none !important;
    }
    .bpa-shell-page[data-program-list-unit] > .container.mt-4 > .card table.table tbody tr:nth-child(even) td {
        background: #f8faff !important;
        box-shadow: none !important;
    }
    .bpa-shell-page[data-program-list-unit] > .container.mt-4 > .card table.table tbody tr:hover td {
        background: #edf3ff !important;
    }
    .bpa-shell-page[data-program-list-unit] > .container.mt-4 > .card table.table tbody td.money {
        color: #344054 !important;
        font-size: 11px !important;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
    }
    .bpa-shell-page[data-program-list-unit] > .container.mt-4 > .card table.table .col-program small.text-muted {
        display: inline-flex;
        margin-top: 6px !important;
        padding: 3px 8px;
        border-radius: 999px;
        background: #e2e8f0;
        color: #475569 !important;
        font-size: 10px;
        font-weight: 700;
        line-height: 1.2;
        text-transform: uppercase;
    }
    .bpa-shell-page[data-program-list-unit] > .container.mt-4 > .card table.table .btn {
        min-height: 32px;
        margin: 2px 3px 2px 0;
        padding: 6px 10px;
        border-color: #d7dfeb;
        border-radius: 8px;
        background: #fff;
        color: #526078;
        font-size: 10px;
        font-weight: 700;
        line-height: 1.25;
    }
    .bpa-shell-page[data-program-list-unit] > .container.mt-4 > .card table.table .btn-outline-info {
        border-color: #d3ddf2;
        color: #315da8;
    }
    .bpa-shell-page[data-program-list-unit] > .container.mt-4 > .card table.table .btn-outline-primary {
        border-color: #d3ddf2;
        color: #315da8;
    }
    .bpa-shell-page[data-program-list-unit] > .container.mt-4 > .card table.table .btn-outline-danger {
        border-color: #f1d5d8;
        color: #b42332;
    }
    .bpa-shell-page[data-program-list-unit] > .container.mt-4 > .card table.table .btn:hover {
        background: #f5f8ff;
        color: #244b8d;
    }
    .bpa-shell-page[data-program-list-unit] > .container.mt-4 > .card table.table .btn-outline-danger:hover {
        background: #fff1f2;
        color: #b42332;
    }
    .bpa-shell-page[data-program-list-unit] > .container.mt-4 > .program-unit-table-card {
        margin-top: 0 !important;
        margin-bottom: 0 !important;
        overflow: hidden;
        border: 1px solid #e2e8f0 !important;
        border-radius: 12px !important;
        box-shadow: 0 8px 24px rgba(15, 23, 42, .045) !important;
    }
    .bpa-shell-page[data-program-list-unit] > .container.mt-4 > .program-unit-table-card > .card-body {
        padding: 0 !important;
    }
    .bpa-shell-page[data-program-list-unit] .program-unit-table-wrapper {
        width: 100%;
        max-width: 100%;
        overflow-x: auto;
        overflow-y: hidden;
        margin: 0 !important;
        padding: 0 !important;
        overscroll-behavior-x: contain;
        -webkit-overflow-scrolling: touch;
    }
    @media (min-width: 769px) {
        .bpa-shell-page[data-program-list-unit] > .container.mt-4 > .program-unit-table-card .program-unit-table-wrapper table.program-unit-table {
            width: 100%;
            min-width: 0 !important;
            table-layout: fixed;
        }
        .bpa-shell-page[data-program-list-unit] table.program-unit-table .col-program {
            width: 29% !important;
            min-width: 0 !important;
        }
        .bpa-shell-page[data-program-list-unit] > .container.mt-4 > .program-unit-table-card table.program-unit-table thead th {
            padding: 10px 8px !important;
            white-space: normal !important;
            overflow-wrap: anywhere;
            font-size: 11px !important;
        }
        .bpa-shell-page[data-program-list-unit] table.program-unit-table thead th:nth-child(1) {
            width: 5% !important;
        }
        .bpa-shell-page[data-program-list-unit] table.program-unit-table thead th:nth-child(2) {
            width: 29% !important;
        }
        .bpa-shell-page[data-program-list-unit] table.program-unit-table thead th:nth-child(3) {
            width: 18% !important;
        }
        .bpa-shell-page[data-program-list-unit] table.program-unit-table thead th:nth-child(4),
        .bpa-shell-page[data-program-list-unit] table.program-unit-table thead th:nth-child(5),
        .bpa-shell-page[data-program-list-unit] table.program-unit-table thead th:nth-child(6) {
            width: 11% !important;
        }
        .bpa-shell-page[data-program-list-unit] table.program-unit-table thead th:nth-child(7) {
            width: 15% !important;
        }
    }
    .bpa-shell-page[data-program-list-unit] table.program-unit-table thead th {
        line-height: 1.45;
        touch-action: pan-x pan-y;
    }
    .bpa-shell-page[data-program-list-unit] > .container.mt-4 > .program-unit-table-card table.program-unit-table {
        border: 0 !important;
        border-radius: 0 !important;
    }
    .bpa-shell-page[data-program-list-unit] .program-unit-table-card .sku-table-header {
        display: flex;
        min-height: 76px;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        padding: 18px 22px;
        border-bottom: 1px solid #e7ebf2;
        background: linear-gradient(180deg, #fff, #fbfcff);
    }
    .bpa-shell-page[data-program-list-unit] .program-unit-table-card .sku-table-header h5 {
        margin: 0;
        color: #111844;
        font-size: 15px;
        font-weight: 600;
        letter-spacing: -.01em;
    }
    .bpa-shell-page[data-program-list-unit] .program-unit-table-card .sku-table-header span {
        display: block;
        margin-top: 4px;
        color: #7288ae;
        font-size: 11px;
    }
    .bpa-shell-page[data-program-list-unit] .program-unit-table-card .sku-table-header .sku-record-count {
        flex: 0 0 auto;
        margin: 0;
        padding: 6px 10px;
        border: 1px solid #e3eaf5;
        border-radius: 999px;
        background: #f6f8fc;
        color: #526078;
        font-weight: 600;
    }
    .bpa-shell-page[data-program-list-unit] table.program-unit-table .status-badge {
        display: inline-flex;
        min-height: 24px;
        align-items: center;
        justify-content: center;
        padding: 0 9px;
        border: 0;
        border-radius: 5px !important;
        font-size: 10px;
        font-weight: 600;
        letter-spacing: .3px;
        line-height: 1.2;
        text-transform: uppercase;
    }
    .bpa-shell-page[data-program-list-unit] table.program-unit-table .status-badge.bg-secondary {
        background: #e2e8f0 !important;
        color: #475569 !important;
    }
    .bpa-shell-page[data-program-list-unit] table.program-unit-table .status-badge.bg-primary {
        background: #dbeafe !important;
        color: #1d4ed8 !important;
    }
    .bpa-shell-page[data-program-list-unit] table.program-unit-table .status-badge.bg-success {
        background: #dcfce7 !important;
        color: #166534 !important;
    }
    .bpa-shell-page[data-program-list-unit] table.program-unit-table .status-badge.bg-danger {
        background: #fee2e2 !important;
        color: #b91c1c !important;
    }
    .bpa-shell-page[data-program-list-unit] table.program-unit-table .budget-row-action {
        min-height: 0 !important;
        margin: 0 !important;
        padding: 0 !important;
        border: 1px solid #dce4ef !important;
        border-radius: 8px !important;
        background: #fff !important;
        color: #526078 !important;
        font-size: 13px !important;
        line-height: 1;
    }
    .bpa-shell-page[data-program-list-unit] table.program-unit-table td.col-tindakan {
        text-align: right !important;
    }
    .bpa-shell-page[data-program-list-unit] table.program-unit-table .budget-row-actions {
        display: flex;
        width: 100%;
        justify-content: flex-end;
    }
    .bpa-shell-page[data-program-list-unit] table.program-unit-table .budget-row-action:hover {
        border-color: #aabcf9 !important;
        background: #edf3ff !important;
        color: #4f6df5 !important;
    }
    .bpa-shell-page[data-program-list-unit] table.program-unit-table .budget-row-action--delete {
        border-color: #f1d5d8 !important;
        color: #c34d55 !important;
    }
    .bpa-shell-page[data-program-list-unit] table.program-unit-table .budget-row-action--delete:hover {
        border-color: #e8b3b8 !important;
        background: #fff1f2 !important;
        color: #b42318 !important;
    }
    @media (max-width: 768px) {
        .bpa-shell-page[data-program-list-unit] > .container.mt-4 {
            margin-top: 0 !important;
        }
        .bpa-shell-page[data-program-list-unit] > .container.mt-4 > .d-flex.justify-content-between.align-items-center.mb-3 {
            height: auto;
            min-height: 0;
            align-items: flex-start !important;
            flex-direction: column;
            gap: 12px;
            padding: 0;
        }
        .bpa-shell-page[data-program-list-unit] .budget-page-actions {
            justify-content: flex-start;
            width: 100%;
        }
        .bpa-shell-page[data-program-list-unit] .program-unit-filter-card {
            height: auto;
        }
        .bpa-shell-page[data-program-list-unit] .program-unit-filter-card > .card-body {
            height: auto;
            min-height: 82px;
            align-items: stretch;
            flex-direction: column;
            gap: 14px;
            padding: 16px !important;
        }
        .bpa-shell-page[data-program-list-unit] .program-unit-filter-card .program-filter-heading,
        .bpa-shell-page[data-program-list-unit] .program-unit-filter-card .sku-filter-toolbar {
            flex: 0 0 auto;
            width: 100%;
            min-width: 0;
        }
        .bpa-shell-page[data-program-list-unit] .program-unit-filter-card .sku-filter-toolbar {
            width: 100%;
            max-width: none;
            flex-wrap: wrap;
            height: auto;
        }
        .bpa-shell-page[data-program-list-unit] .program-unit-filter-card .sku-search-box {
            flex: 1 0 100%;
            height: 40px;
        }
        .bpa-shell-page[data-program-list-unit] .program-unit-filter-card .sku-filter-group {
            justify-content: flex-end;
            width: 100%;
            height: 40px;
        }
        .bpa-shell-page[data-program-list-unit] > .container.mt-4 > .card:not(:last-child) > .card-body {
            padding: 16px !important;
        }
        .bpa-shell-page[data-program-list-unit] > .container.mt-4 > .card:last-child table.table {
            min-width: 1000px;
        }
        .bpa-shell-page[data-program-list-unit] .program-unit-table-card .sku-table-header {
            padding: 16px;
        }
        .bpa-shell-page[data-program-list-unit] .program-unit-table-wrapper {
            padding: 0 !important;
        }
    }
    .bpa-shell-page [data-bpa-list-page="sku"] .sku-filter-card {
        display: flex;
        align-items: center;
        gap: 24px;
        height: 82px;
        min-height: 82px;
        margin-bottom: 16px !important;
        padding: 12px 24px;
        overflow: visible;
        box-sizing: border-box;
    }
    .bpa-shell-page [data-bpa-list-page="sku"] .sku-filter-heading {
        flex: 0 1 420px;
        min-width: 220px;
    }
    .bpa-shell-page [data-bpa-list-page="sku"] .sku-filter-heading h4 {
        margin: 0;
        color: #17243b;
        font-size: 14px;
        font-weight: 600;
    }
    .bpa-shell-page [data-bpa-list-page="sku"] .sku-filter-heading p {
        margin: 5px 0 0;
        color: #64748b;
        font-size: 12px;
        line-height: 1.5;
    }
    .bpa-shell-page [data-bpa-list-page="sku"] .sku-filter-controls {
        display: flex;
        flex: 1 1 620px;
        justify-content: flex-end;
        min-width: 0;
    }
    .bpa-shell-page [data-bpa-list-page="sku"] .sku-filter-toolbar {
        display: flex;
        align-items: center;
        flex: 1 1 auto;
        width: min(100%, 820px);
        max-width: 820px;
        height: 44px;
        margin: 0;
        border: 1px solid #d7dfeb;
        border-radius: 11px;
        background: #f8faff;
        box-shadow: 0 4px 12px rgba(15, 23, 42, .04);
        overflow: visible;
    }
    .bpa-shell-page [data-bpa-list-page="sku"] .sku-search-box {
        flex: 1 1 auto;
        min-width: 0;
        height: 42px;
        border: 0;
        border-radius: 10px 0 0 10px;
        background: transparent;
    }
    .bpa-shell-page [data-bpa-list-page="sku"] .sku-search-box:focus-within {
        border-radius: 10px 0 0 10px;
        box-shadow: inset 0 0 0 2px rgba(80, 111, 244, .28);
    }
    .bpa-shell-page [data-bpa-list-page="sku"] .sku-search-box > i,
    .bpa-shell-page [data-bpa-list-page="budget"] .budget-search-box > i {
        flex: 0 0 auto;
        margin-left: 14px;
        color: #98a2b3;
        font-size: 14px;
    }
    .bpa-shell-page [data-bpa-list-page="sku"] .sku-search-box input {
        width: 100%;
        min-width: 0;
        height: 42px;
        padding: 0 14px 0 9px;
        border: 0;
        outline: 0;
        background: transparent;
        color: #344054;
        font: 13px/42px var(--app-font-family);
        box-shadow: none;
    }
    .bpa-shell-page [data-bpa-list-page="sku"] .sku-search-box input::placeholder {
        color: #98a2b3;
    }
    .bpa-shell-page [data-bpa-list-page="sku"] .sku-filter-group {
        display: flex;
        flex: 0 0 auto;
        align-items: center;
        gap: 4px;
        height: 42px;
        margin: 0;
        padding: 0 4px;
        border: 0;
        border-radius: 0 10px 10px 0;
        background: transparent;
    }
    .bpa-shell-page [data-bpa-list-page="sku"] .sku-filter-group > .custom-select {
        width: 42px;
        min-width: 0;
        flex: 0 0 42px;
    }
    .bpa-shell-page [data-bpa-list-page="sku"] .sku-filter-select {
        width: 112px;
        height: 36px;
        padding: 0 28px 0 11px;
        border: 0;
        border-right: 1px solid #e1e7f0;
        border-radius: 6px 0 0 6px;
        background-color: transparent;
        color: #344054;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
    }
    .bpa-shell-page [data-bpa-list-page="sku"] .sku-filter-group .custom-select-button {
        display: flex;
        width: 38px;
        height: 34px;
        min-height: 34px;
        align-items: center;
        justify-content: center;
        gap: 0;
        margin: 0 auto;
        padding: 0;
        border: 1px solid transparent;
        border-radius: 7px;
        background: transparent;
        color: #344054;
        font-size: 18px;
        font-weight: 600;
        transition: background .15s ease, border-color .15s ease, color .15s ease, box-shadow .15s ease;
    }
    .bpa-shell-page [data-bpa-list-page="sku"] .sku-filter-group .custom-select-button:hover:not(:disabled) {
        border-color: #cbd6e6;
        background: #fff;
        color: var(--primary-dark);
        box-shadow: 0 3px 8px rgba(15, 23, 42, .06);
    }
    .bpa-shell-page [data-bpa-list-page="sku"] .sku-filter-group .custom-select-button > i {
        flex: 0 0 auto;
        color: #667085;
        font-size: 18px;
    }
    .bpa-shell-page [data-bpa-list-page="sku"] .sku-filter-group .custom-select-button:hover:not(:disabled) > i {
        color: var(--primary-dark);
    }
    .bpa-shell-page [data-bpa-list-page="sku"] .sku-filter-group .custom-select-button::after {
        right: 5px;
    }
    .bpa-shell-page [data-bpa-list-page="sku"] .sku-filter-group .custom-select-button[data-icon-only="true"]::after {
        display: none;
    }
    .bpa-shell-page [data-bpa-list-page="sku"] .sku-filter-group .custom-select.show .custom-select-button {
        border-radius: 6px;
        background: #fff;
    }
    .bpa-shell-page [data-bpa-list-page="sku"] .sku-filter-group .custom-select-menu {
        left: auto;
        right: 0;
        box-sizing: border-box;
        width: 190px;
        min-width: 190px;
        border: 1px solid #dfe6f0;
        border-radius: 9px;
        background: #fff;
        color: #172033;
        box-shadow: 0 10px 26px rgba(15, 23, 42, .14);
    }
    .bpa-shell-page [data-bpa-list-page="sku"] .sku-filter-group .custom-select-option {
        min-height: 34px;
        padding: 8px 10px;
        color: #172033;
        font-size: 13px;
        line-height: 18px;
        white-space: nowrap;
    }
    .bpa-shell-page [data-bpa-list-page="sku"] .sku-filter-group .custom-select-option:hover,
    .bpa-shell-page [data-bpa-list-page="sku"] .sku-filter-group .custom-select-option.active {
        background: #eef4ff;
        color: #3155c8;
    }
    .bpa-shell-page [data-bpa-list-page="sku"] .sku-table-card {
        overflow: hidden;
    }
    .bpa-shell-page [data-bpa-list-page="sku"] .sku-current-total {
        color: #526078;
        font-weight: 700;
    }
    .bpa-shell-page [data-bpa-list-page="sku"] .sku-table-card.sku-table-enter {
        animation: bpa-dashboard-fade-in-up .45s cubic-bezier(.2, .75, .25, 1) both;
    }
    .bpa-shell-page [data-bpa-list-page="sku"] .sku-table-header {
        display: flex;
        min-height: 76px;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        padding: 18px 22px;
        border-bottom: 1px solid #e7ebf2;
        background: linear-gradient(180deg, #fff, #fbfcff);
    }
    .bpa-shell-page [data-bpa-list-page="sku"] .sku-table-header h5 {
        margin: 0;
        color: #111844;
        font-size: 15px;
        font-weight: 600;
        letter-spacing: -.01em;
    }
    .bpa-shell-page [data-bpa-list-page="sku"] .sku-table-header span {
        display: block;
        margin-top: 4px;
        color: #7288ae;
        font-size: 11px;
    }
    .bpa-shell-page [data-bpa-list-page="sku"] .sku-table-header .sku-record-count {
        flex: 0 0 auto;
        margin: 0;
        padding: 6px 10px;
        border: 1px solid #e3eaf5;
        border-radius: 999px;
        background: #f6f8fc;
        color: #526078;
        font-weight: 600;
    }
    @media (max-width: 768px) {
        .bpa-shell-page {
            padding: 24px 18px;
        }
        .bpa-shell-page [data-bpa-list-page="budget"] .budget-filter-card {
            height: auto;
            align-items: stretch;
            flex-direction: column;
            gap: 14px;
            padding: 16px;
        }
        .bpa-shell-page [data-bpa-list-page="sku"] .sku-filter-card {
            height: auto;
            align-items: stretch;
            flex-direction: column;
            gap: 14px;
            padding: 16px;
        }
        .bpa-shell-page [data-bpa-list-page="sku"] .sku-filter-heading,
        .bpa-shell-page [data-bpa-list-page="sku"] .sku-filter-controls {
            flex: 0 0 auto;
            width: 100%;
            min-width: 0;
        }
        .bpa-shell-page [data-bpa-list-page="sku"] .sku-filter-toolbar {
            width: 100%;
            max-width: none;
        }
        .bpa-shell-page .program-filter-card > .card-body {
            align-items: stretch;
            flex-direction: column;
            gap: 14px;
            padding: 16px !important;
        }
        .bpa-shell-page .program-filter-card {
            height: auto;
            min-height: 82px;
        }
        .bpa-shell-page .program-filter-card > .card-body {
            height: auto;
            min-height: 82px;
        }
        .bpa-shell-page .program-filter-card .program-filter-heading,
        .bpa-shell-page .program-filter-card .program-filter-form {
            flex: 0 0 auto;
            width: 100%;
            min-width: 0;
        }
        .bpa-shell-page .program-filter-card .program-filter-form {
            max-width: none;
            height: auto;
            flex-wrap: wrap;
        }
        .bpa-shell-page .program-filter-card .program-search-box {
            flex: 1 0 100%;
            height: 40px;
        }
        .bpa-shell-page .program-filter-card .program-filter-group {
            justify-content: flex-end;
            width: 100%;
            height: 40px;
        }
        .bpa-shell-page .program-filter-card .program-date-filter {
            margin-right: auto;
        }
        .bpa-shell-page .program-filter-card .program-date-button {
            max-width: 38px;
        }
        .bpa-shell-page .program-filter-card .program-date-range-menu {
            right: auto;
            left: 0;
        }
        .bpa-shell-page [data-bpa-list-page="sku"] .sku-page-header {
            height: auto;
            min-height: 0;
            padding: 0;
        }
        .bpa-shell-page [data-bpa-list-page="sku"] .sku-page-actions {
            flex-wrap: wrap;
            width: 100%;
        }
        .bpa-shell-page [data-bpa-list-page="sku"] .sku-list-action {
            flex: 1 1 125px;
        }
        .bpa-shell-page [data-bpa-list-page="budget"] .budget-page-header {
            height: auto;
            min-height: 0;
            padding: 0;
        }
        .bpa-shell-page [data-bpa-list-page="budget"] > .d-flex.justify-content-between.align-items-center.mb-3.budget-page-header {
            height: auto;
        }
        .bpa-shell-page [data-bpa-list-page="budget"] .budget-filter-heading,
        .bpa-shell-page [data-bpa-list-page="budget"] .budget-filter-controls {
            flex: 0 0 auto;
            width: 100%;
            min-width: 0;
        }
        .bpa-shell-page [data-bpa-list-page="budget"] .budget-filter-toolbar {
            width: 100%;
            max-width: none;
        }
        .bpa-shell-page [data-bpa-list-page] > .d-flex.justify-content-between.align-items-center.mb-3 {
            align-items: flex-start !important;
            flex-direction: column;
            gap: 12px;
            padding: 0;
        }
        .bpa-shell-page [data-bpa-list-page] > .d-flex.justify-content-between.align-items-center.mb-3 > div:last-child,
        .bpa-shell-page [data-bpa-list-page] > .d-flex.justify-content-between.align-items-center.mb-3 > .d-flex {
            justify-content: flex-start;
            width: 100%;
        }
        .bpa-shell-page [data-bpa-list-page="budget"] > .card:last-child > .card-body,
        .bpa-shell-page [data-bpa-list-page="program"] > .card:last-child > .card-body {
            padding: 14px !important;
        }
        .bpa-shell-page [data-bpa-list-page="budget"] > .budget-table-card:last-child > .card-body {
            padding: 0 !important;
        }
        .bpa-shell-page [data-bpa-list-page="budget"] .budget-filter-toolbar {
            height: auto;
            flex-wrap: wrap;
            padding: 4px;
        }
        .bpa-shell-page [data-bpa-list-page="sku"] .sku-filter-toolbar {
            height: auto;
            flex-wrap: wrap;
            padding: 4px;
        }
        .bpa-shell-page [data-bpa-list-page="budget"] .budget-search-box {
            flex: 1 0 100%;
            height: 40px;
            border-radius: 8px;
        }
        .bpa-shell-page [data-bpa-list-page="sku"] .sku-search-box {
            flex: 1 0 100%;
            height: 40px;
            border-radius: 8px;
        }
        .bpa-shell-page [data-bpa-list-page="budget"] .budget-filter-group {
            flex: 0 0 auto;
            justify-content: flex-end;
            width: auto;
            height: 40px;
        }
        .bpa-shell-page [data-bpa-list-page="sku"] .sku-filter-group {
            flex: 0 0 auto;
            justify-content: flex-end;
            width: 100%;
            height: 40px;
        }
        .bpa-shell-page [data-bpa-list-page="budget"] .budget-filter-select {
            flex: 0 0 42px;
        }
        .bpa-shell-page [data-bpa-list-page="budget"] .budget-filter-select--unit {
            flex: 0 0 42px;
            width: 42px;
        }
        .bpa-shell-page [data-bpa-list-page="budget"] .budget-filter-group > .custom-select:nth-of-type(1) {
            flex-basis: 42px;
            width: 42px;
        }
        .bpa-shell-page [data-bpa-list-page="budget"] .budget-filter-group > .custom-select:nth-of-type(2) {
            flex: 0 0 42px;
            width: 42px;
        }
        .bpa-shell-page [data-bpa-list-page="budget"] .budget-table-responsive {
            padding: 12px 12px 0;
        }
        .bpa-shell-page [data-bpa-list-page="budget"] .budget-table-header {
            padding: 16px;
        }
        .bpa-shell-page [data-bpa-list-page="sku"] .sku-table-header {
            padding: 16px;
        }
        .bpa-shell-page [data-bpa-list-page="budget"] .budget-table-note {
            margin: 12px;
        }
        .bpa-shell-page [data-bpa-list-page="sku"] .sku-table-wrapper {
            padding: 0 !important;
        }
        .bpa-shell-page [data-bpa-list-page="program"] .row.g-3.mb-3 > .col-md {
            width: 50%;
        }
    }
    @media (max-width: 575px) {
        .bpa-shell-page [data-bpa-list-page="program"] .row.g-3.mb-3 > .col-md {
            width: 100%;
        }
        .bpa-shell-page [data-bpa-list-page="budget"] .summary-card .fs-5,
        .bpa-shell-page [data-bpa-list-page="program"] .summary-number {
            font-size: 19px;
        }
        .bpa-shell-page [data-bpa-list-page="program"] .d-flex.gap-2 {
            flex-wrap: wrap;
        }
    }
    @media (max-width: 768px) {
        .bpa-dashboard-content .bpa-admin-chart-card .pie-wrapper,
        .bpa-dashboard-content .bpa-admin-chart-card .chart-wrapper {
            flex-basis: 280px;
        }
        .bpa-dashboard-content > .container > .d-flex.justify-content-between.align-items-center.mb-3,
        .bpa-dashboard-content > .container-fluid > .d-flex.justify-content-between.align-items-center.mb-3 {
            padding: 0;
        }
        .bpa-dashboard-content > .container > .d-flex.justify-content-between.align-items-center.mb-3,
        .bpa-dashboard-content > .container-fluid > .d-flex.justify-content-between.align-items-center.mb-3 {
            height: auto;
            min-height: 0;
            flex-direction: column;
            align-items: stretch !important;
            gap: 12px;
        }
        .bpa-dashboard-content .bpa-admin-toolbar {
            min-height: 0 !important;
            flex-direction: column;
            align-items: stretch !important;
            gap: 14px;
        }
        .bpa-dashboard-content .bpa-admin-tools {
            flex-direction: column;
            align-items: stretch;
        }
        .bpa-dashboard-content .bpa-unit-dashboard-tools {
            flex-wrap: wrap;
        }
        .bpa-dashboard-content .bpa-admin-year-select {
            width: 100%;
        }
        .bpa-dashboard-content .bpa-admin-actions {
            display: grid;
            grid-template-columns: repeat(2, 115px);
            justify-content: space-between;
        }
        .bpa-dashboard-content .bpa-unit-dashboard-actions {
            display: flex;
        }
        .bpa-dashboard-content .bpa-admin-action {
            justify-content: center;
            gap: 6px;
            padding-right: 8px;
            padding-left: 8px;
        }
        .bpa-dashboard-content > .container > .d-flex.justify-content-between.align-items-center.mb-3 > form,
        .bpa-dashboard-content > .container-fluid > .d-flex.justify-content-between.align-items-center.mb-3 > form {
            flex-wrap: wrap;
        }
        .bpa-dashboard-content > .container > .card.shadow-sm.border-0 > .card-body,
        .bpa-dashboard-content > .container-fluid > .card.shadow-sm.border-0 > .card-body {
            padding: 16px;
        }
        .bpa-dashboard-content[data-dashboard-unit]:not([data-dashboard-unit="BPA"]) > .container > .row.g-3.mb-3,
        .bpa-dashboard-content[data-dashboard-unit]:not([data-dashboard-unit="BPA"]) > .container-fluid > .row.g-3.mb-3 {
            gap: 16px;
        }
        .bpa-dashboard-content[data-dashboard-unit]:not([data-dashboard-unit="BPA"]) > .container > .row.g-3.mb-3 > [class*="col-"],
        .bpa-dashboard-content[data-dashboard-unit]:not([data-dashboard-unit="BPA"]) > .container-fluid > .row.g-3.mb-3 > [class*="col-"] {
            padding-top: 0;
            margin-top: 0 !important;
        }
        .bpa-dashboard-content[data-dashboard-unit]:not([data-dashboard-unit="BPA"]) > .container > .d-flex.justify-content-between.align-items-center.mb-3 + .row.g-3.mb-3,
        .bpa-dashboard-content[data-dashboard-unit]:not([data-dashboard-unit="BPA"]) > .container-fluid > .d-flex.justify-content-between.align-items-center.mb-3 + .row.g-3.mb-3 {
            margin-top: 0 !important;
            margin-bottom: 16px !important;
        }
        .bpa-dashboard-content .kpi-row,
        .bpa-dashboard-content[data-dashboard-unit]:not([data-dashboard-unit="BPA"]) > .container > .row.g-3.mb-3 {
            grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .bpa-dashboard-content[data-dashboard-unit="BPA"] .kpi-row {
            grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .bpa-dashboard-content[data-dashboard-unit]:not([data-dashboard-unit="BPA"]) .card-kpi .card-body {
            min-height: 118px;
            padding: 16px !important;
        }
        .bpa-dashboard-content[data-dashboard-unit]:not([data-dashboard-unit="BPA"]) .container > .card.shadow-sm.border-0.mb-3 > .card-body,
        .bpa-dashboard-content[data-dashboard-unit]:not([data-dashboard-unit="BPA"]) .container > .row.g-3:not(.mb-3) > [class*="col-"] > .card > .card-body {
            padding: 16px;
        }
        .bpa-shell-page .kpi-row {
            grid-template-columns: repeat(auto-fit, minmax(min(100%, 145px), 1fr));
        }
        .bpa-shell-page .d-flex.justify-content-between {
            align-items: flex-start !important;
            flex-direction: column;
            gap: 14px;
        }
        .bpa-shell-page .d-flex.justify-content-between > form {
            flex-wrap: wrap;
        }
    }
    @media (prefers-reduced-motion: reduce) {
        .bpa-shell-page *,
        .bpa-shell-page *::before,
        .bpa-shell-page *::after {
            scroll-behavior: auto !important;
            transition-duration: 0.1s !important;
            animation-duration: 0.1s !important;
            animation-iteration-count: 1 !important;
        }
        .bpa-shell-page.bpa-dashboard-content .bpa-dashboard-content-enter {
            animation-name: bpa-dashboard-fade-in-up !important;
            animation-duration: 0.6s !important;
        }
    }
</style>
CSS;
    $bpaStyles = implode("\n", $preservedBpaStyles);
    $bpaStyles = preg_replace('/<style\b/i', '<style data-bpa-page-style', $bpaStyles)
        ?? throw new RuntimeException('Could not mark BPA page styles.');
    $themeCss = preg_replace('/<style\b/i', '<style data-bpa-page-style', $themeCss)
        ?? throw new RuntimeException('Could not mark the BPA theme styles.');
    $html = preg_replace('/<\/head>/i', $bpaStyles . $themeCss . '</head>', $html, 1);
    if ($html === null) {
        throw new RuntimeException('Could not apply the BPA page theme.');
    }

    if ($basePath !== '') {
        $bootstrap = '<script>window.APP_BASE_PATH=' . json_encode($basePath, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) . ';'
            . 'window.appPathname=function(path){path=path||window.location.pathname;return path===window.APP_BASE_PATH?"/":path.indexOf(window.APP_BASE_PATH+"/")===0?path.slice(window.APP_BASE_PATH.length)||"/":path;};'
            . 'window.appUrl=function(path){return window.APP_BASE_PATH+(path.charAt(0)==="/"?path:"/"+path);};'
            . 'var appNativeFetch=window.fetch.bind(window);window.fetch=function(input,init){var value=input;var request=input instanceof Request;var url=request?new URL(input.url):new URL(String(input),window.location.href);if(url.origin===window.location.origin&&url.pathname!==window.APP_BASE_PATH&&url.pathname.indexOf(window.APP_BASE_PATH+"/")!==0){url.pathname=window.APP_BASE_PATH+url.pathname;}if(request){value=new Request(url.href,input);}else if(input instanceof URL){value=url.href;}else if(typeof input==="string"){value=url.href;}return appNativeFetch(value,init);};</script>';
        $html = preg_replace('~</head>~i', $bootstrap . '</head>', $html, 1, $count)
            ?? throw new RuntimeException('Could not configure the BPA application base path.');
        if ($count !== 1) {
            throw new RuntimeException('The BPA application shell is missing its head element.');
        }
    }

    if ($preservedBpaScripts !== []) {
        $bpaScripts = $rewriteBpaUrls(implode("\n", $preservedBpaScripts));
        $bpaScripts = preg_replace('/<script\b/i', '<script data-bpa-page-script', $bpaScripts)
            ?? throw new RuntimeException('Could not mark BPA page scripts.');
        $html = preg_replace('~</body>~i', $bpaScripts . '</body>', $html, 1, $count)
            ?? throw new RuntimeException('Could not restore BPA page scripts.');
        if ($count !== 1) {
            throw new RuntimeException('The BPA application shell is missing its body element.');
        }
    }

    header('Content-Type: text/html; charset=utf-8');
    echo $html;
    exit;
}

$pages = [
    '/' => 'dashboard.html',
    '/log-masuk' => 'login.html',
    '/cipta-akaun' => 'create-account.html',
    '/muat-naik' => 'upload.html',
    '/set-data' => 'dataset.html',
    '/peserta-program' => 'peserta-program.html',
    '/penerima-bantuan' => 'penerima-bantuan.html',
    '/aktiviti-pengguna' => 'user.html',
    '/pengurusan-pengguna' => 'manage-users.html',
    '/akaun-pengguna' => 'account.html',
    '/log-perisian' => 'updates.html',
    '/sidebar' => 'components/sidebar.html',
    '/header' => 'components/header.html',
];
$page = $pages[$path] ?? null;
if ($page === null && preg_match('#^/set-data/(\d+)$#', $path, $matches)) {
    header('Location: ' . $basePath . '/set-data?id=' . rawurlencode($matches[1]), true, 302);
    exit;
}
if ($page === null) {
    header('Location: ' . $basePath . '/', true, 302);
    exit;
}

$user = currentUser($pdo);
if ($path !== '/log-masuk' && $path !== '/cipta-akaun' && $path !== '/sidebar' && $path !== '/header' && !$user) {
    header('Location: ' . $basePath . '/log-masuk');
    exit;
}
if ($user && ($requiredPage = requiredPageForPath($path)) !== null && !canAccessUserPage($user, $requiredPage)) {
    http_response_code(403);
    echo 'You do not have permission to access this page.';
    exit;
}

$viewPath = __DIR__ . '/views/' . $page;
if (!is_file($viewPath)) {
    http_response_code(404);
    echo 'Page not found';
    exit;
}
$html = file_get_contents($viewPath);
if ($html === false) {
    throw new RuntimeException('Could not read the requested page.');
}
$rewriteHtmlUrls = static function (string $markup) use ($basePath): string {
    $rewritten = preg_replace_callback(
        '~(\b(?:href|src|action)\s*=\s*)(["\'])/(?!/)([^"\']*)\2~i',
        static function (array $match) use ($basePath): string {
            $urlPath = $match[3];
            if ($basePath !== '' && ($urlPath === ltrim($basePath, '/') || str_starts_with($urlPath, ltrim($basePath, '/') . '/'))) {
                return $match[0];
            }
            return $match[1] . $match[2] . $basePath . '/' . $urlPath . $match[2];
        },
        $markup
    );
    if ($rewritten === null) {
        throw new RuntimeException('Could not rewrite application URLs.');
    }
    return $rewritten;
};
$html = $rewriteHtmlUrls($html);

if ($path === '/akaun-pengguna') {
    $html = str_replace('__APP_CSRF_TOKEN__', htmlspecialchars(appCsrfToken(), ENT_QUOTES, 'UTF-8'), $html);
}
if ($path === '/pengurusan-pengguna') {
    $html = str_replace('__APP_CSRF_TOKEN__', htmlspecialchars(appCsrfToken(), ENT_QUOTES, 'UTF-8'), $html);
}

if (isset($_SERVER['HTTP_X_APP_FRAGMENT']) || in_array($path, ['/sidebar', '/header'], true)) {
    header('Content-Type: text/html; charset=utf-8');
    if ($path === '/sidebar') {
        $html = str_replace('__APP_CSRF_TOKEN__', htmlspecialchars(appCsrfToken(), ENT_QUOTES, 'UTF-8'), $html);
    }
    echo $html;
    exit;
}

if ($path === '/muat-naik' || $path === '/set-data' || $path === '/peserta-program' || $path === '/penerima-bantuan' || $path === '/aktiviti-pengguna' || $path === '/pengurusan-pengguna' || $path === '/akaun-pengguna' || $path === '/log-perisian') {
    $shellPath = __DIR__ . '/views/dashboard.html';
    $shell = file_get_contents($shellPath);
    $start = strpos($shell, '<main class="main-content" id="page-content">');
    $end = $start === false ? false : strpos($shell, '</main>', $start);
    $fragmentStart = strpos($html, '<main');
    $fragmentOpenEnd = $fragmentStart === false ? false : strpos($html, '>', $fragmentStart);
    $fragmentEnd = strrpos($html, '</main>');
    if ($start === false || $end === false || $fragmentOpenEnd === false || $fragmentEnd === false) {
        throw new RuntimeException('Page layout template is invalid.');
    }
    $inner = substr($html, $fragmentOpenEnd + 1, $fragmentEnd - $fragmentOpenEnd - 1);
    $html = substr($shell, 0, $start) . '<main class="main-content" id="page-content">' . $inner . substr($shell, $end + strlen('</main>'));
}

if ($basePath !== '') {
    $bootstrap = '<script>window.APP_BASE_PATH=' . json_encode($basePath, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) . ';'
        . 'window.appPathname=function(path){path=path||window.location.pathname;return path===window.APP_BASE_PATH?"/":path.indexOf(window.APP_BASE_PATH+"/")===0?path.slice(window.APP_BASE_PATH.length)||"/":path;};'
        . 'window.appUrl=function(path){return window.APP_BASE_PATH+(path.charAt(0)==="/"?path:"/"+path);};'
        . 'var appNativeFetch=window.fetch.bind(window);window.fetch=function(input,init){var value=input;var request=input instanceof Request;var url=request?new URL(input.url):new URL(String(input),window.location.href);if(url.origin===window.location.origin&&url.pathname!==window.APP_BASE_PATH&&url.pathname.indexOf(window.APP_BASE_PATH+"/")!==0){url.pathname=window.APP_BASE_PATH+url.pathname;}if(request){value=new Request(url.href,input);}else if(input instanceof URL){value=url.href;}else if(typeof input==="string"){value=url.href;}return appNativeFetch(value,init);};</script>';
    $html = $rewriteHtmlUrls($html);
    $html = preg_replace('~</head>~i', $bootstrap . '</head>', $html, 1, $count) ?? throw new RuntimeException('Could not configure application base path.');
    if ($count !== 1) {
        throw new RuntimeException('Application page is missing its head element.');
    }
}

header('Content-Type: text/html; charset=utf-8');
echo $html;
