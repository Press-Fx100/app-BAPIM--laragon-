<?php
// /bpa/admin/sku_export_excel.php
require_once __DIR__ . '/../init.php';
require_bpa_page_access('bpaSku');

// Pastikan composer vendor wujud
$autoload = __DIR__ . '/../vendor/autoload.php';
if (!file_exists($autoload)) {
  http_response_code(500);
  exit("Vendor autoload tidak dijumpai. Sila run: composer install");
}
require_once $autoload;

use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;
use PhpOffice\PhpSpreadsheet\Style\Alignment;
use PhpOffice\PhpSpreadsheet\Style\Fill;
use PhpOffice\PhpSpreadsheet\Style\Border;

function safeFilename($name){
  $name = preg_replace('/[^A-Za-z0-9_\- ]+/', '', $name);
  $name = trim(preg_replace('/\s+/', ' ', $name));
  return $name ?: 'export';
}

// helper: column index (1-based) -> Excel letters
function colLetter(int $col): string {
  $s = '';
  while ($col > 0) {
    $mod = ($col - 1) % 26;
    $s = chr(65 + $mod) . $s;
    $col = intdiv($col - 1, 26);
  }
  return $s;
}

// Helper: sasaran display
function formatSasaranNombor($nilai) {
  if ($nilai === null) return '';
  $v = (float)$nilai;
  if (abs($v - round($v)) < 0.00001) return (string)intval(round($v));
  return rtrim(rtrim(number_format($v, 2, '.', ''), '0'), '.');
}
function formatPercent($v) {
  if ($v === null) return '-';
  $v = (float)$v;
  if (abs($v - round($v)) < 0.00001) return (string)intval(round($v)) . '%';
  return rtrim(rtrim(number_format($v, 2, '.', ''), '0'), '.') . '%';
}

// ============ GET FILTER (sama macam sku_list.php) ============
$tahun = trim($_GET['tahun'] ?? date('Y'));
$scope = $_GET['scope_type'] ?? 'ALL';     // ALL / BPA / UNIT
$unitFilter = $_GET['unit_id'] ?? '';
$q = trim($_GET['q'] ?? '');

if (!ctype_digit($tahun)) $tahun = date('Y');
if (!in_array($scope, ['ALL','BPA','UNIT'], true)) $scope = 'ALL';

$bulanSemasa = (int)date('n'); // 1..12

