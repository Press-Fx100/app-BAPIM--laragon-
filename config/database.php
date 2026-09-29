<?php
declare(strict_types=1);

$config = [
    'host' => getenv('BAPIM_DB_HOST') ?: '127.0.0.1',
    'port' => getenv('BAPIM_DB_PORT') ?: '3306',
    'database' => getenv('BAPIM_DB_NAME') ?: 'bapim',
    'username' => getenv('BAPIM_DB_USER') ?: 'root',
    'password' => getenv('BAPIM_DB_PASSWORD') ?: '',
];

$localConfigPath = __DIR__ . '/database.local.php';
if (is_file($localConfigPath)) {
    $localConfig = require $localConfigPath;
    if (!is_array($localConfig)) {
        throw new RuntimeException('config/database.local.php must return an array.');
    }
    $config = array_replace($config, $localConfig);
}

return $config;
