# Thrift RPR — Member & Employee App

Flutter app for members and employees of the society to view their own
accounts. Read-only: no loan apply, no loan status, no data entry.

The society's name, reg. no., address and logo come from **Settings → Society
Details**, and the colours from **Settings → Branding**, via
`GET /api/app/config` — nothing about the society is hard-coded in the app.

## What it does
- **Login** with mobile number + password. A member's first password is their
  own 10-digit mobile number (backend migration
  `2026-10-15-member-app-password-is-mobile`); the office can change it on the
  member master. Employees use their staff login password.
- **Summary** (home): per-product Balance + Interest for the selected FY, plus
  last-transaction date. Tap a product → its **passbook** (date / voucher /
  credit / debit / running balance).
  - Members: Share, Special Saving, Compulsory Deposit, Regular Loan, Loan
    Against Deposit.
  - Employees: Home Loan, Vehicle Loan, Grain Advance.
- **Transactions**: every entry of the selected FY across all accounts, newest
  first, grouped by date, with credited / debited totals.
- **Profile**: personal / membership details and the society card; the logout
  button lives here.
- **Financial Year picker** in the header — any FY the account existed in,
  from 2021-22 to the current year; served by the backend, never typed.

## Architecture
- **State**: Riverpod (`lib/state/`); branding is cached in
  `shared_preferences` so the name/colours show at once, even offline.
- **Networking**: Dio (`lib/data/api_client.dart`) → backend `/api/app/*`.
- **Auth**: JWT in `flutter_secure_storage`; restored on launch (`AuthGate`).
- **Theme**: `lib/core/theme.dart` mirrors the web app (Inter / Space Grotesk,
  slate neutrals, primary/accent from Branding).
- **Screens**: `lib/screens/`, shared widgets in `lib/widgets/`.

## Backend API (in this repo: `backend/`)
- `GET  /api/app/config` (public) → `{ society, theme }`
- `POST /api/app/auth/login` `{ mobile, password }` → `{ token, account }`
- `GET  /api/app/me/financial-years`
- `GET  /api/app/me/summary?startYear=YYYY`
- `GET  /api/app/me/statement/:product?startYear=YYYY`
- `GET  /api/app/me/profile`

## Run / build
The API defaults to the live backend (`https://jskbf.webitof.com/api`).

```sh
# Release APK against live
flutter build apk --release

# Development against a local backend on a USB-connected phone
adb reverse tcp:8001 tcp:8001
flutter run --dart-define=API_BASE_URL=http://localhost:8001/api
```

For a local backend run on a copy of live data, set `SMS_ENABLED=false` (the
automation job retries pending SMS) and `GDRIVE_BACKUP_HOUR_IST=-1` (no Drive
backup upload).

## Before production
- The release build is still signed with the debug key
  (`android/app/build.gradle.kts`); add a real release keystore before
  publishing, and keep it out of git.
- Two members can share a mobile number; with password = mobile only the
  lowest code can sign in until the other is given its own password.