// ============ QUERY (mirror sku_list.php) ============
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
  if ($unitFilter !== '' && ctype_digit($unitFilter)) {
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

// ============ helper semasa & peratus (ikut sku_list.php) ============
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

// ============ BUILD EXCEL ============
$spreadsheet = new Spreadsheet();
$sheet = $spreadsheet->getActiveSheet();
$sheet->setTitle('SKU');

$headers = [
  'BIL',
  'AKTIVITI',
  'SCOPE',
  'UNIT',
  'KIRAAN',
  'PERUNTUKAN (RM)',
  'SASARAN',
  'PENCAPAIAN (%)',
  'JUMLAH (Belanja/Asnaf/Program)',
  'CATATAN',
  'ANGGARAN SEHINGGA DISEMBER',
];

$rowNum = 1;
$colNum = 1;

// Header row
foreach ($headers as $h) {
  $cell = colLetter($colNum) . $rowNum;
  $sheet->setCellValue($cell, $h);
  $colNum++;
}

$lastCol = colLetter(count($headers));

// Style header
$sheet->getStyle("A1:{$lastCol}1")->applyFromArray([
  'font' => ['bold' => true],
  'alignment' => ['horizontal' => Alignment::HORIZONTAL_CENTER, 'vertical' => Alignment::VERTICAL_CENTER, 'wrapText' => true],
  'fill' => [
    'fillType' => Fill::FILL_SOLID,
    'startColor' => ['rgb' => 'E9A47F']
  ],
  'borders' => [
    'allBorders' => ['borderStyle' => Border::BORDER_THIN]
  ]
]);
$sheet->getRowDimension(1)->setRowHeight(26);

$rowNum = 2;
foreach ($rows as $r) {
  $semasa = getSemasaNilai($r);
  $peratus = kiraPeratusSemasa($r);

  $scopeType = (string)($r['scope_type'] ?? '');
  $namaUnit  = ($scopeType === 'UNIT') ? (string)($r['nama_unit'] ?? '-') : '-';
  $kiraan    = (string)($r['cara_kira_pencapaian'] ?? 'COUNT_PROGRAM');

  $peruntukan = ($r['peruntukan_paparan_rm'] !== null) ? (float)$r['peruntukan_paparan_rm'] : null;

  $sasaranNilaiTxt = formatSasaranNombor($r['sasaran_nilai']);
  $sasaranUnitTxt  = trim((string)($r['sasaran_unit'] ?? ''));
  $sasaranTxt = trim($sasaranNilaiTxt . ($sasaranUnitTxt ? " {$sasaranUnitTxt}" : ''));

  if (($r['jenis_sasaran'] ?? '') === 'PERATUS_BAJET' && !empty($r['sasaran_rm'])) {
    $sasaranTxt .= " | RM " . number_format((float)$r['sasaran_rm'], 2);
  }

  // jumlah paparan ikut sku_list.php
  $jumlahPaparan = '-';
  $jenis = $r['jenis_sasaran'] ?? '';

  if ($jenis === 'PERATUS_BAJET') {
    $val = getSemasaNilai($r);
    $jumlahPaparan = ($val === null)
        ? '-'
        : 'RM ' . number_format((float)$val, 2);

  } elseif ($kiraan === 'SUM_RM') {
    $jumlahPaparan = 'RM ' . number_format((float)($r['semasa_sum_rm'] ?? 0), 2);
  } elseif ($kiraan === 'SUM_PESERTA') {
    $jumlahPaparan = (string)intval((float)($r['semasa_sum_peserta'] ?? 0)) . ($sasaranUnitTxt ? " {$sasaranUnitTxt}" : '');
  } elseif ($kiraan === 'SUM_PESERTA_10K') {
    $jumlahPaparan =
      (string)intval((float)($r['semasa_sum_peserta_10k'] ?? 0))
      . ($sasaranUnitTxt ? " {$sasaranUnitTxt}" : '');
  } elseif ($kiraan === 'SUM_PESERTA_ZAKAT') {
    $jumlahPaparan =
      (string)intval((float)($r['semasa_sum_peserta_zakat'] ?? 0))
      . ($sasaranUnitTxt ? " {$sasaranUnitTxt}" : '');
  } elseif ($kiraan === 'COUNT_PROGRAM') {
    $jumlahPaparan = (string)intval((float)($r['semasa_count_program'] ?? 0)) . ($sasaranUnitTxt ? " {$sasaranUnitTxt}" : '');
  } elseif ($kiraan === 'MANUAL') {
    $jumlahPaparan = ($semasa === null) ? '-' : (formatSasaranNombor($semasa) . ($sasaranUnitTxt ? " {$sasaranUnitTxt}" : ''));
  }

  $anggaran = ($r['anggaran_akhir_tahun'] !== null) ? (float)$r['anggaran_akhir_tahun'] : null;

  $values = [
    (int)$r['bil'],
    (string)($r['nama_aktiviti'] ?? ''),
    $scopeType,
    $namaUnit,
    $kiraan,
    $peruntukan,
    $sasaranTxt,
    ($peratus === null ? '-' : formatPercent($peratus)),
    $jumlahPaparan,
    (string)($r['catatan'] ?? ''),
    ($anggaran === null ? '-' : number_format($anggaran, 2)),
  ];

  $colNum = 1;
  foreach ($values as $v) {
    $cell = colLetter($colNum) . $rowNum;
    $sheet->setCellValue($cell, $v);
    $colNum++;
  }

  $rowNum++;
}

$lastRow = $rowNum - 1;

// Borders + wrap
$sheet->getStyle("A1:{$lastCol}{$lastRow}")->applyFromArray([
  'alignment' => ['vertical' => Alignment::VERTICAL_TOP, 'wrapText' => true],
  'borders' => [
    'allBorders' => ['borderStyle' => Border::BORDER_THIN]
  ]
]);

// Align some columns
$sheet->getStyle("A2:A{$lastRow}")->getAlignment()->setHorizontal(Alignment::HORIZONTAL_CENTER);
$sheet->getStyle("C2:E{$lastRow}")->getAlignment()->setHorizontal(Alignment::HORIZONTAL_CENTER);
$sheet->getStyle("F2:F{$lastRow}")->getAlignment()->setHorizontal(Alignment::HORIZONTAL_RIGHT);

// Format money column (F)
$sheet->getStyle("F2:F{$lastRow}")->getNumberFormat()->setFormatCode('#,##0.00');

// Column widths
$widths = [
  'A' => 6,
  'B' => 55,
  'C' => 10,
  'D' => 18,
  'E' => 16,
  'F' => 16,
  'G' => 24,
  'H' => 16,
  'I' => 28,
  'J' => 26,
  'K' => 22,
];
foreach ($widths as $col => $w) {
  $sheet->getColumnDimension($col)->setWidth($w);
}

// Output
$filename = safeFilename("SKU_{$tahun}_bulan{$bulanSemasa}_{$scope}") . ".xlsx";

header('Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
header("Content-Disposition: attachment; filename=\"{$filename}\"");
header('Cache-Control: max-age=0');

$writer = new Xlsx($spreadsheet);
$writer->save('php://output');
exit;