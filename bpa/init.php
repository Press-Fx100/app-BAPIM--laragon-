<?php
if (!defined('BPA_RENDER_IN_APP_SHELL')) {
    define('BPA_RENDER_IN_APP_SHELL', false);
}

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

define('APP_ROOT', __DIR__);

if (!BPA_RENDER_IN_APP_SHELL) {
    function apply_bapim_theme(): void
    {
        echo '<style>
            :root {
                --app-font-family: Arial, Helvetica, sans-serif;
                --bg-main: #f5f7fb;
                --bg-card: #ffffff;
                --border-color: #e6e9ef;
                --text-primary: #202632;
                --text-secondary: #7b8494;
                --sidebar-bg: #171b24;
                --sidebar-hover: #232936;
                --sidebar-active: #2b3342;
                --primary: #4f6df5;
                --primary-soft: #eff3ff;
            }
            html, body {
                font-family: var(--app-font-family) !important;
                background: linear-gradient(180deg, #edf3ff 0%, var(--bg-main) 100%) !important;
                color: var(--text-primary) !important;
                min-height: 100vh !important;
                animation: fadeInPage 0.25s ease !important;
            }
            body {
                margin: 0 !important;
                padding-top: 72px !important;
                padding-left: 250px !important;
            }
            @media (max-width: 991.98px) {
                body {
                    padding-left: 0 !important;
                }
            }
            *, *::before, *::after { box-sizing: border-box !important; }
            a, button, input, select, textarea { font: inherit !important; }
            .container, .container-fluid, .card, .table, .panel, .form-control, .form-select, .btn, .badge, .status-badge, .label {
                border-radius: 12px !important;
            }
            .container, .container-fluid {
                max-width: calc(100% - 24px) !important;
            }
            .card, .table, .panel, .table-responsive, .form-control, .form-select, .input-group, .input-group-text {
                box-shadow: 0 8px 24px rgba(15, 23, 42, 0.04) !important;
                border: 1px solid var(--border-color) !important;
                background: var(--bg-card) !important;
            }
            .btn, .btn-primary, .btn-secondary, .btn-outline-dark, .btn-danger, .btn-success {
                font-size: 12px !important;
                font-weight: 600 !important;
                border-radius: 8px !important;
                transition: all 0.2s ease !important;
            }
            .btn-primary {
                background: var(--primary) !important;
                border-color: var(--primary) !important;
                box-shadow: 0 8px 18px rgba(79, 109, 245, 0.22) !important;
            }
            .btn-primary:hover, .btn-primary:focus {
                background: #3d5ae3 !important;
                border-color: #3d5ae3 !important;
            }
            .btn-outline-dark {
                color: #212935 !important;
                border-color: rgba(33, 41, 53, 0.2) !important;
                background: transparent !important;
            }
            .btn-outline-dark:hover {
                background: #eef2ff !important;
                border-color: var(--primary) !important;
                color: #1d2b4e !important;
            }
            .btn-danger {
                background: #dc3545 !important;
                border-color: #dc3545 !important;
            }
            .table thead th {
                background: var(--primary-soft) !important;
                color: #2a3142 !important;
                font-weight: 700 !important;
                letter-spacing: 0.02em !important;
            }
            .table td, .table th {
                vertical-align: middle !important;
                color: var(--text-primary) !important;
                border-color: #edf0f5 !important;
            }
            .badge, .status-badge, .label {
                border-radius: 999px !important;
                font-weight: 700 !important;
                letter-spacing: 0.01em !important;
            }
            .navbar-dark.bg-dark,
            .offcanvas.offcanvas-start.text-bg-dark,
            .bg-dark {
                background: var(--sidebar-bg) !important;
                color: white !important;
            }
            .navbar-brand, .nav-link, .offcanvas-title {
                color: white !important;
            }
            .form-label, label, .small-muted, .text-muted {
                color: var(--text-secondary) !important;
            }
            .kpi-card, .card-body, .card-header {
                border-radius: 16px !important;
            }
            .shadow, .shadow-sm {
                box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08) !important;
            }
            @keyframes fadeInPage {
                from { opacity: 0; transform: translateY(6px); }
                to { opacity: 1; transform: translateY(0); }
            }
        </style>';
    }
}

if (!BPA_RENDER_IN_APP_SHELL) {
    apply_bapim_theme();
}

require_once APP_ROOT . '/db_connect.php';
require_once APP_ROOT . '/auth.php';
if (!BPA_RENDER_IN_APP_SHELL) {
    apply_bapim_theme();
}

require_once APP_ROOT . '/db_connect.php'; // $pdo
require_once APP_ROOT . '/auth.php';
