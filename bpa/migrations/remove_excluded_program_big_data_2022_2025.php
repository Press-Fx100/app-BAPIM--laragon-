<?php

function removeExcludedBpaProgramBigData2022To2025(PDO $pdo): array
{
    $migrationName = '20261124_remove_excluded_program_big_data_2022_2025';
    $csvPath = __DIR__ . '/excluded_program_big_data_2022_2025.csv';

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
        return ['skipped' => true, 'deleted' => 0];
    }

    if (!is_readable($csvPath)) {
        throw new RuntimeException('Excluded BPA program CSV is not readable: ' . $csvPath);
    }

    $stream = fopen($csvPath, 'rb');
    if ($stream === false) {
        throw new RuntimeException('Excluded BPA program CSV could not be opened.');
    }

    $header = fgetcsv($stream);
    if ($header !== ['unit_id', 'tahun', 'nama_program']) {
        fclose($stream);
        throw new RuntimeException('Excluded BPA program CSV header is invalid.');
    }

    $delete = $pdo->prepare(
        'DELETE FROM program
         WHERE unit_id = ?
           AND tahun = ?
           AND LOWER(TRIM(nama_program)) = LOWER(TRIM(?))'
    );
    $deleted = 0;

    $pdo->beginTransaction();
    try {
        while (($row = fgetcsv($stream)) !== false) {
            if (count($row) !== 3) {
                continue;
            }

            $delete->execute([(int)$row[0], (int)$row[1], trim((string)$row[2])]);
            $deleted += $delete->rowCount();
        }

        $recordMarker = $pdo->prepare(
            'INSERT INTO app_schema_migrations (migration_name) VALUES (?)'
        );
        $recordMarker->execute([$migrationName]);
        $pdo->commit();
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        fclose($stream);
        throw $error;
    }

    fclose($stream);
    return ['skipped' => false, 'deleted' => $deleted];
}
