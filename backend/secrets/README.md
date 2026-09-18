# Server secrets

Not in git, and not deployed by git. The deploy does `git reset --hard
origin/main`, so anything here on a server stays put and anything here on a
laptop stays local.

## The Google service-account key

What the Settings > Google Sheets export authenticates with.

1. Google Cloud Console > APIs & Services > Library > enable **Google Sheets API**
2. Credentials > Create credentials > **Service account** (no IAM roles needed -
   access comes from sharing the spreadsheet, not from IAM)
3. Open it > Keys > Add key > Create new key > **JSON**
4. Save the downloaded file here as `sheets-service-account.json`
5. `backend/.env` already points at it via `GOOGLE_SERVICE_ACCOUNT_FILE`
6. Restart the backend. The Settings page then shows the account's address -
   **share the spreadsheet with it as an Editor**, or Google answers 403.

`GOOGLE_SERVICE_ACCOUNT_FILE` (a path) rather than `GOOGLE_SERVICE_ACCOUNT_JSON`
(the whole key inline) because the backend reads `.env` through systemd's
`EnvironmentFile=`, which is awkward with a long single-line value full of
quotes, braces and `\n` escapes. A path is one unambiguous token.

## On the VPS

Copy the key straight to the server - never through the repo:

    scp sheets-service-account.json USER@HOST:/var/www/hrnavinos-erp/backend/secrets/
    ssh USER@HOST 'chmod 600 /var/www/hrnavinos-erp/backend/secrets/sheets-service-account.json'

then add the same `GOOGLE_SERVICE_ACCOUNT_FILE` line to
`/var/www/hrnavinos-erp/backend/.env` and `sudo systemctl restart hrnavinos-backend`.
