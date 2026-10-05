<?php
declare(strict_types=1);

const BAPIM_GITHUB_REPOSITORY = 'Press-Fx100/app-BAPIM--laragon-';
const BAPIM_INITIAL_COMMIT = '42996cd03d1daba0c7cc3e7aa6aa9c21cd8ccca7';
const BAPIM_UPDATE_MAX_ARCHIVE_BYTES = 40 * 1024 * 1024;
const BAPIM_UPDATE_MAX_EXTRACTED_BYTES = 200 * 1024 * 1024;
const BAPIM_UPDATE_MAX_FILES = 20000;

function bapimGitHubRequest(string $url, bool $download = false): array
{
    if (!extension_loaded('curl')) {
        throw new RuntimeException('PHP cURL is required to check GitHub updates.');
    }

    $token = getenv('BAPIM_GITHUB_TOKEN');
    $headers = [
        'Accept: application/vnd.github+json',
        'Cache-Control: no-cache',
        'Pragma: no-cache',
        'X-GitHub-Api-Version: 2022-11-28',
    ];
    if ($token !== false && $token !== '') {
        $headers[] = 'Authorization: Bearer ' . $token;
    }

    $handle = curl_init($url);
    if ($handle === false) {
        throw new RuntimeException('Could not initialize the GitHub connection.');
    }

    $file = null;
    $options = [
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT => $download ? 90 : 25,
        CURLOPT_USERAGENT => 'BAPIM-App-Updater',
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2,
    ];

    if ($download) {
        $temporaryPath = @tempnam(sys_get_temp_dir(), 'bapim-update-');
        if ($temporaryPath === false) {
            curl_close($handle);
            throw new RuntimeException('Could not create a temporary update archive.');
        }
        $file = @fopen($temporaryPath, 'wb');
        if ($file === false) {
            @unlink($temporaryPath);
            curl_close($handle);
            throw new RuntimeException('Could not open a temporary update archive.');
        }

        $downloadedBytes = 0;
        $options[CURLOPT_WRITEFUNCTION] = static function ($curl, string $chunk) use ($file, &$downloadedBytes): int {
            $length = strlen($chunk);
            $downloadedBytes += $length;
            if ($downloadedBytes > BAPIM_UPDATE_MAX_ARCHIVE_BYTES) {
                return 0;
            }
            $written = @fwrite($file, $chunk);
            return $written === false ? 0 : $written;
        };
    } else {
        $options[CURLOPT_RETURNTRANSFER] = true;
    }

    curl_setopt_array($handle, $options);
    $result = curl_exec($handle);
    $status = (int)curl_getinfo($handle, CURLINFO_RESPONSE_CODE);
    $curlError = curl_error($handle);
    curl_close($handle);
    if (is_resource($file)) {
        fclose($file);
    }

    if ($result === false || ($download && $curlError !== '')) {
        if ($download && isset($temporaryPath) && is_file($temporaryPath)) {
            @unlink($temporaryPath);
        }
        throw new RuntimeException($download && str_contains($curlError, 'write')
            ? 'The GitHub update archive is larger than the 40 MB download limit.'
            : 'Could not contact GitHub: ' . ($curlError !== '' ? $curlError : 'connection failed.'));
    }

    if ($status !== 200) {
        if ($download && isset($temporaryPath) && is_file($temporaryPath)) {
            @unlink($temporaryPath);
        }
        $message = match ($status) {
            401, 403 => 'GitHub denied access. Check repository visibility or BAPIM_GITHUB_TOKEN.',
            404 => 'The GitHub repository or requested update was not found.',
            429 => 'GitHub rate limit reached. Try again later.',
            default => 'GitHub returned HTTP ' . $status . '.',
        };
        throw new RuntimeException($message);
    }

    if ($download) {
        if (!is_file($temporaryPath) || @filesize($temporaryPath) < 4) {
            if (is_file($temporaryPath)) {
                @unlink($temporaryPath);
            }
            throw new RuntimeException('GitHub returned an empty update archive.');
        }
        $signature = @file_get_contents($temporaryPath, false, null, 0, 2);
        if ($signature !== "PK") {
            @unlink($temporaryPath);
            throw new RuntimeException('GitHub did not return a valid ZIP archive.');
        }
        return ['status' => $status, 'path' => $temporaryPath];
    }

    if (!is_string($result)) {
        throw new RuntimeException('GitHub returned an invalid response.');
    }
    if (strlen($result) > 2 * 1024 * 1024) {
        throw new RuntimeException('GitHub returned an unexpectedly large API response.');
    }
    return ['status' => $status, 'body' => $result];
}

