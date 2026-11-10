<?php
// /bpa/admin/dashboard_admin_export_pdf.php
require_once __DIR__ . '/../init.php';
require_admin();

$tahun = $_GET['tahun'] ?? date('Y');
if (!ctype_digit((string)$tahun)) $tahun = date('Y');
$tahun = (int)$tahun;
$bulanSemasa = (int)date('n');

function e($s){ return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8'); }
function fmtNice($n){
  if ($n === null) return '-';
  $n = (float)$n;
  if (abs($n - round($n)) < 0.00001) return (string)intval(round($n));
  return rtrim(rtrim(number_format($n, 2, '.', ''), '0'), '.');
}

// =====================
// KPI & SUMMARY
// =====================

// Total program
$stmt = $pdo->prepare("SELECT COUNT(*) FROM program WHERE tahun=?");
$stmt->execute([$tahun]);
$totalProgram = (int)$stmt->fetchColumn();

// Total peruntukan rasmi (bajet)
$stmt = $pdo->prepare("SELECT COALESCE(SUM(jumlah_peruntukan_rm),0) FROM bajet WHERE tahun=?");
$stmt->execute([$tahun]);
$totalPeruntukan = (float)$stmt->fetchColumn();

// Total belanja PERUNTUKAN sahaja
$stmt = $pdo->prepare("
  SELECT COALESCE(SUM(perbelanjaan_rm),0) AS total_belanja
  FROM program
  WHERE tahun=?
");
$stmt->execute([$tahun]);
$totalBelanja = (float)$stmt->fetchColumn();

// Total dana wakalah sahaja
$stmt = $pdo->prepare("
  SELECT COALESCE(SUM(dana_wakalah_rm),0) AS total_wakalah
  FROM program
  WHERE tahun=?
");
$stmt->execute([$tahun]);
$totalWakalah = (float)$stmt->fetchColumn();

// Baki bajet = peruntukan - belanja peruntukan sahaja
$totalBaki = $totalPeruntukan - $totalBelanja;

// % penggunaan bajet = belanja peruntukan / peruntukan
$percentBajet = ($totalPeruntukan > 0) ? ($totalBelanja / $totalPeruntukan * 100) : 0;
$pctDecimals = ($percentBajet > 0 && $percentBajet < 1) ? 3 : 1;
$pctDisplay  = number_format($percentBajet, $pctDecimals);

// Status program
$statusRows = $pdo->prepare("
  SELECT status, COUNT(*) AS total
  FROM program
  WHERE tahun = :tahun
  GROUP BY status
");
$statusRows->execute([':tahun'=>$tahun]);
$statusData = $statusRows->fetchAll(PDO::FETCH_KEY_PAIR);

$draft   = (int)($statusData['draft'] ?? 0);
$aktif   = (int)($statusData['aktif'] ?? 0);
$selesai = (int)($statusData['selesai'] ?? 0);
$batal   = (int)($statusData['batal'] ?? 0);

// Ringkasan unit
$unitRows = $pdo->prepare("
  SELECT u.nama_unit, COUNT(p.program_id) AS total_program,
         COALESCE(SUM(p.perbelanjaan_rm),0) AS belanja_rm,
         COALESCE(SUM(p.dana_wakalah_rm),0) AS wakalah_rm
  FROM unit u
  LEFT JOIN program p
    ON p.unit_id = u.unit_id
   AND p.tahun = :tahun
  GROUP BY u.unit_id, u.nama_unit
  ORDER BY u.unit_id ASC
");
$unitRows->execute([':tahun'=>$tahun]);
$unitRows = $unitRows->fetchAll(PDO::FETCH_ASSOC);

// =====================
// SKU SECTION (PDF)
// =====================
$units = $pdo->query("SELECT unit_id, nama_unit FROM unit ORDER BY unit_id ASC")->fetchAll(PDO::FETCH_ASSOC);

// SKU BPA
$stmt = $pdo->prepare("
  SELECT sku_aktiviti_id, bil, nama_aktiviti, jenis_sasaran, sasaran_nilai, sasaran_unit,
         sasaran_rm, scope_type, unit_id, cara_kira_pencapaian, manual_semasa_nilai
  FROM sku_aktiviti
  WHERE tahun = :tahun AND scope_type='BPA'
  ORDER BY bil ASC
");
$stmt->execute([':tahun'=>$tahun]);
$skuBPA = $stmt->fetchAll(PDO::FETCH_ASSOC);

// SKU UNIT
$stmt = $pdo->prepare("
  SELECT sku_aktiviti_id, unit_id, bil, nama_aktiviti, jenis_sasaran, sasaran_nilai, sasaran_unit,
         sasaran_rm, scope_type, cara_kira_pencapaian, manual_semasa_nilai
  FROM sku_aktiviti
  WHERE tahun = :tahun AND scope_type='UNIT'
  ORDER BY unit_id ASC, bil ASC
");
$stmt->execute([':tahun'=>$tahun]);
$skuUNITraw = $stmt->fetchAll(PDO::FETCH_ASSOC);

$skuUNIT = [];
foreach ($skuUNITraw as $r) {
  $uid = (int)$r['unit_id'];
  if (!isset($skuUNIT[$uid])) $skuUNIT[$uid] = [];
  $skuUNIT[$uid][] = $r;
}

// kira progress SKU (mirror sku_list.php)
function calcSkuProgress(PDO $pdo, array $sku, int $tahun, ?int $unitIdFilter, int $bulanSemasa){
  $skuId = (int)$sku['sku_aktiviti_id'];
  $jenis = $sku['jenis_sasaran'] ?? 'BILANGAN';
  $cara  = $sku['cara_kira_pencapaian'] ?? 'COUNT_PROGRAM';
  $scope = $sku['scope_type'] ?? 'ALL';
  $sasaranNilai = (float)($sku['sasaran_nilai'] ?? 0);

  $semasa = 0;
  $pct = 0;

  if ($jenis === 'PERATUS_BAJET') {
    // ikut logic sku_list:
    // BPA = semua program selesai bahagian
    // UNIT = semua program selesai unit itu
    if ($scope === 'BPA') {
      $stmt = $pdo->prepare("
        SELECT COALESCE(SUM(COALESCE(p.perbelanjaan_rm,0)),0)
        FROM program p
        WHERE p.status = 'selesai'
          AND p.tahun = :tahun
          AND (p.tarikh_mula IS NULL OR MONTH(p.tarikh_mula) <= :bulan)
      ");
      $stmt->execute([
        ':tahun' => $tahun,
        ':bulan' => $bulanSemasa
      ]);
    } else {
      $stmt = $pdo->prepare("
        SELECT COALESCE(SUM(COALESCE(p.perbelanjaan_rm,0)),0)
        FROM program p
        WHERE p.status = 'selesai'
          AND p.tahun = :tahun
          AND p.unit_id = :unit_id
          AND (p.tarikh_mula IS NULL OR MONTH(p.tarikh_mula) <= :bulan)
      ");
      $stmt->execute([
        ':tahun' => $tahun,
        ':unit_id' => $unitIdFilter,
        ':bulan' => $bulanSemasa
      ]);
    }

    $semasa = (float)$stmt->fetchColumn();

    $targetRm = ($sku['sasaran_rm'] !== null) ? (float)$sku['sasaran_rm'] : 0;
    if ($targetRm > 0) {
      $pct = ($semasa / $targetRm) * 100;
    } else {
      $pct = 0;
    }

  } else {
    if ($cara === 'SUM_PESERTA') {
      $params = [
        ':tahun' => $tahun,
        ':sku_id' => $skuId,
        ':bulan' => $bulanSemasa
      ];
      $whereUnit = '';

      if ($unitIdFilter !== null) {
        $whereUnit = " AND p.unit_id = :unit_id ";
        $params[':unit_id'] = $unitIdFilter;
      }

      $stmt = $pdo->prepare("
        SELECT COALESCE(SUM(
          CASE
            WHEN p.unit_id = 4 THEN COALESCE(ud.jumlah_peserta_semasa, 0)
            ELSE COALESCE(p.bil_peserta, 0)
          END
        ),0)
        FROM program p
        LEFT JOIN program_ulk_detail ud ON ud.program_id = p.program_id
        WHERE p.status = 'selesai'
          AND p.tahun = :tahun
          AND p.sku_aktiviti_id = :sku_id
          AND (p.tarikh_mula IS NULL OR MONTH(p.tarikh_mula) <= :bulan)
          $whereUnit
      ");
      $stmt->execute($params);
      $semasa = (float)$stmt->fetchColumn();

    } elseif ($cara === 'SUM_RM') {
      $params = [
        ':tahun' => $tahun,
        ':sku_id' => $skuId,
        ':bulan' => $bulanSemasa
      ];
      $whereUnit = '';

      if ($unitIdFilter !== null) {
        $whereUnit = " AND p.unit_id = :unit_id ";
        $params[':unit_id'] = $unitIdFilter;
      }

      $stmt = $pdo->prepare("
        SELECT COALESCE(SUM(COALESCE(p.perbelanjaan_rm,0)),0)
        FROM program p
        WHERE p.status = 'selesai'
          AND p.tahun = :tahun
          AND p.sku_aktiviti_id = :sku_id
          AND (p.tarikh_mula IS NULL OR MONTH(p.tarikh_mula) <= :bulan)
          $whereUnit
      ");
      $stmt->execute($params);
      $semasa = (float)$stmt->fetchColumn();

    } elseif ($cara === 'MANUAL') {
      $semasa = ($sku['manual_semasa_nilai'] === null) ? null : (float)$sku['manual_semasa_nilai'];

    } else {
      // default COUNT_PROGRAM
      $params = [
        ':tahun' => $tahun,
        ':sku_id' => $skuId,
        ':bulan' => $bulanSemasa
      ];
      $whereUnit = '';

      if ($unitIdFilter !== null) {
        $whereUnit = " AND p.unit_id = :unit_id ";
        $params[':unit_id'] = $unitIdFilter;
      }

      $stmt = $pdo->prepare("
        SELECT COUNT(*)
        FROM program p
        WHERE p.status = 'selesai'
          AND p.tahun = :tahun
          AND p.sku_aktiviti_id = :sku_id
          AND (p.tarikh_mula IS NULL OR MONTH(p.tarikh_mula) <= :bulan)
          $whereUnit
      ");
      $stmt->execute($params);
      $semasa = (float)$stmt->fetchColumn();
    }

    if ($semasa === null) {
      $pct = 0;
    } else {
      $pct = ($sasaranNilai > 0) ? (($semasa / $sasaranNilai) * 100) : 0;
    }
  }

  if ($pct < 0) $pct = 0;
  if ($pct > 150) $pct = 150;
  return [$semasa, $pct];
}

$generatedAt = date('d/m/Y H:i');

// =====================
// HTML (DOMPDF)
// =====================
$html = '
<!doctype html>
<html lang="ms">
<head>
<meta charset="utf-8">
<style>
  @page { margin: 18px 18px 22px 18px; }
  body{ font-family: DejaVu Sans, sans-serif; font-size: 11px; color:#111; }
  .title{ font-size:16px; font-weight:700; margin:0 0 2px 0; }
  .muted{ color:#666; font-size:10px; margin:0 0 10px 0; }

  .section-title{ font-size:12px; font-weight:700; margin:12px 0 6px; }
  .card{ border:1px solid #ddd; border-radius:10px; padding:10px; margin-bottom:10px; }

  .kpi-table{ width:100%; border-collapse:separate; border-spacing:8px; table-layout:fixed; }
  .kpi-td{
    border:1px solid #ddd; border-radius:12px; padding:10px;
    vertical-align:top;
  }
  .kpi-label{ color:#444; font-size:10px; margin-bottom:6px; }
  .kpi-value{ font-size:13px; font-weight:700; }
  .kpi-sub{ font-size:10px; margin-top:4px; color:#444; }

  table.data{ width:100%; border-collapse:collapse; }
  table.data th, table.data td{ border:1px solid #ddd; padding:6px 7px; }
  table.data th{ background:#f2f2f2; text-align:left; }
  .right{ text-align:right; }
  .center{ text-align:center; }
  .small{ font-size:10px; color:#444; }

</style>
</head>
<body>

  <div class="title">Laporan Bahagian Pembangunan Asnaf - Tahun '.e($tahun).'</div>
  <div class="muted">Dijana: '.e($generatedAt).'</div>

  <table class="kpi-table">
    <tr>
      <td class="kpi-td">
        <div class="kpi-label">Total Peruntukan</div>
        <div class="kpi-value">RM '.number_format($totalPeruntukan,2).'</div>
      </td>
      <td class="kpi-td">
        <div class="kpi-label">Total Belanja</div>
        <div class="kpi-value">RM '.number_format($totalBelanja,2).'</div>
        <div class="kpi-sub">Dana Wakalah: RM '.number_format($totalWakalah,2).'</div>
      </td>
      <td class="kpi-td">
        <div class="kpi-label">Total Baki</div>
        <div class="kpi-value">RM '.number_format($totalBaki,2).'</div>
      </td>
      <td class="kpi-td">
        <div class="kpi-label">% Penggunaan Bajet</div>
        <div class="kpi-value">'.$pctDisplay.'%</div>
      </td>
      <td class="kpi-td">
        <div class="kpi-label">Total Program</div>
        <div class="kpi-value">'.(int)$totalProgram.'</div>
      </td>
    </tr>
  </table>

  <div class="card">
    <div class="section-title">Status Program</div>
    <table class="data">
      <thead>
        <tr>
          <th class="center">Draft</th>
          <th class="center">Aktif</th>
          <th class="center">Selesai</th>
          <th class="center">Batal</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td class="center">'.(int)$draft.'</td>
          <td class="center">'.(int)$aktif.'</td>
          <td class="center">'.(int)$selesai.'</td>
          <td class="center">'.(int)$batal.'</td>
        </tr>
      </tbody>
    </table>
  </div>

  <div class="card">
    <div class="section-title">Ringkasan Mengikut Unit</div>
    <table class="data">
      <thead>
        <tr>
          <th style="width:34%;">Unit</th>
          <th class="center" style="width:12%;">Bil Program</th>
          <th class="right" style="width:18%;">Belanja Bajet (RM)</th>
          <th class="right" style="width:18%;">Dana Wakalah (RM)</th>
          <th class="right" style="width:18%;">Jumlah Keseluruhan (RM)</th>
        </tr>
      </thead>
      <tbody>';

foreach($unitRows as $u){
  $belanja = (float)$u['belanja_rm'];
  $wakalah = (float)$u['wakalah_rm'];
  $jumlah  = $belanja + $wakalah;

  $html .= '
        <tr>
          <td>'.e($u['nama_unit']).'</td>
          <td class="center">'.(int)$u['total_program'].'</td>
          <td class="right">'.number_format($belanja,2).'</td>
          <td class="right">'.number_format($wakalah,2).'</td>
          <td class="right">'.number_format($jumlah,2).'</td>
        </tr>';
}

$html .= '
      </tbody>
    </table>
  </div>

  <div class="card">
    <div class="section-title">SKU BPA</div>';

if (!$skuBPA){
  $html .= '<div class="small">Tiada SKU BPA untuk tahun ini.</div>';
} else {
  $html .= '
    <table class="data">
      <thead>
        <tr>
          <th class="center" style="width:7%;">Bil</th>
          <th style="width:53%;">Aktiviti</th>
          <th class="center" style="width:15%;">Sasaran</th>
          <th class="center" style="width:15%;">Semasa</th>
          <th class="center" style="width:10%;">%</th>
        </tr>
      </thead>
      <tbody>';

  foreach($skuBPA as $s){
    [$semasa, $pct] = calcSkuProgress($pdo, $s, $tahun, null, $bulanSemasa);

    $sasaranTxt = fmtNice($s['sasaran_nilai']) . ' ' . e($s['sasaran_unit'] ?? '');
    $semasaTxt  = ($s['jenis_sasaran']==='PERATUS_BAJET')
                  ? ('RM '.number_format((float)$semasa,2))
                  : (fmtNice($semasa) . ' ' . e($s['sasaran_unit'] ?? ''));

    $html .= '
        <tr>
          <td class="center"><b>'.(int)$s['bil'].'</b></td>
          <td>'.e($s['nama_aktiviti']).'</td>
          <td class="center">'.$sasaranTxt.'</td>
          <td class="center">'.$semasaTxt.'</td>
          <td class="center">'.number_format((float)$pct,1).'%</td>
        </tr>';
  }

  $html .= '
      </tbody>
    </table>';
}

$html .= '
  </div>

  <div class="card">
    <div class="section-title">SKU UNIT</div>';

$adaAnyUnitSku = false;
foreach($units as $u){
  $uid = (int)$u['unit_id'];
  if (!empty($skuUNIT[$uid])) { $adaAnyUnitSku = true; break; }
}

if (!$adaAnyUnitSku){
  $html .= '<div class="small">Tiada SKU UNIT untuk tahun ini.</div>';
} else {

  foreach($units as $u){
    $uid = (int)$u['unit_id'];
    $uname = $u['nama_unit'];
    $list = $skuUNIT[$uid] ?? [];

    if (!$list) continue;

    $html .= '<div style="margin:8px 0 6px;"><b>Unit: '.e($uname).'</b></div>';
    $html .= '
      <table class="data" style="margin-bottom:10px;">
        <thead>
          <tr>
            <th class="center" style="width:7%;">Bil</th>
            <th style="width:53%;">Aktiviti</th>
            <th class="center" style="width:15%;">Sasaran</th>
            <th class="center" style="width:15%;">Semasa</th>
            <th class="center" style="width:10%;">%</th>
          </tr>
        </thead>
        <tbody>';

    foreach($list as $s){
      [$semasa, $pct] = calcSkuProgress($pdo, $s, $tahun, $uid, $bulanSemasa);

      $sasaranTxt = fmtNice($s['sasaran_nilai']) . ' ' . e($s['sasaran_unit'] ?? '');
      $semasaTxt  = ($s['jenis_sasaran']==='PERATUS_BAJET')
                    ? ('RM '.number_format((float)$semasa,2))
                    : (fmtNice($semasa) . ' ' . e($s['sasaran_unit'] ?? ''));

      $html .= '
          <tr>
            <td class="center"><b>'.(int)$s['bil'].'</b></td>
            <td>'.e($s['nama_aktiviti']).'</td>
            <td class="center">'.$sasaranTxt.'</td>
            <td class="center">'.$semasaTxt.'</td>
            <td class="center">'.number_format((float)$pct,1).'%</td>
          </tr>';
    }

    $html .= '
        </tbody>
      </table>';
  }
}

$html .= '
  </div>

</body>
</html>
';

// =====================
// Render PDF (DOMPDF)
// =====================
try {
  require_once __DIR__ . '/../vendor/autoload.php';

  $options = new Dompdf\Options();
  $options->set('isRemoteEnabled', true);
  $options->set('defaultFont', 'DejaVu Sans');

  $dompdf = new Dompdf\Dompdf($options);
  $dompdf->loadHtml($html, 'UTF-8');
  $dompdf->setPaper('A4', 'portrait');
  $dompdf->render();

  $filename = "dashboard_admin_{$tahun}.pdf";
  header('Content-Type: application/pdf');
  header('Content-Disposition: attachment; filename="'.$filename.'"');
  echo $dompdf->output();
  exit;

} catch (Throwable $e) {
  http_response_code(500);
  echo "Gagal export PDF: " . $e->getMessage();
  exit;
}