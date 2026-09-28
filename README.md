# BAPIM Dataset Management

This is the Laragon-ready PHP and MySQL web version of the Dataset Management
System. Apache serves the existing browser interface, PHP handles its API and
sessions, and MySQL stores user accounts, dataset metadata, and activity history.
Uploaded CSV files are stored privately in `data\csv`; they are not served as
public files.

## Run with Laragon

1. Copy this project folder into Laragon's web root, usually
   `C:\laragon\www\app-BAPIM-laragon`.
2. Open Laragon and click **Start All**. Make sure Apache's `rewrite_module` and
   PHP's `pdo_mysql` extension are enabled.
3. Open Laragon's **Database** menu and launch phpMyAdmin or HeidiSQL. Import
   [`database.sql`](./database.sql) to create the `bapim` database and tables.
4. If an old SQLite database exists at `data\database.db`, optionally migrate
   dataset metadata, CSV paths, and activity history from Laragon's Terminal:

   ```powershell
   php migrate_sqlite.php
   ```

   The migration requires PHP's `pdo_sqlite` extension and only runs against an
   empty MySQL target. It does not remove or modify the SQLite database. Legacy
   accounts cannot be migrated because they have no local password hashes;
   create new local accounts after migration.
5. If your local MySQL connection is not the Laragon default (`127.0.0.1:3306`,
   user `root`, blank password), create `config\database.local.php` and return
   the connection settings:

   ```php
   <?php
   return [
       'host' => '127.0.0.1',
       'port' => '3306',
       'database' => 'bapim',
       'username' => 'root',
       'password' => '',
   ];
   ```

   This local settings file is ignored by Git and blocked from web access.
6. For uploads larger than PHP's default limit, update Laragon's `php.ini`:
   set `upload_max_filesize = 100M` and `post_max_size = 110M`, then restart
   Apache.
7. Visit `http://app-bapim-laragon.test/`. If Laragon does not resolve the
   automatic virtual host, use Laragon's **www** menu to create a virtual host
   for this project and open the host name it reports.
8. Select **Cipta akaun** on the login page to create a local account. You will
   be signed in automatically after the account is created. Passwords must be
   at least 8 characters.

## Data and accounts

- Excel files are read and normalized by the existing browser-side spreadsheet
  importer. The PHP API stores the resulting CSV data.
- Existing files under `data\csv` are kept. Use the optional migration above
  to carry over SQLite dataset metadata and activity history; otherwise import
  source files again in the web interface. Keep a backup of the old `data`
  directory until the new site has been checked.
- This PHP version uses local MySQL authentication and does not use the Firebase
  service-account file or synchronize activity to Firestore.
- Keep the project on a trusted local machine. The account-creation page is
  available to users who can reach the local site.

## Requirements

- Laragon with Apache, MySQL/MariaDB, PHP 8.1 or newer, `pdo_mysql`, and
  `mod_rewrite`. The GitHub updater also requires PHP `curl` and Windows
  `tar.exe` (included with supported Windows versions).
- The sidebar's **Semak Kemas Kini** button checks the public
  `Press-Fx100/app-BAPIM--laragon-` repository. When an update is available,
  confirm to download and install it. The updater preserves the `data` and
  `config` directories; back up your app before updating. If the repository is
  made private, configure a fine-grained, contents-read-only token as the
  `BAPIM_GITHUB_TOKEN` environment variable for Apache/PHP.
- The web app does not require Node.js, Python, or Composer. Internet access is
  required for GitHub update checks and downloads.
# app-BAPIM--laragon-