function bapimLatestGitHubCommit(): array
{
    $response = bapimGitHubRequest(
        'https://api.github.com/repos/' . BAPIM_GITHUB_REPOSITORY . '/git/ref/heads/main?bapim_update_check=' . bin2hex(random_bytes(8))
    );
    try {
        $commit = json_decode($response['body'], true, 512, JSON_THROW_ON_ERROR);
    } catch (JsonException $error) {
        throw new RuntimeException('GitHub returned invalid commit information.', 0, $error);
    }

    $sha = $commit['object']['sha'] ?? '';
    if (($commit['object']['type'] ?? '') !== 'commit' || !is_string($sha) || !preg_match('/^[a-f0-9]{40}$/i', $sha)) {
        throw new RuntimeException('GitHub response did not contain a valid commit SHA.');
    }

    return [
        'sha' => strtolower($sha),
    ];
}

function bapimInstalledCommit(string $storageDirectory): string
{
    $statePath = $storageDirectory . '/.app-update-state.json';
    if (is_file($statePath)) {
        $contents = @file_get_contents($statePath);
        if ($contents === false) {
            throw new RuntimeException('Could not read the installed app version.');
        }
        try {
            $state = json_decode($contents, true, 512, JSON_THROW_ON_ERROR);
        } catch (JsonException $error) {
            throw new RuntimeException('Installed app version data is invalid.', 0, $error);
        }
        $sha = $state['commit'] ?? '';
        if (!is_string($sha) || !preg_match('/^[a-f0-9]{40}$/i', $sha)) {
            throw new RuntimeException('Installed app version data is invalid.');
        }
        return strtolower($sha);
    }

    return BAPIM_INITIAL_COMMIT;
}

function bapimRunTar(array $arguments): array
{
    $systemRoot = getenv('SystemRoot') ?: 'C:\\Windows';
    $tarPath = $systemRoot . '\\System32\\tar.exe';
    if (!is_file($tarPath)) {
        throw new RuntimeException('Windows tar.exe is required to extract updates. Enable PHP ZipArchive or install Windows tar.');
    }

    $process = proc_open(
        array_merge([$tarPath], $arguments),
        [
            0 => ['pipe', 'r'],
            1 => ['pipe', 'w'],
            2 => ['pipe', 'w'],
        ],
        $pipes,
        null,
        null,
        ['bypass_shell' => true]
    );
    if (!is_resource($process)) {
        throw new RuntimeException('Could not start the Windows ZIP extractor.');
    }

    fclose($pipes[0]);
    $stdout = stream_get_contents($pipes[1]);
    $stderr = stream_get_contents($pipes[2]);
    fclose($pipes[1]);
    fclose($pipes[2]);
    $status = proc_close($process);
    if ($status !== 0) {
        throw new RuntimeException('Could not inspect or extract the GitHub ZIP: ' . trim((string)$stderr));
    }

    return ['stdout' => (string)$stdout, 'stderr' => (string)$stderr];
}

