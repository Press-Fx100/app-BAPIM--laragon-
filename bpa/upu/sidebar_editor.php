<?php
// bpa/editor/sidebar.php
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

$name = htmlspecialchars($_SESSION['user']['user_nama'] ?? 'Editor');
?>

<style>
  .bpa-topbar {
    background: rgba(255,255,255,0.96) !important;
    backdrop-filter: blur(8px);
    box-shadow: 0 8px 24px rgba(15,23,42,0.08);
    border-bottom: 1px solid rgba(17,24,39,0.08);
    height: 72px;
  }
  .bpa-topbar .navbar-brand {
    color: #1e2d48 !important;
    font-weight: 700;
  }
  .bpa-topbar .navbar-toggler {
    border-color: rgba(30,45,72,0.15);
    background: #f3f6ff;
  }
  .bpa-topbar .navbar-toggler-icon {
    filter: invert(0.2);
  }
  .side-menu-shell {
    position: fixed;
    top: 72px;
    left: 0;
    bottom: 0;
    width: 250px;
    background: #171b24;
    color: #fff;
    box-shadow: 18px 0 30px rgba(15,23,42,0.18);
    overflow-y: auto;
    z-index: 999;
  }
  .side-menu-shell .nav-link {
    border-radius: 8px;
    padding: 0.7rem 0.9rem;
    color: #dfe6f5 !important;
  }
  .side-menu-shell .nav-link:hover,
  .side-menu-shell .nav-link.active {
    background: rgba(255,255,255,0.06);
    color: #fff !important;
  }
  .side-menu-shell .sidebar-section {
    color: #7d88a1;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    padding: 1rem 0.9rem 0.5rem;
  }
</style>

<nav class="navbar navbar-dark bpa-topbar fixed-top">
  <div class="container-fluid">
    <button class="navbar-toggler" type="button" data-bs-toggle="offcanvas" data-bs-target="#sideMenu" aria-label="Open sidebar">
      <span class="navbar-toggler-icon"></span>
    </button>
    <a class="navbar-brand ms-auto d-flex align-items-center" href="#">
      <img src="/bpa/gambar/logo_maiwp.jpeg" alt="Logo" style="width:35px;height:35px;border-radius:50%;object-fit:cover;margin-right:10px;box-shadow:0 5px 16px rgba(79,109,245,0.18);">
      Hi! <?= $name ?>
    </a>
  </div>
</nav>

<div class="side-menu-shell offcanvas offcanvas-start text-bg-dark" tabindex="-1" id="sideMenu">

  <div class="offcanvas-header">
    <h5 class="offcanvas-title">Menu Editor</h5>
    <button type="button"
            class="btn-close btn-close-white"
            data-bs-dismiss="offcanvas"></button>
  </div>

  <div class="offcanvas-body">
    <ul class="navbar-nav">

      <!-- Dashboard -->
      <li class="nav-item mb-2">
        <a class="nav-link text-white"
           href="/bpa/upu/dashboard.php">
           🏠 Home
        </a>
      </li>

      <!-- SKU -->
      <li class="nav-item mb-2">
        <a class="nav-link text-white"
           data-bs-toggle="collapse"
           href="#skuMenu">
           🎯 SKU
        </a>
        <div class="collapse ps-3" id="skuMenu">
          <a class="nav-link text-white"
             href="/bpa/admin/sku_list.php">
             SKU
          </a>
        </div>
      </li>
<!-- LAPORAN -->
<li class="nav-item mb-2">
    <a class="nav-link text-white"
       data-bs-toggle="collapse"
       href="#laporanMenu">
        📊 Laporan
    </a>

    <div class="collapse ps-3" id="laporanMenu">

        <a class="nav-link text-white"
           href="/bpa/laporan/program_list.php">
            Program
        </a>

    </div>
</li>

      <!-- UPU -->
      <li class="nav-item mb-2">
        <a class="nav-link text-white"
           data-bs-toggle="collapse"
           href="#upuMenu">
          💼 Unit Pembangunan Usahawan (UPU)
        </a>
        <div class="collapse ps-3" id="upuMenu">
          <a class="nav-link text-white"
             href="/bpa/upu/program_list.php?unit=UPU">
             Program
          </a>
        </div>
      </li>

      <!-- LOGOUT -->
      <li class="nav-item mb-2">
      <a class="nav-link text-white"
           href="/bpa/logout.php">
           🚪 Log Keluar
        </a>
      </li>

    </ul>
  </div>
</div>
