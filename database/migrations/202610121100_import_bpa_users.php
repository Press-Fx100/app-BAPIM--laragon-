<?php
declare(strict_types=1);

return static function (PDO $pdo, string $rootDirectory): void {
    $databaseConfig = require $rootDirectory . '/config/database.php';
    $sourceConfig = $databaseConfig['bpa_database'] ?? $databaseConfig;

    $sourceHost = getenv('BPA_DB_HOST');
    $sourcePort = getenv('BPA_DB_PORT');
    $sourceName = getenv('BPA_DB_NAME');
    $sourceUsername = getenv('BPA_DB_USER');
    $sourcePassword = getenv('BPA_DB_PASSWORD');
    $sourceHost = $sourceHost !== false && $sourceHost !== '' ? $sourceHost : ($sourceConfig['host'] ?? '');
    $sourcePort = $sourcePort !== false && $sourcePort !== '' ? $sourcePort : ($sourceConfig['port'] ?? '3306');
    $sourceName = $sourceName !== false && $sourceName !== '' ? $sourceName : 'bpa';
    $sourceUsername = $sourceUsername !== false && $sourceUsername !== '' ? $sourceUsername : ($sourceConfig['username'] ?? '');
    $sourcePassword = $sourcePassword !== false ? $sourcePassword : ($sourceConfig['password'] ?? '');

    if ($sourceHost === '' || $sourceName === '' || $sourceUsername === '') {
        throw new RuntimeException('BPA database connection is not configured.');
    }

    $sourceDsn = sprintf(
        'mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4',
        $sourceHost,
        $sourcePort,
        $sourceName
    );
    $sourcePdo = new PDO($sourceDsn, $sourceUsername, $sourcePassword, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    $sourceUsers = $sourcePdo->query(
        'SELECT user_nama, user_email, password_hash, role, unit_id, status_acc FROM users'
    )->fetchAll();
    if ($sourceUsers === []) {
        throw new RuntimeException('The BPA users table is empty; no users were imported.');
    }

    $units = [
        '' => '',
        '1' => 'UAK',
        '2' => 'UPU',
        '3' => 'UPA',
        '4' => 'ULK',
    ];
    $roles = [
        '1' => 1,
        '2' => 2,
        '3' => 3,
        'admin' => 1,
        'editor' => 2,
        'staff' => 3,
    ];
    $usersToImport = [];
    $seenUsernames = [];
    foreach ($sourceUsers as $sourceUser) {
        $email = trim((string)$sourceUser['user_email']);
        $atPosition = strpos($email, '@');
        if ($atPosition === false || $atPosition === 0 || filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
            throw new RuntimeException('A BPA user has an invalid email address; no users were imported.');
        }
        $username = strtolower(substr($email, 0, $atPosition));
        if (!preg_match('/\A[a-z0-9._]{1,100}\z/', $username)) {
            throw new RuntimeException('A BPA email produces an invalid BAPIM username; no users were imported.');
        }
        if (isset($seenUsernames[$username])) {
            throw new RuntimeException('Two BPA emails produce the same BAPIM username; no users were imported.');
        }
        $seenUsernames[$username] = true;

        $roleKey = strtolower(trim((string)$sourceUser['role']));
        $unitKey = trim((string)($sourceUser['unit_id'] ?? ''));
        $statusKey = strtolower(trim((string)$sourceUser['status_acc']));
        $statuses = [
            '0' => 0,
            '1' => 1,
            'inactive' => 0,
            'active' => 1,
        ];
        if (!isset($roles[$roleKey], $units[$unitKey], $statuses[$statusKey])) {
            throw new RuntimeException('A BPA user has an unsupported role, unit, or status; no users were imported.');
        }

        $displayName = trim((string)$sourceUser['user_nama']);
        $passwordHash = (string)$sourceUser['password_hash'];
        if ($displayName === '' || strlen($displayName) > 160 || $passwordHash === '') {
            throw new RuntimeException('A BPA user is missing a required name or password hash; no users were imported.');
        }

        $usersToImport[] = [
            $username,
            $displayName,
            $email,
            $units[$unitKey],
            $passwordHash,
            $statuses[$statusKey],
            $roles[$roleKey],
        ];
    }

    $upsert = $pdo->prepare(
        'INSERT INTO users (username, display_name, email, unit, password_hash, active, access_level)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
            display_name = VALUES(display_name),
            email = VALUES(email),
            unit = VALUES(unit),
            password_hash = VALUES(password_hash),
            active = VALUES(active),
            access_level = VALUES(access_level)'
    );

    $pdo->beginTransaction();
    try {
        foreach ($usersToImport as $userToImport) {
            $upsert->execute($userToImport);
        }

        $pdo->commit();
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $error;
    }
};