function bapimValidateZipListing(string $listing, string $verboseListing): array
{
    $entries = preg_split('/\r?\n/', trim($listing));
    if (!is_array($entries) || $entries === [] || count($entries) > BAPIM_UPDATE_MAX_FILES) {
        throw new RuntimeException('The update ZIP is empty or contains too many files.');
    }

    $prefix = '';
    $paths = [];
    $normalizedPaths = [];
    foreach ($entries as $entry) {
        if ($entry === '' || str_contains($entry, '\\') || str_contains($entry, ':')
            || str_contains($entry, '//') || preg_match('/[\x00-\x1f\x7f]/', $entry)) {
            throw new RuntimeException('The update ZIP contains an unsafe file path.');
        }
        $parts = explode('/', rtrim($entry, '/'));
        $isRootEntry = count($parts) === 1 && str_ends_with($entry, '/');
        if ((!$isRootEntry && count($parts) < 2) || $parts[0] === '' || in_array('.', $parts, true) || in_array('..', $parts, true)) {
            throw new RuntimeException('The update ZIP contains an unsafe file path.');
        }
        foreach ($parts as $part) {
            if ($part === '' || preg_match('/[<>:"|?*]/', $part) || preg_match('/[ .]$/', $part)
                || preg_match('/^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\\..*)?$/i', $part)) {
                throw new RuntimeException('The update ZIP contains a file name that is not safe on Windows.');
            }
        }
        if (!preg_match('/^app-BAPIM--laragon--(?:main|[a-f0-9]{7,40})$/i', $parts[0])) {
            throw new RuntimeException('The update ZIP does not belong to the configured GitHub repository.');
        }
        if ($prefix === '') {
            $prefix = $parts[0];
        } elseif ($prefix !== $parts[0]) {
            throw new RuntimeException('The update ZIP contains unexpected top-level folders.');
        }
        $normalizedPath = strtolower(implode('/', $parts));
        if (isset($normalizedPaths[$normalizedPath])) {
            throw new RuntimeException('The update ZIP contains duplicate Windows file paths.');
        }
        $normalizedPaths[$normalizedPath] = true;
        if ($isRootEntry) {
            $paths[] = $entry;
            continue;
        }
        $paths[] = $entry;
    }

    $verboseEntries = preg_split('/\r?\n/', trim($verboseListing));
    $totalSize = 0;
    if (!is_array($verboseEntries) || count($verboseEntries) !== count($paths)) {
        throw new RuntimeException('The update ZIP file listing could not be verified.');
    }
    foreach ($verboseEntries as $entry) {
        if (!preg_match('/^([bcdlps-])/', $entry, $type) || !in_array($type[1], ['-', 'd'], true)) {
            throw new RuntimeException('The update ZIP contains a link or unsupported file type.');
        }
        if (!preg_match('/^\S+\s+\d+\s+\S+\s+\S+\s+(\d+)\s/', $entry, $size)) {
            throw new RuntimeException('The update ZIP file sizes could not be verified.');
        }
        $totalSize += (int)$size[1];
        if ($totalSize > BAPIM_UPDATE_MAX_EXTRACTED_BYTES) {
            throw new RuntimeException('The extracted update would exceed the 200 MB limit.');
        }
    }

    return ['prefix' => $prefix, 'paths' => $paths];
}

function bapimExtractUpdate(string $archivePath, string $workDirectory): string
{
    $listing = bapimRunTar(['-tf', $archivePath]);
    $verbose = bapimRunTar(['-tvf', $archivePath]);
    $verified = bapimValidateZipListing($listing['stdout'], $verbose['stdout']);

    $extractDirectory = $workDirectory . '/extracted';
    if (!@mkdir($extractDirectory, 0770, true) && !is_dir($extractDirectory)) {
        throw new RuntimeException('Could not create the update staging directory.');
    }
    bapimRunTar(['-xf', $archivePath, '-C', $extractDirectory]);
    $sourceDirectory = $extractDirectory . '/' . $verified['prefix'];
    foreach (['index.php', '.htaccess', 'database.sql', 'views/dashboard.html', 'public/css/style.css'] as $required) {
        if (!is_file($sourceDirectory . '/' . $required)) {
            throw new RuntimeException('The update ZIP is missing a required app file: ' . $required);
        }
    }

    $extractedFiles = 0;
    $extractedBytes = 0;
    $iterator = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($sourceDirectory, FilesystemIterator::SKIP_DOTS),
        RecursiveIteratorIterator::LEAVES_ONLY
    );
    foreach ($iterator as $file) {
        if ($file->isLink() || !$file->isFile()) {
            throw new RuntimeException('The extracted update contains an unsupported file type.');
        }
        $extractedFiles++;
        $extractedBytes += $file->getSize();
        if ($extractedFiles > BAPIM_UPDATE_MAX_FILES || $extractedBytes > BAPIM_UPDATE_MAX_EXTRACTED_BYTES) {
            throw new RuntimeException('The extracted update exceeds the allowed size or file count.');
        }
    }

    return $sourceDirectory;
}

function bapimRemoveTree(string $path): void
{
    if (!file_exists($path) && !is_link($path)) {
        return;
    }
    if (is_link($path) || is_file($path)) {
        if (!@unlink($path)) {
            throw new RuntimeException('Could not remove temporary update file: ' . $path);
        }
        return;
    }

    foreach (new FilesystemIterator($path, FilesystemIterator::SKIP_DOTS) as $entry) {
        bapimRemoveTree($entry->getPathname());
    }
    if (!@rmdir($path)) {
        throw new RuntimeException('Could not remove temporary update directory: ' . $path);
    }
}

