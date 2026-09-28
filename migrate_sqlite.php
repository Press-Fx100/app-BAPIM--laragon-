<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

$sourcePath = __DIR__ . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'database.db';
$storageDirectory = __DIR__ . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'csv';

if (!is_file($sourcePath)) {
    fwrite(STDERR, "SQLite database not found at data\\database.db.\n");
    exit(1);
}
if (!extension_loaded('pdo_sqlite')) {
    fwrite(STDERR, "Enable the pdo_sqlite PHP extension to migrate the old database.\n");
    exit(1);
}
if (!is_dir($storageDirectory) && !mkdir($storageDirectory, 0770, true) && !is_dir($storageDirectory)) {
    fwrite(STDERR, "Could not create data\\csv.\n");
    exit(1);
}

$config = require __DIR__ . DIRECTORY_SEPARATOR . 'config' . DIRECTORY_SEPARATOR . 'database.php';
$dsn = sprintf(
    'mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4',
    $config['host'],
    $config['port'],
    $config['database']
);
$mysql = new PDO($dsn, $config['username'], $config['password'], [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES => false,
]);
$sqlite = new PDO('sqlite:' . $sourcePath, null, null, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
]);

$targetCounts = $mysql->query(
    'SELECT (SELECT COUNT(*) FROM datasets) AS datasets, (SELECT COUNT(*) FROM user_activity) AS activities, (SELECT COUNT(*) FROM login_history) AS logins'
)->fetch();
if ((int)$targetCounts['datasets'] > 0 || (int)$targetCounts['activities'] > 0 || (int)$targetCounts['logins'] > 0) {
    fwrite(STDERR, "The MySQL database already contains data. Migration stopped without changing it.\n");
    exit(1);
}

$sourceTables = $sqlite->query("SELECT name FROM sqlite_master WHERE type = 'table'")->fetchAll(PDO::FETCH_COLUMN);
if (!in_array('datasets', $sourceTables, true)) {
    fwrite(STDERR, "The SQLite database has no datasets table.\n");
    exit(1);
}

$datasetColumns = array_column($sqlite->query('PRAGMA table_info(datasets)')->fetchAll(), 'name');
$activityColumns = in_array('user_activity', $sourceTables, true)
    ? array_column($sqlite->query('PRAGMA table_info(user_activity)')->fetchAll(), 'name')
    : [];
$loginColumns = in_array('login_history', $sourceTables, true)
    ? array_column($sqlite->query('PRAGMA table_info(login_history)')->fetchAll(), 'name')
    : [];
$createdCopies = [];
$datasetCount = 0;
$activityCount = 0;
$loginCount = 0;

$value = static function (array $row, array $columns, string $key, mixed $default = null): mixed {
    return in_array($key, $columns, true) ? ($row[$key] ?? $default) : $default;
};

