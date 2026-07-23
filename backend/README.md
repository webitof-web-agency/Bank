# Bank Backend

Node.js + MongoDB backend for the Bank admin and file management app.

## Setup

1. Copy `.env.example` to `.env` and update the values.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the API:
   ```bash
   npm run start
   ```

## API Base

Default prefix: `/api`

## Active Routes

- `GET /api/health`
- `POST /api/auth/login`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`
- `GET /api/auth/me`
- `PATCH /api/auth/profile`
- `DELETE /api/auth/avatar`
- `GET /api/users`
- `GET /api/roles`
- `GET /api/permissions`
- `GET /api/permissions/flat`
- `GET /api/permissions/groups`
- `GET /api/permissions/matrix`
- `GET /api/settings`
- `GET /api/files`
- `POST /api/files/upload`
- `GET /api/files/:id/view`
- `PATCH /api/roles/:id/permissions`
- `GET /api/banking/dashboard`
- `GET /api/banking/meta`
- `GET /api/banking/masters/society`
- `GET /api/banking/masters/branches`
- `GET /api/banking/masters/members`
- `GET /api/banking/transactions/vouchers`
- `POST /api/banking/transactions/vouchers`
- `GET /api/banking/reports/member-ledger`
- `GET /api/banking/reports/account-statement`
- `GET /api/banking/reports/trial-balance`
- `GET /api/banking/reports/balance-sheet`
- `GET /api/banking/reports/profit-loss`

## Notes

- User avatars can use a gender-based default image until a custom profile image is uploaded.
- File uploads are stored locally under `backend/uploads`.
- Settings are stored in MongoDB and include SMTP and password-reset email template content.
- `npm run seed:db` seeds default RBAC roles, demo employee accounts, and the banking masters/demo transaction data.
- Seeded accounts are idempotent and re-run with the same credentials on each seed.

## Seeded Login Accounts

Use these after running `npm run seed:db`:

- `admin@bank.local` / `Admin@12345` - Admin
- `relationship.manager@bank.local` / `Manager@12345` - Manager
- `branch.manager@bank.local` / `Branch@12345` - Branch Manager
- `teller@bank.local` / `Teller@12345` - Teller
- `auditor@bank.local` / `Audit@12345` - Auditor
