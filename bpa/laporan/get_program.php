<?php

/*
|--------------------------------------------------------------------------
| FILE: /bpa/laporan/get_program.php
|--------------------------------------------------------------------------
| Fungsi:
| - Ambil semua program mengikut filter tarikh, unit, status dan carian.
| - Susun program mengikut tarikh paling awal hingga paling lewat.
| - Digunakan oleh:
|     1. program_list.php
|     2. program_export_excel.php
|     3. program_export_pdf.php
|--------------------------------------------------------------------------
*/

/**
 * Semak sama ada tarikh mempunyai format YYYY-MM-DD.
 */
function isValidReportDate(string $date): bool
{
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
        return false;
    }

    $dateObject = DateTime::createFromFormat('Y-m-d', $date);

    return $dateObject !== false
        && $dateObject->format('Y-m-d') === $date;
}

/**
 * Ambil senarai unit untuk dropdown laporan.
 */
function getProgramReportUnits(PDO $pdo): array
{
    $stmt = $pdo->query("
        SELECT
            unit_id,
            nama_unit
        FROM unit
        ORDER BY nama_unit ASC
    ");

    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

/**
 * Ambil nama unit berdasarkan unit_id.
 */
function getProgramReportSelectedUnitName(
    array $units,
    string $unitFilter
): string {
    if (
        $unitFilter === ''
        || !ctype_digit($unitFilter)
    ) {
        return 'Semua Unit';
    }

    foreach ($units as $unit) {
        if (
            (int)$unit['unit_id']
            ===
            (int)$unitFilter
        ) {
            return (string)$unit['nama_unit'];
        }
    }

    return 'Semua Unit';
}

/**
 * Ambil data laporan program.
 *
 * Kolum yang dipulangkan:
 * - program_id
 * - unit_id
 * - nama_unit
 * - tahun
 * - nama_program
 * - nk_jkb
 * - tarikh_paparan_mula
 * - tarikh_paparan_tamat
 * - tempoh_paparan
 * - tempat_paparan
 * - kerjasama_konsultan
 * - bil_peserta_paparan
 * - peruntukan_rm
 * - perbelanjaan_rm
 * - dana_wakalah_rm
 * - status
 * - catatan
 */
function getProgramReport(
    PDO $pdo,
    string $tarikhDari,
    string $tarikhHingga,
    string $unitFilter = '',
    string $statusFilter = '',
    string $q = ''
): array {
    $allowedStatus = [
        'draft',
        'aktif',
        'selesai',
        'batal'
    ];

    /*
    |--------------------------------------------------------------------------
    | QUERY UTAMA
    |--------------------------------------------------------------------------
    |
    | Table program ialah table utama.
    |
    | ULK mempunyai maklumat khas dalam program_ulk_detail:
    | - tarikh_masuk
    | - tarikh_tamat_pengajian
    | - tempat_pengajian
    | - jumlah_peserta_semasa
    |
    | Untuk unit lain, data diambil daripada table program.
    |
    */

    $sql = "
        SELECT
            p.program_id,
            p.unit_id,
            u.nama_unit,
            p.tahun,
            p.nama_program,
            p.nk_jkb,

            /*
             * Tarikh laporan:
             * 1. Ambil tarikh masuk ULK jika ada
             * 2. Jika tiada, ambil tarikh mula program
             */
            COALESCE(
                pud.tarikh_masuk,
                p.tarikh_mula
            ) AS tarikh_paparan_mula,

            /*
             * Tarikh tamat laporan:
             * 1. Ambil tarikh tamat pengajian ULK jika ada
             * 2. Jika tiada, ambil tarikh tamat program
             */
            COALESCE(
                pud.tarikh_tamat_pengajian,
                p.tarikh_tamat
            ) AS tarikh_paparan_tamat,

            /*
             * Tempoh:
             * Masih guna tempoh kontrak daripada table program.
             */
            p.tempoh_kontrak AS tempoh_paparan,

            /*
             * Tempat:
             * 1. program.tempat
             * 2. Jika kosong, guna tempat_pengajian ULK
             */
            COALESCE(
                NULLIF(TRIM(p.tempat), ''),
                NULLIF(TRIM(pud.tempat_pengajian), '')
            ) AS tempat_paparan,

            p.kerjasama_konsultan,

            /*
             * Bilangan peserta:
             * - ULK: jumlah_peserta_semasa
             * - Unit lain: program.bil_peserta
             */
            CASE
                WHEN UPPER(TRIM(COALESCE(u.nama_unit, ''))) = 'ULK'
                THEN COALESCE(
                    pud.jumlah_peserta_semasa,
                    p.bil_peserta,
                    0
                )

                ELSE COALESCE(
                    p.bil_peserta,
                    0
                )
            END AS bil_peserta_paparan,

            p.peruntukan_rm,
            p.perbelanjaan_rm,
            p.dana_wakalah_rm,
            p.status,
            p.catatan

        FROM program p

        LEFT JOIN unit u
            ON u.unit_id = p.unit_id

        LEFT JOIN program_ulk_detail pud
            ON pud.program_id = p.program_id

        WHERE
            COALESCE(
                pud.tarikh_masuk,
                p.tarikh_mula
            ) BETWEEN :tarikh_dari AND :tarikh_hingga
    ";

    $params = [
        ':tarikh_dari' => $tarikhDari,
        ':tarikh_hingga' => $tarikhHingga
    ];

    /*
    |--------------------------------------------------------------------------
    | FILTER UNIT
    |--------------------------------------------------------------------------
    */

    if (
        $unitFilter !== ''
        && ctype_digit($unitFilter)
    ) {
        $sql .= "
            AND p.unit_id = :unit_id
        ";

        $params[':unit_id'] = (int)$unitFilter;
    }

    /*
    |--------------------------------------------------------------------------
    | FILTER STATUS
    |--------------------------------------------------------------------------
    */

    if (
        $statusFilter !== ''
        && in_array(
            $statusFilter,
            $allowedStatus,
            true
        )
    ) {
        $sql .= "
            AND p.status = :status
        ";

        $params[':status'] = $statusFilter;
    }

    /*
    |--------------------------------------------------------------------------
    | CARIAN
    |--------------------------------------------------------------------------
    */

    $q = trim($q);

    if ($q !== '') {
        $sql .= "
            AND (
                p.nama_program LIKE :q
                OR p.nk_jkb LIKE :q
                OR p.tempat LIKE :q
                OR pud.tempat_pengajian LIKE :q
                OR p.kerjasama_konsultan LIKE :q
                OR p.catatan LIKE :q
                OR u.nama_unit LIKE :q
            )
        ";

        $params[':q'] = '%' . $q . '%';
    }

    /*
    |--------------------------------------------------------------------------
    | SUSUNAN TARIKH
    |--------------------------------------------------------------------------
    |
    | Contoh:
    | 01/05/2026
    | 04/05/2026
    | 07/05/2026
    |
    | Bukan susun ikut unit.
    |
    */

    $sql .= "
        ORDER BY
            COALESCE(
                pud.tarikh_masuk,
                p.tarikh_mula
            ) ASC,
            p.program_id ASC
    ";

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);

    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

/**
 * Kira semua jumlah berdasarkan data yang telah ditapis.
 */
function getProgramReportSummary(array $rows): array
{
    $summary = [
        'jumlah_program' => count($rows),
        'jumlah_peserta' => 0,
        'jumlah_peruntukan' => 0.00,
        'jumlah_perbelanjaan' => 0.00,
        'jumlah_dana_wakalah' => 0.00
    ];

    foreach ($rows as $row) {
        $summary['jumlah_peserta'] +=
            (int)($row['bil_peserta_paparan'] ?? 0);

        $summary['jumlah_peruntukan'] +=
            (float)($row['peruntukan_rm'] ?? 0);

        $summary['jumlah_perbelanjaan'] +=
            (float)($row['perbelanjaan_rm'] ?? 0);

        $summary['jumlah_dana_wakalah'] +=
            (float)($row['dana_wakalah_rm'] ?? 0);
    }

    return $summary;
}

/**
 * Format tarikh atau tempoh untuk paparan laporan.
 */
function formatProgramReportDate(
    $tarikhMula,
    $tarikhTamat,
    $tempoh
): string {
    $mula = '';
    $tamat = '';
    $tempoh = trim((string)$tempoh);

    if (!empty($tarikhMula)) {
        $mula = date(
            'd/m/Y',
            strtotime((string)$tarikhMula)
        );
    }

    if (!empty($tarikhTamat)) {
        $tamat = date(
            'd/m/Y',
            strtotime((string)$tarikhTamat)
        );
    }

    if (
        $mula !== ''
        && $tamat !== ''
    ) {
        if ($mula === $tamat) {
            return $mula;
        }

        return $mula . ' - ' . $tamat;
    }

    if (
        $mula !== ''
        && $tempoh !== ''
    ) {
        return $mula
            . ' (Tempoh: '
            . $tempoh
            . ')';
    }

    if ($mula !== '') {
        return $mula;
    }

    if ($tempoh !== '') {
        return 'Tempoh: ' . $tempoh;
    }

    return '-';
}

/**
 * Format teks kosong kepada tanda "-".
 */
function formatProgramReportText($value): string
{
    $value = trim((string)$value);

    return $value === '' ? '-' : $value;
}

/**
 * Format wang.
 */
function formatProgramReportMoney(
    $value,
    bool $showRm = true
): string {
    $value = (float)($value ?? 0);

    if ($value == 0) {
        return $showRm ? 'RM -' : '-';
    }

    $formatted = number_format(
        $value,
        2
    );

    return $showRm
        ? 'RM ' . $formatted
        : $formatted;
}

/**
 * Semak dan sediakan semua filter laporan.
 */
function prepareProgramReportFilters(array $input): array
{
    $tarikhDari = trim(
        (string)(
            $input['tarikh_dari']
            ?? date('Y-01-01')
        )
    );

    $tarikhHingga = trim(
        (string)(
            $input['tarikh_hingga']
            ?? date('Y-m-d')
        )
    );

    $unitFilter = trim(
        (string)(
            $input['unit_id']
            ?? ''
        )
    );

    $statusFilter = trim(
        (string)(
            $input['status']
            ?? ''
        )
    );

    $q = trim(
        (string)(
            $input['q']
            ?? ''
        )
    );

    $errors = [];

    /*
     * Tarikh tidak sah akan dikembalikan kepada default.
     */
    if (!isValidReportDate($tarikhDari)) {
        $tarikhDari = date('Y-01-01');
    }

    if (!isValidReportDate($tarikhHingga)) {
        $tarikhHingga = date('Y-m-d');
    }

    if ($tarikhHingga < $tarikhDari) {
        $errors[] =
            'Tarikh Hingga tidak boleh lebih awal daripada Tarikh Dari.';
    }

    /*
     * Unit mesti nombor jika tidak kosong.
     */
    if (
        $unitFilter !== ''
        && !ctype_digit($unitFilter)
    ) {
        $unitFilter = '';
    }

    /*
     * Status mestilah salah satu status sistem.
     */
    $allowedStatus = [
        'draft',
        'aktif',
        'selesai',
        'batal'
    ];

    if (
        $statusFilter !== ''
        && !in_array(
            $statusFilter,
            $allowedStatus,
            true
        )
    ) {
        $statusFilter = '';
    }

    return [
        'tarikh_dari' => $tarikhDari,
        'tarikh_hingga' => $tarikhHingga,
        'unit_id' => $unitFilter,
        'status' => $statusFilter,
        'q' => $q,
        'errors' => $errors,
        'allowed_status' => $allowedStatus
    ];
}

/**
 * Bina query string untuk butang export.
 */
function buildProgramReportExportQuery(
    array $filters
): string {
    return http_build_query([
        'tarikh_dari' =>
            $filters['tarikh_dari'] ?? '',

        'tarikh_hingga' =>
            $filters['tarikh_hingga'] ?? '',

        'unit_id' =>
            $filters['unit_id'] ?? '',

        'status' =>
            $filters['status'] ?? '',

        'q' =>
            $filters['q'] ?? ''
    ]);
}