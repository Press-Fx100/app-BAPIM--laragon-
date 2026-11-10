<?php
declare(strict_types=1);

return static function (PDO $pdo, string $rootDirectory): void {
    $csvDirectory = realpath($rootDirectory . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'csv');
    if ($csvDirectory === false) {
        throw new RuntimeException('Could not find the private CSV storage directory for the migration.');
    }

    $statement = $pdo->query(
        "SELECT id, filepath FROM datasets WHERE dataset_type = 'penerima' ORDER BY id"
    );
    $stagedFiles = [];

    try {
        foreach ($statement->fetchAll(PDO::FETCH_ASSOC) as $dataset) {
            $path = realpath((string)$dataset['filepath']);
            $allowedPrefix = rtrim($csvDirectory, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR;
            if ($path === false || !str_starts_with(strtolower($path), strtolower($allowedPrefix)) || !is_file($path)) {
                throw new RuntimeException(
                    'Could not safely access the CSV file for recipient dataset ' . (int)$dataset['id'] . '.'
                );
            }

            $input = fopen($path, 'rb');
            if ($input === false) {
                throw new RuntimeException('Could not read a recipient dataset CSV file.');
            }

            $rows = [];
            while (($row = fgetcsv($input, null, ',', '"', '')) !== false) {
                $row = array_map(static fn($value): string => (string)($value ?? ''), $row);
                if (array_filter($row, static fn($value): bool => trim($value) !== '') !== []) {
                    $rows[] = $row;
                }
            }
            fclose($input);

            if ($rows === []) {
                continue;
            }
            $rows[0][0] = preg_replace('/^\xEF\xBB\xBF/', '', $rows[0][0]) ?? $rows[0][0];
            $headers = array_map(static fn($value): string => strtoupper(trim($value)), $rows[0]);
            if (in_array('STATUS PEKERJAAN', $headers, true)) {
                continue;
            }

            $statusIndex = array_search('STATUS', $headers, true);
            $insertIndex = $statusIndex === false ? count($headers) : $statusIndex + 1;
            $repairExistingBlankHeader = $statusIndex !== false
                && isset($rows[0][$insertIndex])
                && trim($rows[0][$insertIndex]) === '';
            $width = max(array_map('count', $rows));
            foreach ($rows as $rowIndex => &$row) {
                $row = array_pad($row, $width, '');
                if ($repairExistingBlankHeader) {
                    if ($rowIndex === 0) {
                        $row[$insertIndex] = 'STATUS PEKERJAAN';
                    }
                } else {
                    array_splice(
                        $row,
                        $insertIndex,
                        0,
                        [$rowIndex === 0 ? 'STATUS PEKERJAAN' : '']
                    );
                }
            }
            unset($row);

            $temporaryPath = $path . '.migration-' . bin2hex(random_bytes(8));
            $output = fopen($temporaryPath, 'wb');
            if ($output === false) {
                throw new RuntimeException('Could not stage the recipient dataset migration.');
            }
            foreach ($rows as $row) {
                if (fputcsv($output, $row, ',', '"', '', "\r\n") === false) {
                    fclose($output);
                    throw new RuntimeException('Could not write a migrated recipient dataset CSV file.');
                }
            }
            if (!fclose($output)) {
                throw new RuntimeException('Could not finish writing a migrated recipient dataset CSV file.');
            }

            $permissions = fileperms($path);
            if ($permissions !== false) {
                @chmod($temporaryPath, $permissions & 0777);
            }
            $stagedFiles[] = [
                'id' => (int)$dataset['id'],
                'path' => $path,
                'temporary' => $temporaryPath,
                'backup' => $path . '.migration-backup-' . bin2hex(random_bytes(8)),
                'columnCount' => count($rows[0]),
                'fileSize' => filesize($temporaryPath),
                'backedUp' => false,
                'installed' => false,
            ];
        }

        if ($stagedFiles === []) {
            return;
        }

        $pdo->beginTransaction();
        foreach ($stagedFiles as &$file) {
            if (!rename($file['path'], $file['backup'])) {
                throw new RuntimeException('Could not prepare the original recipient dataset for migration.');
            }
            $file['backedUp'] = true;
            if (!rename($file['temporary'], $file['path'])) {
                throw new RuntimeException('Could not install the migrated recipient dataset CSV file.');
            }
            $file['installed'] = true;
        }
        unset($file);

        $update = $pdo->prepare(
            "UPDATE datasets
             SET column_count = ?, file_size = ?, version = version + 1,
                 updated_at = NOW(), sync_status = 'modified'
             WHERE id = ?"
        );
        foreach ($stagedFiles as $file) {
            if ($file['fileSize'] === false) {
                throw new RuntimeException('Could not determine the migrated CSV file size.');
            }
            $update->execute([$file['columnCount'], $file['fileSize'], $file['id']]);
        }
        $pdo->commit();
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        $restoreFailures = [];
        foreach (array_reverse($stagedFiles) as $file) {
            if ($file['backedUp'] && is_file($file['backup'])) {
                if (is_file($file['path']) && !unlink($file['path'])) {
                    $restoreFailures[] = $file['path'];
                } elseif (!rename($file['backup'], $file['path'])) {
                    $restoreFailures[] = $file['path'];
                }
            }
        }
        foreach ($stagedFiles as $file) {
            if (is_file($file['temporary'])) {
                @unlink($file['temporary']);
            }
        }
        if ($restoreFailures !== []) {
            throw new RuntimeException(
                'Recipient dataset migration failed and could not restore: ' . implode(', ', $restoreFailures),
                0,
                $error
            );
        }
        throw $error;
    }

    foreach ($stagedFiles as $file) {
        if (is_file($file['backup']) && !@unlink($file['backup'])) {
            error_log('Could not remove migration backup: ' . $file['backup']);
        }
    }
};
