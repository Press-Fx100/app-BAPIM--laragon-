CREATE DATABASE IF NOT EXISTS bapim
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;
USE bapim;

CREATE TABLE IF NOT EXISTS users (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    username VARCHAR(100) NOT NULL,
    display_name VARCHAR(160) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    active TINYINT(1) NOT NULL DEFAULT 1,
    PICname VARCHAR(160) NOT NULL DEFAULT '',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_users_username (username),
    KEY idx_users_active (active)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS login_history (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    username VARCHAR(100) NOT NULL,
    login_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_login_history_username (username),
    KEY idx_login_history_login_at (login_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS datasets (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,
    filename VARCHAR(255) NOT NULL,
    filepath VARCHAR(1024) NOT NULL,
    row_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
    column_count INT UNSIGNED NOT NULL DEFAULT 0,
    file_size BIGINT UNSIGNED NOT NULL DEFAULT 0,
    dataset_type VARCHAR(32) NOT NULL DEFAULT 'penerima',
    version INT UNSIGNED NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    remote_version VARCHAR(255) NULL,
    last_synced_at DATETIME NULL,
    sync_status VARCHAR(32) NOT NULL DEFAULT 'local',
    PRIMARY KEY (id),
    KEY idx_datasets_updated (updated_at),
    KEY idx_datasets_type (dataset_type)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS user_activity (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    username VARCHAR(160) NOT NULL,
    dataset_id BIGINT UNSIGNED NULL,
    dataset_name VARCHAR(255) NULL,
    action VARCHAR(64) NOT NULL,
    row_id VARCHAR(255) NULL,
    column_name VARCHAR(255) NULL,
    old_value TEXT NULL,
    new_value TEXT NULL,
    progress_change INT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_activity_created (created_at, id),
    KEY idx_activity_username (username),
    KEY idx_activity_dataset (dataset_id),
    KEY idx_activity_action (action)
) ENGINE=InnoDB;
