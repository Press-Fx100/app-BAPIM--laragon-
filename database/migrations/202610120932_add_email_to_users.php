<?php
declare(strict_types=1);

return static function (PDO $pdo, string $rootDirectory): void {
    $column = $pdo->query("SHOW COLUMNS FROM users LIKE 'email'")->fetch();
    if (!$column) {
        $pdo->exec("ALTER TABLE users ADD COLUMN email VARCHAR(254) NOT NULL DEFAULT '' AFTER unit");
    }
};
