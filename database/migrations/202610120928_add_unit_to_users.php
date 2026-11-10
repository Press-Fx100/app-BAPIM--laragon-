<?php
declare(strict_types=1);

return static function (PDO $pdo, string $rootDirectory): void {
    $column = $pdo->query("SHOW COLUMNS FROM users LIKE 'unit'")->fetch();
    if (!$column) {
        $pdo->exec("ALTER TABLE users ADD COLUMN unit VARCHAR(160) NOT NULL DEFAULT '' AFTER display_name");
    }
};
