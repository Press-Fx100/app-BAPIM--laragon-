<?php
// /bpa/admin/sku_export_pdf.php
require_once __DIR__ . '/../init.php';
require_bpa_page_access('bpaSku');

require_once __DIR__ . '/../vendor/autoload.php';

use Dompdf\Dompdf;
use Dompdf\Options;

date_default_timezone_set('Asia/Kuala_Lumpur');

/* ===============================
   INPUT FILTERS
=================================*/
$tahun = trim($_GET['tahun'] ?? date('Y'));
$scope = $_GET['scope_type'] ?? 'ALL'; // ALL / BPA / UNIT
$unitFilter = $_GET['unit_id'] ?? '';
$q = trim($_GET['q'] ?? '');

if (!ctype_digit((string)$tahun)) $tahun = date('Y');
if (!in_array($scope, ['ALL', 'BPA', 'UNIT'], true)) $scope = 'ALL';

$bulanSemasa = (int)date('n');

/* ===============================
   HELPERS
=================================*/
function e($s) {
    return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8');
}

function formatSasaranNombor($nilai) {
    if ($nilai === null) return '';
    $v = (float)$nilai;
    if (abs($v - round($v)) < 0.00001) return (string)intval(round($v));
    return rtrim(rtrim(number_format($v, 2, '.', ''), '0'), '.');
}

function formatPercent($v) {
    if ($v === null) return '-';
    if (abs($v - round($v)) < 0.00001) return (string)intval(round($v)) . '%';
    return rtrim(rtrim(number_format((float)$v, 2, '.', ''), '0'), '.') . '%';
}

function getSemasaNilai(array $r) {
    $jenis = $r['jenis_sasaran'] ?? 'BILANGAN';
    $cara  = $r['cara_kira_pencapaian'] ?? 'COUNT_PROGRAM';

    if ($jenis === 'PERATUS_BAJET') {
      if ($cara === 'MANUAL') {
          return ($r['manual_semasa_nilai'] === null ? null : (float)$r['manual_semasa_nilai']);
      }

      return (float)($r['semasa_sum_rm'] ?? 0);
  }

    if ($cara === 'SUM_PESERTA') return (float)($r['semasa_sum_peserta'] ?? 0);
    if ($cara === 'SUM_PESERTA_10K') return (float)($r['semasa_sum_peserta_10k'] ?? 0);
    if ($cara === 'SUM_PESERTA_ZAKAT') return (float)($r['semasa_sum_peserta_zakat'] ?? 0);
    if ($cara === 'SUM_RM') return (float)($r['semasa_sum_rm'] ?? 0);
    if ($cara === 'MANUAL') return ($r['manual_semasa_nilai'] === null ? null : (float)$r['manual_semasa_nilai']);

    return (float)($r['semasa_count_program'] ?? 0);
}

function kiraPeratusSemasa(array $r) {
    $jenis = $r['jenis_sasaran'] ?? 'BILANGAN';

    $semasa = getSemasaNilai($r);
    if ($semasa === null) return null;

    if ($jenis === 'PERATUS_BAJET') {
      $targetRm = ($r['sasaran_rm'] !== null) ? (float)$r['sasaran_rm'] : 0;
      $semasaRm = $semasa;

      if ($targetRm <= 0) {
          return null;
      }

      return ($semasaRm / $targetRm) * 100;
  }

    $target = (float)($r['sasaran_nilai'] ?? 0);
    if ($target <= 0) return null;

    return ($semasa / $target) * 100;
}

