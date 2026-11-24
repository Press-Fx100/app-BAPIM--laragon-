<?php

function correctExcludedBpaProgramBigData2022To2025(PDO $pdo): array
{
    $migrationName = '20261124_correct_excluded_program_big_data_2022_2025';
    $csvPath = __DIR__ . '/restore_red_program_big_data_2022_2025.csv';

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
        return ['skipped' => true, 'restored' => 0];
    }

    $stream = fopen($csvPath, 'rb');
    if ($stream === false) {
        throw new RuntimeException('Red-program correction CSV could not be opened.');
    }

    $header = fgetcsv($stream);
    $expected = [
        'unit_id','tahun','nama_program','kerjasama_konsultan','bil_peserta',
        'perbelanjaan_rm','peruntukan_rm','catatan','status','sku_aktiviti_id'
    ];
    if ($header !== $expected) {
        fclose($stream);
        throw new RuntimeException('Red-program correction CSV header is invalid.');
    }

    $exists = $pdo->prepare(
        'SELECT 1 FROM program
         WHERE unit_id = ? AND tahun = ?
           AND LOWER(TRIM(nama_program)) = LOWER(TRIM(?)) LIMIT 1'
    );
    $insert = $pdo->prepare(
        'INSERT INTO program (
            unit_id, sku_aktiviti_id, tahun, nama_program, nk_jkb,
            tarikh_mula, tarikh_tamat, tempoh_kontrak, tempat,
            kerjasama_konsultan, peruntukan_rm, perbelanjaan_rm,
            dana_wakalah_rm, status, catatan, bil_peserta
        ) VALUES (
            ?, NULL, ?, ?, NULL, NULL, NULL, NULL, NULL,
            ?, ?, ?, 0.00, ?, ?, ?
        )'
    );

    $restored = 0;
    $pdo->beginTransaction();
    try {
        while (($row = fgetcsv($stream)) !== false) {
            if (count($row) !== count($expected)) continue;
            [$unitId, $year, $name, $collaboration, $participants, $spending, $allocation, $notes] = $row;
            $exists->execute([(int)$unitId, (int)$year, trim((string)$name)]);
            if ($exists->fetchColumn()) continue;
            $insert->execute([
                (int)$unitId,
                (int)$year,
                trim((string)$name),
                trim((string)$collaboration) !== '' ? trim((string)$collaboration) : null,
                max(0.0, (float)$allocation),
                max(0.0, (float)$spending),
                'selesai',
                trim((string)$notes) !== '' ? trim((string)$notes) : null,
                max(0, (int)round((float)$participants)),
            ]);
            $restored++;
        }
        $markerInsert = $pdo->prepare(
            'INSERT INTO app_schema_migrations (migration_name) VALUES (?)'
        );
        $markerInsert->execute([$migrationName]);
        $pdo->commit();
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        fclose($stream);
        throw $error;
    }

    fclose($stream);
    return ['skipped' => false, 'restored' => $restored];
}
