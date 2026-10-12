<?php
declare(strict_types=1);

return static function (PDO $pdo, string $rootDirectory): void {
    $column = $pdo->query("SHOW COLUMNS FROM users LIKE 'PICname'")->fetch();
    if ($column) {
        $pdo->exec('ALTER TABLE users DROP COLUMN PICname');
    }
};
