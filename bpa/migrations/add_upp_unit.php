<?php

function addBpaUppUnit(PDO $pdo): bool
{
    $migrationName = '20261125_add_upp_unit';

    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS app_schema_migrations (
            migration_name VARCHAR(255) NOT NULL PRIMARY KEY,
            applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB"
    );

    $marker = $pdo->prepare(
        'SELECT 1 FROM app_schema_migrations WHERE migration_name = ? LIMIT 1'
    );
    $marker->execute([$migrationName]);
    if ($marker->fetchColumn()) {
        return false;
    }

    $pdo->beginTransaction();
    try {
        $exists = $pdo->query(
            "SELECT 1 FROM unit WHERE UPPER(TRIM(nama_unit)) = 'UPP' LIMIT 1"
        )->fetchColumn();
        $inserted = !$exists;

        if ($inserted) {
            $pdo->prepare(
                'INSERT INTO unit (nama_unit, keterangan) VALUES (?, ?)'
            )->execute(['UPP', 'Unit Pentadbiran dan Pemantauan']);
        }

        $pdo->prepare(
            'INSERT INTO app_schema_migrations (migration_name) VALUES (?)'
        )->execute([$migrationName]);
        $pdo->commit();

        return $inserted;
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $error;
    }
}
