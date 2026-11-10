<?php
// bpa/admin/sidebar.php
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

$name = htmlspecialchars($_SESSION['user']['user_nama'] ?? 'Admin');
?>

<!-- Navbar atas -->
<nav class="navbar navbar-dark bg-dark fixed-top">
  <div class="container-fluid">
    <!-- icon ☰ -->
    <button class="navbar-toggler" type="button"
            data-bs-toggle="offcanvas"
            data-bs-target="#sideMenu">
      <span class="navbar-toggler-icon"></span>
    </button>

    <a class="navbar-brand ms-auto d-flex align-items-center" href="#">
      <img src="/bpa/gambar/logo_maiwp.jpeg" alt="Logo"
        style="width:35px;height:35px;border-radius:50%;object-fit:cover;margin-right:10px;">
      Hi! <?= $name ?>
    </a>
  </div>
</nav>

<!-- Sidebar -->
<div class="offcanvas offcanvas-start text-bg-dark"
     tabindex="-1"
     id="sideMenu">

  <div class="offcanvas-header">
    <h5 class="offcanvas-title">Menu Admin</h5>
    <button type="button"
            class="btn-close btn-close-white"
            data-bs-dismiss="offcanvas"></button>
  </div>

  <div class="offcanvas-body">
    <ul class="navbar-nav">

      <!-- Dashboard -->
      <li class="nav-item mb-2">
        <a class="nav-link text-white"
           href="/bpa/admin/dashboard_admin.php">
           🏠 Home
        </a>
      </li>

      <!-- USER -->
      <li class="nav-item mb-2">
        <a class="nav-link text-white"
           data-bs-toggle="collapse"
           href="#userMenu">
          👤 User
        </a>
        <div class="collapse ps-3" id="userMenu">
          <a class="nav-link text-white"
             href="/bpa/admin/user_add.php">
             Tambah User
          </a>
        </div>
      </li>

      <!-- BAJET -->
      <li class="nav-item mb-2">
        <a class="nav-link text-white"
           data-bs-toggle="collapse"
           href="#bajetMenu">
           💰 Bajet
        </a>
        <div class="collapse ps-3" id="bajetMenu">
          <a class="nav-link text-white"
             href="/bpa/admin/bajet_add.php">
             Tambah Bajet
          </a>
          <a class="nav-link text-white"
             href="/bpa/admin/bajet_list.php">
             Bajet
          </a>
        </div>
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
             href="/bpa/admin/sku_add.php">
             Tambah SKU
          </a>
          <a class="nav-link text-white"
             href="/bpa/admin/sku_list.php">
             SKU
          </a>
        </div>
      </li>

      <hr class="text-white">

      <!-- UPK -->
      <li class="nav-item mb-2">
        <a class="nav-link text-white"
           data-bs-toggle="collapse"
           href="#uakMenu">
          🕌 Unit Akademik & Kerohanian (UAK)
        </a>
        <div class="collapse ps-3" id="uakMenu">
          <a class="nav-link text-white"
             href="/bpa/uak/dashboard.php">
             Dashboard UPK
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
             href="/bpa/upu/dashboard.php">
             Dashboard UPU
          </a>
        </div>
      </li>

      <!-- UPA -->
      <li class="nav-item mb-2">
        <a class="nav-link text-white"
           data-bs-toggle="collapse"
           href="#upaMenu">
          🌱 Unit Pengurusan Agro (UPA)
        </a>
        <div class="collapse ps-3" id="upaMenu">
          <a class="nav-link text-white"
             href="/bpa/upa/dashboard.php">
             Dashboard UPA
          </a>
        </div>
      </li>

      <!-- ULK -->
      <li class="nav-item mb-2">
        <a class="nav-link text-white"
           data-bs-toggle="collapse"
           href="#ulkMenu">
          🎓 Unit Latihan & Kerjaya (ULK)
        </a>
        <div class="collapse ps-3" id="ulkMenu">
          <a class="nav-link text-white"
             href="/bpa/ulk/dashboard.php">
             Dashboard ULK
          </a>
        </div>
      </li>

      <hr class="text-white">

      <!-- SETTING -->
      <li class="nav-item mb-2">
        <a class="nav-link text-white"
           data-bs-toggle="collapse"
           href="#settingMenu">
           ⚙️ Setting
        </a>
        <div class="collapse ps-3" id="settingMenu">
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