try {
    $mysql->beginTransaction();
    $insertDataset = $mysql->prepare(
        'INSERT INTO datasets (id, name, filename, filepath, row_count, column_count, file_size, dataset_type, version, created_at, updated_at, remote_version, last_synced_at, sync_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );

    foreach ($sqlite->query('SELECT * FROM datasets ORDER BY id') as $row) {
        $oldPath = trim((string)($row['filepath'] ?? ''));
        $sourceFile = $oldPath !== '' && is_file($oldPath)
            ? $oldPath
            : $storageDirectory . DIRECTORY_SEPARATOR . basename(str_replace('\\', '/', $oldPath));
        if (!is_file($sourceFile)) {
            throw new RuntimeException('A dataset CSV file is missing; migration was stopped.');
        }

        $storageReal = realpath($storageDirectory);
        $sourceReal = realpath($sourceFile);
        if ($storageReal === false || $sourceReal === false) {
            throw new RuntimeException('Could not resolve a dataset CSV path.');
        }
        if (strtolower(dirname($sourceReal)) === strtolower($storageReal)) {
            $newPath = $sourceReal;
        } else {
            $newPath = $storageDirectory . DIRECTORY_SEPARATOR . 'migrated_' . (int)$row['id'] . '_' . bin2hex(random_bytes(8)) . '.csv';
            if (!copy($sourceReal, $newPath)) {
                throw new RuntimeException('Could not copy a dataset CSV file.');
            }
            $createdCopies[] = $newPath;
        }

        $name = (string)($row['name'] ?? pathinfo($newPath, PATHINFO_FILENAME));
        $filename = (string)($row['filename'] ?? basename($newPath));
        $datasetType = (string)$value($row, $datasetColumns, 'dataset_type', '');
        if (!in_array($datasetType, ['peserta', 'penerima'], true)) {
            $datasetType = stripos($name . ' ' . $filename, 'peserta') !== false ? 'peserta' : 'penerima';
        }

        $insertDataset->execute([
            (int)$row['id'],
            $name,
            $filename,
            $newPath,
            max(0, (int)$value($row, $datasetColumns, 'row_count', 0)),
            max(0, (int)$value($row, $datasetColumns, 'column_count', 0)),
            max(0, (int)$value($row, $datasetColumns, 'file_size', filesize($newPath))),
            $datasetType,
            max(1, (int)$value($row, $datasetColumns, 'version', 1)),
            $value($row, $datasetColumns, 'created_at', date('Y-m-d H:i:s')),
            $value($row, $datasetColumns, 'updated_at', date('Y-m-d H:i:s')),
            $value($row, $datasetColumns, 'remote_version'),
            $value($row, $datasetColumns, 'last_synced_at'),
            (string)$value($row, $datasetColumns, 'sync_status', 'local'),
        ]);
        $datasetCount++;
    }

    if ($activityColumns !== []) {
        $insertActivity = $mysql->prepare(
            'INSERT INTO user_activity (id, username, dataset_id, dataset_name, action, row_id, column_name, old_value, new_value, progress_change, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        foreach ($sqlite->query('SELECT * FROM user_activity ORDER BY id') as $row) {
            $insertActivity->execute([
                (int)$row['id'],
                (string)$value($row, $activityColumns, 'username', 'Unknown'),
                $value($row, $activityColumns, 'dataset_id'),
                $value($row, $activityColumns, 'dataset_name'),
                (string)$value($row, $activityColumns, 'action', 'unknown'),
                $value($row, $activityColumns, 'row_id'),
                $value($row, $activityColumns, 'column_name'),
                $value($row, $activityColumns, 'old_value'),
                $value($row, $activityColumns, 'new_value'),
                (int)$value($row, $activityColumns, 'progress_change', 0),
                $value($row, $activityColumns, 'created_at', date('Y-m-d H:i:s')),
            ]);
            $activityCount++;
        }
    }

    if ($loginColumns !== []) {
        $insertLogin = $mysql->prepare('INSERT INTO login_history (id, username, login_at) VALUES (?, ?, ?)');
        foreach ($sqlite->query('SELECT * FROM login_history ORDER BY id') as $row) {
            $insertLogin->execute([
                (int)$row['id'],
                (string)$value($row, $loginColumns, 'username', 'Unknown'),
                $value($row, $loginColumns, 'login_at', date('Y-m-d H:i:s')),
            ]);
            $loginCount++;
        }
    }

    $mysql->commit();
} catch (Throwable $error) {
    if ($mysql->inTransaction()) {
        $mysql->rollBack();
    }
    foreach ($createdCopies as $copy) {
        if (is_file($copy)) {
            unlink($copy);
        }
    }
    error_log('SQLite migration failed: ' . $error->getMessage());
    fwrite(STDERR, "Migration failed. Check the PHP error log; no MySQL records were committed.\n");
    exit(1);
}

fwrite(STDOUT, "Migrated {$datasetCount} dataset(s), {$activityCount} activity record(s), and {$loginCount} login record(s).\n");
fwrite(STDOUT, "User accounts were not migrated because the legacy database has no local password hashes. Create new accounts in the web app.\n");