function bapimApplyDatabaseMigrations(PDO $pdo, string $sourceDirectory, string $rootDirectory): array
{
    $migrationDirectory = $sourceDirectory . '/database/migrations';
    if (!is_dir($migrationDirectory)) {
        return [];
    }

    $files = [];
    foreach (new FilesystemIterator($migrationDirectory, FilesystemIterator::SKIP_DOTS) as $file) {
        if ($file->isLink() || !$file->isFile() ||
            !preg_match('/^\d{8,14}_[a-z0-9][a-z0-9_-]*\.php$/', $file->getFilename())) {
            throw new RuntimeException('The update contains an invalid database migration file.');
        }
        $files[] = $file->getPathname();
    }
    sort($files, SORT_STRING);

    if ($files === []) {
        return [];
    }

    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS app_schema_migrations (
            migration_id VARCHAR(190) NOT NULL,
            applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (migration_id)
        ) ENGINE=InnoDB'
    );

    $appliedStatement = $pdo->query('SELECT migration_id FROM app_schema_migrations');
    $applied = array_fill_keys($appliedStatement->fetchAll(PDO::FETCH_COLUMN), true);
    $recordStatement = $pdo->prepare(
        'INSERT INTO app_schema_migrations (migration_id) VALUES (?)'
    );
    $completed = [];

    foreach ($files as $filePath) {
        $migrationId = basename($filePath);
        if (isset($applied[$migrationId])) {
            continue;
        }

        $migration = require $filePath;
        if (!is_callable($migration)) {
            throw new RuntimeException('Database migration must return a callable: ' . $migrationId);
        }

        $migration($pdo, $rootDirectory);
        $recordStatement->execute([$migrationId]);
        $completed[] = $migrationId;
    }

    return $completed;
}