/* ===============================
   QUERY
=================================*/
$sql = "
SELECT
  s.sku_aktiviti_id,
  s.tahun,
  s.scope_type,
  s.unit_id,
  u.nama_unit,
  s.bil,
  s.nama_aktiviti,
  s.peruntukan_paparan_rm,
  s.jenis_sasaran,
  s.cara_kira_pencapaian,
  s.sasaran_nilai,
  s.sasaran_unit,
  s.sasaran_rm,
  s.anggaran_akhir_tahun,
  s.manual_semasa_nilai,
  s.catatan,

  /* COUNT program selesai */
  (
    SELECT COUNT(*)
    FROM program p
    WHERE p.status = 'selesai'
      AND p.tahun = s.tahun
      AND (p.tarikh_mula IS NULL OR MONTH(p.tarikh_mula) <= :bulan)
      AND (
            (
              s.jenis_sasaran = 'PERATUS_BAJET'
              AND s.scope_type = 'BPA'
            )
            OR
            (
              s.jenis_sasaran = 'PERATUS_BAJET'
              AND s.scope_type = 'UNIT'
              AND p.unit_id = s.unit_id
            )
            OR
            (
              s.jenis_sasaran <> 'PERATUS_BAJET'
              AND p.sku_aktiviti_id = s.sku_aktiviti_id
            )
          )
  ) AS semasa_count_program,

  /* SUM bil_peserta program selesai
     - Unit biasa: guna program.bil_peserta
     - ULK (unit_id = 4): guna program_ulk_detail.jumlah_peserta_semasa
  */
  (
    SELECT COALESCE(SUM(
      CASE
        WHEN p.unit_id = 4 THEN COALESCE(ud.jumlah_peserta_semasa, 0)
        ELSE COALESCE(p.bil_peserta, 0)
      END
    ),0)
    FROM program p
    LEFT JOIN program_ulk_detail ud ON ud.program_id = p.program_id
    WHERE p.status = 'selesai'
      AND p.tahun = s.tahun
      AND (p.tarikh_mula IS NULL OR MONTH(p.tarikh_mula) <= :bulan)
      AND (
            (
              s.jenis_sasaran = 'PERATUS_BAJET'
              AND s.scope_type = 'BPA'
            )
            OR
            (
              s.jenis_sasaran = 'PERATUS_BAJET'
              AND s.scope_type = 'UNIT'
              AND p.unit_id = s.unit_id
            )
            OR
            (
              s.jenis_sasaran <> 'PERATUS_BAJET'
              AND p.sku_aktiviti_id = s.sku_aktiviti_id
            )
          )
  ) AS semasa_sum_peserta,

  /* SUM peserta pendapatan >= 10000 */
  (
    SELECT COALESCE(SUM(COALESCE(ud.jumlah_peserta_pendapatan_atas_10k,0)),0)
    FROM program p
    LEFT JOIN program_upu_detail ud ON ud.program_id = p.program_id
    WHERE p.status = 'selesai'
      AND p.tahun = s.tahun
      AND (p.tarikh_mula IS NULL OR MONTH(p.tarikh_mula) <= :bulan)
      AND p.sku_aktiviti_id = s.sku_aktiviti_id
  ) AS semasa_sum_peserta_10k,

  /* SUM peserta bayar zakat */
  (
    SELECT COALESCE(SUM(COALESCE(ud.jumlah_peserta_bayar_zakat,0)),0)
    FROM program p
    LEFT JOIN program_upu_detail ud ON ud.program_id = p.program_id
    WHERE p.status = 'selesai'
      AND p.tahun = s.tahun
      AND (p.tarikh_mula IS NULL OR MONTH(p.tarikh_mula) <= :bulan)
      AND p.sku_aktiviti_id = s.sku_aktiviti_id
  ) AS semasa_sum_peserta_zakat,

  /* SUM perbelanjaan program selesai */
  (
    SELECT COALESCE(SUM(COALESCE(p.perbelanjaan_rm,0)),0)
    FROM program p
    WHERE p.status = 'selesai'
      AND p.tahun = s.tahun
      AND (p.tarikh_mula IS NULL OR MONTH(p.tarikh_mula) <= :bulan)
      AND (
            (
              s.jenis_sasaran = 'PERATUS_BAJET'
              AND s.scope_type = 'BPA'
            )
            OR
            (
              s.jenis_sasaran = 'PERATUS_BAJET'
              AND s.scope_type = 'UNIT'
              AND p.unit_id = s.unit_id
            )
            OR
            (
              s.jenis_sasaran <> 'PERATUS_BAJET'
              AND p.sku_aktiviti_id = s.sku_aktiviti_id
            )
          )
  ) AS semasa_sum_rm

FROM sku_aktiviti s
LEFT JOIN unit u ON u.unit_id = s.unit_id
WHERE s.tahun = :tahun
";

$params = [
    ':tahun' => (int)$tahun,
    ':bulan' => $bulanSemasa
];

if ($scope === 'BPA') {
    $sql .= " AND s.scope_type = 'BPA' ";
} elseif ($scope === 'UNIT') {
    $sql .= " AND s.scope_type = 'UNIT' ";
    if ($unitFilter !== '' && ctype_digit((string)$unitFilter)) {
        $sql .= " AND s.unit_id = :unit_id ";
        $params[':unit_id'] = (int)$unitFilter;
    }
}

if ($q !== '') {
    $sql .= " AND s.nama_aktiviti LIKE :q ";
    $params[':q'] = "%$q%";
}

$sql .= " ORDER BY s.scope_type ASC, s.bil ASC ";

$stmt = $pdo->prepare($sql);
$stmt->execute($params);
$rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

/* ===============================
   BUILD HTML FOR PDF
=================================*/
$title = "Laporan SKU ({$tahun})";
$sub   = "Kiraan semasa hingga bulan {$bulanSemasa} (status program: selesai)";

