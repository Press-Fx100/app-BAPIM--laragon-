<?php

function importBpaProgramBigData2022To2025(PDO $pdo): array
{
    $migrationName = '20261124_import_program_big_data_2022_2025';
    $csvPath = __DIR__ . '/program_big_data_2022_2025.csv';

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
        return ['skipped' => true, 'inserted' => 0, 'duplicates' => 0];
    }

    if (!is_readable($csvPath)) {
        throw new RuntimeException('BPA program import CSV is not readable: ' . $csvPath);
    }

    $stream = fopen($csvPath, 'rb');
    if ($stream === false) {
        throw new RuntimeException('BPA program import CSV could not be opened.');
    }

    $header = fgetcsv($stream);
    if ($header === false) {
        fclose($stream);
        throw new RuntimeException('BPA program import CSV is empty.');
    }

    $expectedHeader = [
        'unit_id',
        'tahun',
        'nama_program',
        'kerjasama_konsultan',
        'bil_peserta',
        'perbelanjaan_rm',
        'peruntukan_rm',
        'catatan',
        'status',
        'sku_aktiviti_id',
    ];
    if ($header !== $expectedHeader) {
        fclose($stream);
        throw new RuntimeException('BPA program import CSV header is invalid.');
    }

    $exists = $pdo->prepare(
        'SELECT 1
         FROM program
         WHERE unit_id = ?
           AND tahun = ?
           AND LOWER(TRIM(nama_program)) = LOWER(TRIM(?))
         LIMIT 1'
    );
    $insert = $pdo->prepare(
        'INSERT INTO program (
            unit_id,
            sku_aktiviti_id,
            tahun,
            nama_program,
            nk_jkb,
            tarikh_mula,
            tarikh_tamat,
            tempoh_kontrak,
            tempat,
            kerjasama_konsultan,
            peruntukan_rm,
            perbelanjaan_rm,
            dana_wakalah_rm,
            status,
            catatan,
            bil_peserta
        ) VALUES (
            ?, NULL, ?, ?, NULL, NULL, NULL, NULL, NULL, ?, ?, ?, 0.00, ?, ?, ?
        )'
    );

    $inserted = 0;
    $duplicates = [];
    $pdo->beginTransaction();

    try {
        while (($row = fgetcsv($stream)) !== false) {
            if (count($row) !== count($expectedHeader) || trim((string)$row[0]) === '') {
                continue;
            }

            [$unitId, $year, $name, $collaboration, $participants, $spending, $allocation, $notes] = $row;
            $unitId = (int)$unitId;
            $year = (int)$year;
            $name = trim((string)$name);
            $participants = max(0, (int)round((float)$participants));
            $spending = max(0.0, (float)$spending);
            $allocation = max(0.0, (float)$allocation);
            $collaboration = trim((string)$collaboration);
            $notes = trim((string)$notes);

            $exists->execute([$unitId, $year, $name]);
            if ($exists->fetchColumn()) {
                $duplicates[] = $unitId . '|' . $year . '|' . $name;
                continue;
            }

            $insert->execute([
                $unitId,
                $year,
                $name,
                $collaboration !== '' ? $collaboration : null,
                $allocation,
                $spending,
                'selesai',
                $notes !== '' ? $notes : null,
                $participants,
            ]);
            $inserted++;
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
    return [
        'skipped' => false,
        'inserted' => $inserted,
        'duplicates' => count($duplicates),
        'duplicate_names' => $duplicates,
    ];
}