function bapimApplyGitHubUpdate(string $rootDirectory, string $storageDirectory, string $expectedCommit, PDO $pdo): array
{
    if (!preg_match('/^[a-f0-9]{40}$/i', $expectedCommit)) {
        throw new RuntimeException('The requested update version is invalid.');
    }
    $lockPath = $storageDirectory . '/.app-update.lock';
    $lock = @fopen($lockPath, 'x');
    if ($lock === false) {
        throw new RuntimeException('An app update is already in progress.');
    }

    $workDirectory = $storageDirectory . '/.app-update-' . bin2hex(random_bytes(8));
    $backupDirectory = $workDirectory . '/backup';
    $changes = [];
    $newDirectories = [];
    $statePath = $storageDirectory . '/.app-update-state.json';
    $stateBackup = $workDirectory . '/previous-state.json';
    $stateWasBackedUp = false;
    $stateWasWritten = false;

    try {
        if (!@mkdir($workDirectory, 0770, true)) {
            throw new RuntimeException('Could not create a private update workspace.');
        }
        $latest = bapimLatestGitHubCommit();
        if (!hash_equals($latest['sha'], strtolower($expectedCommit))) {
            throw new RuntimeException('A newer GitHub update appeared during the check. Check for updates again.');
        }
        if (hash_equals(bapimInstalledCommit($storageDirectory), $latest['sha'])) {
            throw new RuntimeException('The app is already up to date.');
        }

        $archiveUrl = 'https://codeload.github.com/' . BAPIM_GITHUB_REPOSITORY . '/zip/' . $latest['sha'];
        $archive = bapimGitHubRequest($archiveUrl, true);
        try {
            $sourceDirectory = bapimExtractUpdate($archive['path'], $workDirectory);
        } finally {
            if (is_file($archive['path']) && !@unlink($archive['path'])) {
                throw new RuntimeException('Could not remove the temporary GitHub archive.');
            }
        }

        $iterator = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($sourceDirectory, FilesystemIterator::SKIP_DOTS),
            RecursiveIteratorIterator::LEAVES_ONLY
        );
        foreach ($iterator as $sourceFile) {
            $relativePath = substr($sourceFile->getPathname(), strlen($sourceDirectory) + 1);
            $relativePath = str_replace(DIRECTORY_SEPARATOR, '/', $relativePath);
            $firstSegment = explode('/', $relativePath, 2)[0];
            if (in_array(strtolower($firstSegment), ['data', 'config', '.git'], true)) {
                continue;
            }
            if ($sourceFile->isLink() || !$sourceFile->isFile()) {
                throw new RuntimeException('The update contains an unsupported file.');
            }

            $destination = $rootDirectory . '/' . $relativePath;
            $destinationDirectory = dirname($destination);
            $missingDirectories = [];
            for ($directory = $destinationDirectory; $directory !== $rootDirectory && !is_dir($directory); $directory = dirname($directory)) {
                $missingDirectories[] = $directory;
            }
            foreach (array_reverse($missingDirectories) as $directory) {
                if (file_exists($directory) && !is_dir($directory)) {
                    throw new RuntimeException('An app file conflicts with a required directory: ' . $directory);
                }
                if (!is_dir($directory) && !@mkdir($directory, 0770) && !is_dir($directory)) {
                    throw new RuntimeException('Could not create app directory: ' . $directory);
                }
                $newDirectories[] = $directory;
            }

            $temporaryPath = $destination . '.update-' . bin2hex(random_bytes(6));
            if (!@copy($sourceFile->getPathname(), $temporaryPath)) {
                throw new RuntimeException('Could not stage app file: ' . $relativePath);
            }
            $backupPath = $backupDirectory . '/' . $relativePath;
            if (is_file($destination)) {
                $backupParent = dirname($backupPath);
                if (!is_dir($backupParent) && !@mkdir($backupParent, 0770, true) && !is_dir($backupParent)) {
                    @unlink($temporaryPath);
                    throw new RuntimeException('Could not create an app rollback copy.');
                }
                if (!@rename($destination, $backupPath)) {
                    @unlink($temporaryPath);
                    throw new RuntimeException('Could not prepare an app file for replacement: ' . $relativePath);
                }
            }

            $changes[] = [
                'destination' => $destination,
                'backup' => is_file($backupPath) ? $backupPath : null,
                'temporary' => $temporaryPath,
            ];
            if (!@rename($temporaryPath, $destination)) {
                throw new RuntimeException('Could not install app file: ' . $relativePath);
            }
        }

        $databaseMigrations = bapimApplyDatabaseMigrations($pdo, $sourceDirectory, $rootDirectory);

        if (is_file($statePath)) {
            if (!@copy($statePath, $stateBackup)) {
                throw new RuntimeException('Could not preserve the installed version marker.');
            }
            $stateWasBackedUp = true;
        }
        $stateTemporary = $statePath . '.tmp-' . bin2hex(random_bytes(6));
        $stateContents = json_encode(
            ['commit' => $latest['sha'], 'updatedAt' => gmdate('c')],
            JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR
        );
        if (@file_put_contents($stateTemporary, $stateContents . PHP_EOL, LOCK_EX) === false) {
            throw new RuntimeException('Could not save the installed app version.');
        }
        if ($stateWasBackedUp && !@unlink($statePath)) {
            @unlink($stateTemporary);
            throw new RuntimeException('Could not replace the installed version marker.');
        }
        if (!@rename($stateTemporary, $statePath)) {
            if ($stateWasBackedUp) {
                @copy($stateBackup, $statePath);
            }
            throw new RuntimeException('Could not save the installed app version.');
        }
        $stateWasWritten = true;

        try {
            bapimRemoveTree($workDirectory);
        } catch (Throwable $cleanupError) {
            error_log('App update succeeded but temporary backups could not be removed: ' . $cleanupError->getMessage());
        }
        return ['commit' => $latest['sha'], 'databaseMigrations' => $databaseMigrations];
    } catch (Throwable $error) {
        $rollbackErrors = [];
        if ($stateWasWritten) {
            if (is_file($statePath) && !@unlink($statePath)) {
                $rollbackErrors[] = 'could not remove the new version marker';
            }
        }
        if ($stateWasBackedUp && is_file($stateBackup)) {
            if (!@copy($stateBackup, $statePath)) {
                $rollbackErrors[] = 'could not restore the previous version marker';
            }
        }
        foreach (array_reverse($changes) as $change) {
            if (is_file($change['destination']) && !@unlink($change['destination'])) {
                $rollbackErrors[] = 'could not remove a partially installed file';
            }
            if ($change['backup'] !== null && is_file($change['backup'])) {
                if (!@rename($change['backup'], $change['destination'])) {
                    $rollbackErrors[] = 'could not restore a previous app file';
                }
            }
            if (is_file($change['temporary'])) {
                if (!@unlink($change['temporary'])) {
                    $rollbackErrors[] = 'could not remove a staged app file';
                }
            }
        }
        foreach (array_reverse($newDirectories) as $directory) {
            if (is_dir($directory)) {
                if (!@rmdir($directory)) {
                    $rollbackErrors[] = 'could not remove an empty app directory';
                }
            }
        }
        if (is_dir($workDirectory)) {
            try {
                bapimRemoveTree($workDirectory);
            } catch (Throwable $cleanupError) {
                error_log('App updater cleanup failed: ' . $cleanupError->getMessage());
            }
        }
        if ($rollbackErrors !== []) {
            $details = implode('; ', array_unique($rollbackErrors));
            error_log('App update rollback was incomplete: ' . $details);
            throw new RuntimeException('The update failed and automatic rollback was incomplete. Check the PHP error log and restore the app backup.', 0, $error);
        }
        throw $error;
    } finally {
        fclose($lock);
        if (is_file($lockPath) && !@unlink($lockPath)) {
            error_log('Could not remove app update lock: ' . $lockPath);
        }
    }
}
