<?php
// bpa/editor/sidebar.php
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

$name = htmlspecialchars($_SESSION['user']['user_nama'] ?? 'Editor');
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
           href="/bpa/ulk/dashboard.php">
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
      <!-- ULK -->
      <li class="nav-item mb-2">
        <a class="nav-link text-white"
           data-bs-toggle="collapse"
           href="#ulkMenu">
          🎓 Unit Latihan & Kerjaya (ULK)
        </a>
        <div class="collapse ps-3" id="ulkMenu">
          <a class="nav-link text-white"
             href="/bpa/ulk/program_list.php?unit=ULK">
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
