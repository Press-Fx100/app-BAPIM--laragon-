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

function jsonResponse(array $data, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

function currentUser(PDO $pdo): ?array
{
    if (empty($_SESSION['username'])) {
        return null;
    }

    $statement = $pdo->prepare(
        'SELECT id, username, display_name, active, PICname FROM users WHERE username = ? AND active = 1'
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
            $normalizedKey = strtoupper(str_replace('_', ' ', (string)$key));
            $columnIndex = false;
            foreach ($headers as $headerIndex => $header) {
                if (preg_replace('/[^A-Z0-9]/', '', $header) === preg_replace('/[^A-Z0-9]/', '', $normalizedKey)) {
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
        requireApiUser($pdo);
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
        requireApiUser($pdo);
        $providedToken = (string)($payload['csrfToken'] ?? '');
        if ($providedToken === '' || !hash_equals(appCsrfToken(), $providedToken)) {
            jsonResponse(['success' => false, 'error' => 'Your session expired. Refresh the page and try again.'], 403);
        }
        $commit = (string)($payload['commit'] ?? '');
        if (!preg_match('/^[a-f0-9]{40}$/i', $commit)) {
            jsonResponse(['success' => false, 'error' => 'The requested update version is invalid.'], 400);
        }
        try {
            $result = bapimApplyGitHubUpdate(__DIR__, dirname($storageDirectory), $commit);
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
        jsonResponse(['success' => true, 'username' => $user['username'], 'displayName' => $user['display_name'], 'PICname' => $user['PICname']]);
    }
    if ($path === '/api/auth/login' && $method === 'POST') {
        $loginName = trim((string)($payload['username'] ?? ''));
        $password = (string)($payload['password'] ?? '');
        $statement = $pdo->prepare('SELECT username, display_name, password_hash, active, PICname FROM users WHERE username = ? LIMIT 1');
        $statement->execute([$loginName]);
        $account = $statement->fetch();
        if ($loginName === '' || $password === '') {
            jsonResponse(['success' => false, 'error' => 'Username and password are required.'], 400);
        }
        if (!$account || !(int)$account['active'] || !password_verify($password, $account['password_hash'])) {
            jsonResponse(['success' => false, 'error' => 'Invalid username or password.'], 401);
        }
        session_regenerate_id(true);
        $_SESSION['username'] = $account['username'];
        $statement = $pdo->prepare('INSERT INTO login_history (username) VALUES (?)');
        $statement->execute([$account['username']]);
        jsonResponse(['success' => true, 'online' => true, 'username' => $account['username'], 'displayName' => $account['display_name'], 'PICname' => $account['PICname']]);
    }
    if ($path === '/api/auth/offline-login' && $method === 'POST') {
        jsonResponse(['success' => false, 'error' => 'Please sign in with your username and password.'], 401);
    }
    if ($path === '/api/auth/session' && $method === 'POST') {
        if (!$user) {
            jsonResponse(['success' => false, 'error' => 'Please sign in with your username and password.'], 401);
        }
        jsonResponse(['success' => true, 'username' => $user['username'], 'displayName' => $user['display_name'], 'PICname' => $user['PICname']]);
    }
    if ($path === '/api/auth/create-account' && $method === 'POST') {
        $name = trim((string)($payload['username'] ?? ''));
        $displayName = trim((string)($payload['displayName'] ?? ''));
        $password = (string)($payload['password'] ?? '');
        if ($name === '' || $displayName === '' || $password === '') {
            jsonResponse(['success' => false, 'error' => 'All fields are required.'], 400);
        }
        if (strlen($name) > 100 || strlen($displayName) > 160 || strlen($password) < 8) {
            jsonResponse(['success' => false, 'error' => 'Use a username of up to 100 characters, a display name of up to 160 characters, and a password of at least 8 characters.'], 400);
        }
        try {
            $statement = $pdo->prepare('INSERT INTO users (username, display_name, password_hash) VALUES (?, ?, ?)');
            $statement->execute([$name, $displayName, password_hash($password, PASSWORD_DEFAULT)]);
        } catch (PDOException $error) {
            if ($error->getCode() === '23000') {
                jsonResponse(['success' => false, 'error' => 'Username already exists.'], 409);
            }
            throw $error;
        }
        session_regenerate_id(true);
        $_SESSION['username'] = $name;
        jsonResponse(['success' => true, 'username' => $name, 'displayName' => $displayName, 'PICname' => ''], 201);
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
        $statement = $pdo->prepare('UPDATE users SET active = 0 WHERE username = ?');
        $statement->execute([$targetUsername]);
        jsonResponse(['success' => true]);
    }
    if ($path === '/api/auth/users' && $method === 'GET') {
        requireApiUser($pdo);
        $users = $pdo->query('SELECT username, display_name AS displayName, PICname FROM users WHERE active = 1 ORDER BY display_name')->fetchAll();
        jsonResponse(['success' => true, 'users' => $users]);
    }

    if ($path === '/api/datasets' && $method === 'GET') {
        requireApiUser($pdo);
        jsonResponse($pdo->query('SELECT id, name, filename, row_count, column_count, file_size, version, created_at, updated_at, remote_version, last_synced_at, sync_status, dataset_type FROM datasets ORDER BY updated_at DESC')->fetchAll());
    }
    if (preg_match('#^/api/datasets/(\d+)(?:/columns)?$#', $path, $matches) && $method === 'GET') {
        requireApiUser($pdo);
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
        requireApiUser($pdo);
        $summary = $pdo->query('SELECT COUNT(*) AS totalDatasets, COALESCE(SUM(row_count), 0) AS totalRecords, COALESCE(SUM(file_size), 0) AS uploadSize FROM datasets')->fetch();
        $summary['success'] = true;
        $summary['totalColumns'] = 0;
        $summary['databaseSize'] = 0;
        $summary['recent'] = $pdo->query('SELECT id, name, filename, row_count, column_count, file_size, version, created_at, updated_at, sync_status FROM datasets ORDER BY updated_at DESC LIMIT 5')->fetchAll();
        jsonResponse($summary);
    }
    if ($path === '/api/peserta-program' && $method === 'GET') {
        requireApiUser($pdo);
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
            foreach (array_slice($rows, 1, null, true) as $rowIndex => $row) {
                $identity = trim($row[$identityIndex] ?? '');
                if ($identity === '') {
                    continue;
                }
                if (!isset($participants[$identity])) {
                    $participants[$identity] = ['nama' => trim($row[$nameIndex] ?? ''), 'kadPengenalan' => $identity, 'ketegori' => $categoryIndex !== false ? trim($row[$categoryIndex] ?? '') : '', 'programs' => [], 'sourceFiles' => [], 'sourceRecords' => []];
                }
                $item = &$participants[$identity];
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
            $output[] = ['index' => $index + 1, 'nama' => $item['nama'], 'kadPengenalan' => $item['kadPengenalan'], 'ketegori' => $item['ketegori'], 'jumlahProgram' => count($item['programs']), 'programs' => $item['programs'], 'sourceFile' => implode(', ', $item['sourceFiles']), 'datasetId' => $item['sourceRecords'][0]['datasetId'] ?? null, 'sourceRecords' => $item['sourceRecords']];
        }
        jsonResponse(['success' => true, 'participants' => $output]);
    }
    if ($path === '/api/penerima-bantuan' && $method === 'GET') {
        requireApiUser($pdo);
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
            foreach (array_slice($rows, 1, null, true) as $rowIndex => $row) {
                $recipients[] = ['nama' => $indices['NAMA'] !== false ? trim($row[$indices['NAMA']] ?? '') : '', 'kadPengenalan' => $indices['KAD PENGENALAN'] !== false ? trim($row[$indices['KAD PENGENALAN']] ?? '') : '', 'telefon' => $indices['TELEFON'] !== false ? trim($row[$indices['TELEFON']] ?? '') : '', 'email' => $indices['EMAIL'] !== false ? trim($row[$indices['EMAIL']] ?? '') : '', 'status' => $indices['STATUS'] !== false ? trim($row[$indices['STATUS']] ?? '') : '', 'catatan' => $indices['CATATAN'] !== false ? trim($row[$indices['CATATAN']] ?? '') : '', 'pic' => $indices['PIC'] !== false ? trim($row[$indices['PIC']] ?? '') : '', 'sourceFile' => $dataset['filename'], 'datasetId' => (int)$dataset['id'], 'rowIndex' => $rowIndex, 'sourceRecords' => [['datasetId' => (int)$dataset['id'], 'rowIndex' => $rowIndex, 'sourceFile' => $dataset['filename']]]];
            }
        }
        jsonResponse(['success' => true, 'recipients' => $recipients]);
    }
    if ($path === '/api/user/activity' && $method === 'GET') {
        $account = requireApiUser($pdo);
        $limit = min(max((int)($query['limit'] ?? 1000), 1), 1000);
        $activityUsername = trim((string)$account['display_name']);
        $picUsername = trim((string)($account['PICname'] ?: $activityUsername ?: $account['username']));
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
            "SELECT COALESCE(SUM(progress_change), 0) FROM user_activity WHERE (LOWER(TRIM(username)) IN (LOWER(TRIM(?)), LOWER(TRIM(?)), LOWER(TRIM(?))) OR LOWER(TRIM(username)) = 'unknown') AND created_at >= DATE_SUB(NOW(), INTERVAL 1 MONTH)"
        );
        $progressStatement->execute([$activityUsername, $account['username'], $account['PICname']]);
        $progressChange = (int)$progressStatement->fetchColumn();
        $statement = $pdo->prepare("SELECT activity.id, activity.username, activity.dataset_id, COALESCE(NULLIF(dataset.name, ''), activity.dataset_name) AS dataset_name, activity.action, activity.row_id, activity.column_name, activity.old_value, activity.new_value, activity.progress_change, activity.created_at FROM user_activity AS activity LEFT JOIN datasets AS dataset ON dataset.id = activity.dataset_id ORDER BY activity.created_at DESC, activity.id DESC LIMIT ?");
        $statement->bindValue(1, $limit, PDO::PARAM_INT);
        $statement->execute();
        $activities = $statement->fetchAll();
        $earliest = $pdo->query("SELECT MIN(DATE_FORMAT(created_at, '%Y-%m')) FROM user_activity WHERE action = 'status_change' OR (action = 'UPDATE' AND UPPER(TRIM(column_name)) = 'STATUS')")->fetchColumn();
        jsonResponse(['success' => true, 'user' => ['username' => $account['username'], 'displayName' => $account['display_name'], 'PICname' => $account['PICname']], 'activityUsername' => $activityUsername, 'statusCount' => $statusCount, 'progressChange' => $progressChange, 'totalActivity' => $statusCount + $progressChange, 'activities' => $activities, 'earliestActivityMonth' => $earliest ?: '']);
    }
    if ($path === '/api/user/activity/month' && $method === 'GET') {
        requireApiUser($pdo);
        $month = (string)($query['month'] ?? '');
        if (!preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', $month)) {
            jsonResponse(['success' => false, 'error' => 'A valid month in YYYY-MM format is required.'], 400);
        }
        if ($month > date('Y-m')) {
            jsonResponse(['success' => false, 'error' => 'Activity cannot be requested for a future month.'], 400);
        }
        $earliest = $pdo->query("SELECT MIN(DATE_FORMAT(created_at, '%Y-%m')) FROM user_activity WHERE action = 'status_change' OR (action = 'UPDATE' AND UPPER(TRIM(column_name)) = 'STATUS')")->fetchColumn();
        $statement = $pdo->prepare("SELECT username, DAY(created_at) AS day, SUM(CASE WHEN TRIM(COALESCE(old_value,'')) = '' AND TRIM(COALESCE(new_value,'')) <> '' THEN 1 WHEN TRIM(COALESCE(old_value,'')) <> '' AND TRIM(COALESCE(new_value,'')) = '' THEN -1 ELSE 0 END) AS progress_change FROM user_activity WHERE (action = 'status_change' OR (action = 'UPDATE' AND UPPER(TRIM(column_name)) = 'STATUS')) AND DATE_FORMAT(created_at, '%Y-%m') = ? GROUP BY username, DAY(created_at) ORDER BY username, day");
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
        requireApiUser($pdo);
        $activities = $pdo->query("SELECT activity.id, activity.username, activity.dataset_id, COALESCE(NULLIF(dataset.name, ''), activity.dataset_name) AS dataset_name, activity.action, activity.row_id, activity.column_name, activity.old_value, activity.new_value, activity.progress_change, activity.created_at FROM user_activity AS activity LEFT JOIN datasets AS dataset ON dataset.id = activity.dataset_id WHERE activity.created_at >= DATE_SUB(NOW(), INTERVAL 1 MONTH) ORDER BY activity.created_at DESC, activity.id DESC")->fetchAll();
        jsonResponse($activities);
    }

    if ($path === '/api/preview' && $method === 'POST') {
        requireApiUser($pdo);
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
        $account = requireApiUser($pdo);
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
        $datasetType = ($payload['datasetType'] ?? '') === 'peserta' ? 'peserta' : 'penerima';
        $pdo->beginTransaction();
        try {
            $statement = $pdo->prepare("INSERT INTO datasets (name, filename, filepath, row_count, column_count, file_size, dataset_type, created_at, updated_at, sync_status) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), 'local')");
            $statement->execute([$name, $safeOriginal, $filepath, max(count($rows) - 1, 0), count($rows[0]), strlen($csv), $datasetType]);
            $id = (int)$pdo->lastInsertId();
            recordActivity($pdo, $account['display_name'], $id, $name, 'dataset_create');
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
        $account = requireApiUser($pdo);
        $participant = $matches[1] === 'peserta-program';
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
                foreach ($alternates as $alternate) {
                    if (array_key_exists($alternate, $changes)) {
                        $row[$index] = (string)$changes[$alternate];
                        break;
                    }
                }
            }
            $rows[] = $row;
            updateCsvDataset($pdo, $dataset, normalizeRows($rows), $account['display_name']);
            jsonResponse(['success' => true, 'datasetId' => (int)$dataset['id']], 201);
        }
        editMappedRecord($pdo, $payload, $account['display_name'], $participant, $method === 'DELETE');
    }
    if (preg_match('#^/api/datasets/(\d+)$#', $path, $matches) && $method === 'PUT') {
        $account = requireApiUser($pdo);
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
        $updated = updateCsvDataset($pdo, $dataset, $rows, $account['display_name']);
        jsonResponse(['success' => true, 'id' => (int)$updated['id'], 'row_count' => (int)$updated['row_count'], 'column_count' => (int)$updated['column_count'], 'file_size' => (int)$updated['file_size'], 'version' => (int)$updated['version'], 'sync_status' => 'modified']);
    }
    if (($path === '/api/datasets' || preg_match('#^/api/datasets/\d+$#', $path)) && $method === 'DELETE') {
        $account = requireApiUser($pdo);
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
                recordActivity($pdo, $account['display_name'], $id, $dataset['name'], 'dataset_delete');
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
if ($basePath !== '' && ($path === $basePath || str_starts_with($path, $basePath . '/'))) {
    $path = substr($path, strlen($basePath)) ?: '/';
}
$path = rtrim($path, '/') ?: '/';

if (str_starts_with($path, '/api/')) {
    try {
        runApi($pdo, $path, $method, $storageDirectory);
    } catch (Throwable $error) {
        error_log(sprintf('Application API error: %s in %s:%d', $error->getMessage(), $error->getFile(), $error->getLine()));
        jsonResponse(['success' => false, 'error' => 'The request could not be completed. Check the PHP error log.'], 500);
    }
}

$pages = [
    '/' => 'dashboard.html',
    '/login' => 'login.html',
    '/create-account' => 'create-account.html',
    '/upload' => 'upload.html',
    '/data-set' => 'dataset.html',
    '/peserta-program' => 'peserta-program.html',
    '/penerima-bantuan' => 'penerima-bantuan.html',
    '/user' => 'user.html',
    '/sidebar' => 'components/sidebar.html',
    '/header' => 'components/header.html',
];
$page = $pages[$path] ?? null;
if ($page === null && preg_match('#^/data-set/(\d+)$#', $path, $matches)) {
    header('Location: ' . $basePath . '/data-set?id=' . rawurlencode($matches[1]), true, 302);
    exit;
}
if ($page === null) {
    http_response_code(404);
    echo 'Not found';
    exit;
}

$user = currentUser($pdo);
if ($path !== '/login' && $path !== '/create-account' && $path !== '/sidebar' && $path !== '/header' && !$user) {
    header('Location: ' . $basePath . '/login');
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

if (isset($_SERVER['HTTP_X_APP_FRAGMENT']) || in_array($path, ['/sidebar', '/header'], true)) {
    header('Content-Type: text/html; charset=utf-8');
    if ($path === '/sidebar') {
        $html = str_replace('__APP_CSRF_TOKEN__', htmlspecialchars(appCsrfToken(), ENT_QUOTES, 'UTF-8'), $html);
    }
    echo $html;
    exit;
}

if ($path === '/upload' || $path === '/data-set' || $path === '/peserta-program' || $path === '/penerima-bantuan' || $path === '/user') {
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