$html = '
<!DOCTYPE html>
<html lang="ms">
<head>
<meta charset="UTF-8">
<style>
  body {
    font-family: DejaVu Sans, sans-serif;
    font-size: 10px;
  }
  h1 {
    font-size: 14px;
    margin: 0 0 6px 0;
  }
  .sub {
    color: #555;
    margin-bottom: 10px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }
  th, td {
    border: 1px solid #000;
    padding: 6px;
    vertical-align: top;
    word-wrap: break-word;
  }
  th {
    background: #e9a47f;
    text-align: center;
    font-weight: bold;
  }
  .right { text-align: right; }
  .center { text-align: center; }
  .muted { color:#666; font-size: 9px; margin-top: 2px; }
</style>
</head>
<body>
  <h1>' . e($title) . '</h1>
  <div class="sub">' . e($sub) . '</div>

  <table>
    <thead>
      <tr>
        <th style="width:4%;">BIL</th>
        <th style="width:30%;">AKTIVITI</th>
        <th style="width:10%;">PERUNTUKAN (RM)</th>
        <th style="width:12%;">SASARAN</th>
        <th style="width:12%;">PENCAPAIAN (%)</th>
        <th style="width:12%;">JUMLAH</th>
        <th style="width:20%;">CATATAN</th>
      </tr>
    </thead>
    <tbody>
';

if (!$rows) {
    $html .= '<tr><td colspan="7" class="center">Tiada data SKU.</td></tr>';
} else {
    foreach ($rows as $r) {
        $semasa = getSemasaNilai($r);
        $peratus = kiraPeratusSemasa($r);

        $sasaranNilaiTxt = formatSasaranNombor($r['sasaran_nilai']);
        $sasaranUnitTxt  = trim((string)($r['sasaran_unit'] ?? ''));
        $sasaranTxt      = trim($sasaranNilaiTxt . ($sasaranUnitTxt ? " {$sasaranUnitTxt}" : ''));

        $cara = $r['cara_kira_pencapaian'] ?? 'COUNT_PROGRAM';
        $jenis = $r['jenis_sasaran'] ?? '';
        $jumlahPaparan = '-';

        if ($jenis === 'PERATUS_BAJET') {
          $val = getSemasaNilai($r);
          $jumlahPaparan = ($val === null)
              ? '-'
              : 'RM ' . number_format((float)$val, 2);

      } elseif ($cara === 'SUM_RM') {
        } elseif ($cara === 'SUM_RM') {
            $jumlahPaparan = 'RM ' . number_format((float)($r['semasa_sum_rm'] ?? 0), 2);
        } elseif ($cara === 'SUM_PESERTA') {
            $jumlahPaparan = (string)intval((float)($r['semasa_sum_peserta'] ?? 0));
        } elseif ($cara === 'SUM_PESERTA_10K') {
            $jumlahPaparan = (string)intval((float)($r['semasa_sum_peserta_10k'] ?? 0));
        } elseif ($cara === 'SUM_PESERTA_ZAKAT') {
            $jumlahPaparan = (string)intval((float)($r['semasa_sum_peserta_zakat'] ?? 0));
        } elseif ($cara === 'COUNT_PROGRAM') {
            $jumlahPaparan = (string)intval((float)($r['semasa_count_program'] ?? 0));
        } elseif ($cara === 'MANUAL') {
            $jumlahPaparan = ($semasa === null) ? '-' : formatSasaranNombor($semasa);
        }

        $aktivitiExtra = 'Scope: ' . ($r['scope_type'] ?? '-');
        if (($r['scope_type'] ?? '') === 'UNIT') {
            $aktivitiExtra .= ' | Unit: ' . ($r['nama_unit'] ?? '-');
        }
        $aktivitiExtra .= ' | Kiraan: ' . ($r['cara_kira_pencapaian'] ?? 'COUNT_PROGRAM');

        $peruntukan = ($r['peruntukan_paparan_rm'] !== null)
            ? number_format((float)$r['peruntukan_paparan_rm'], 2)
            : '-';

        $pencapaian = ($peratus === null) ? '-' : formatPercent($peratus);

        $html .= '<tr>';
        $html .= '<td class="center"><b>' . (int)$r['bil'] . '</b></td>';
        $html .= '<td>' . nl2br(e($r['nama_aktiviti'] ?? '')) . '<div class="muted">' . e($aktivitiExtra) . '</div></td>';
        $html .= '<td class="right">' . $peruntukan . '</td>';
        $html .= '<td class="center">' . e($sasaranTxt) . '</td>';
        $html .= '<td class="center">' . e($pencapaian) . '</td>';
        $html .= '<td class="center">' . e($jumlahPaparan) . '</td>';
        $html .= '<td>' . e($r['catatan'] ?? '') . '</td>';
        $html .= '</tr>';
    }
}

$html .= '
    </tbody>
  </table>
</body>
</html>
';

/* ===============================
   GENERATE PDF
=================================*/
$options = new Options();
$options->set('isRemoteEnabled', true);
$options->set('defaultFont', 'DejaVu Sans');

$dompdf = new Dompdf($options);
$dompdf->loadHtml($html, 'UTF-8');
$dompdf->setPaper('A4', 'landscape');
$dompdf->render();

$filename = "SKU_{$tahun}_" . date('Ymd_His') . ".pdf";
$dompdf->stream($filename, ["Attachment" => true]);
exit;