# Webitof GST-Compliant Client Management + Finance Management System

Vanilla frontend prototype for a GST-aware client, project, invoice, payment, expense, banking, AMC, renewal, master, report, and settings workflow.

## Purpose

This project is a browser-only ERP prototype for Webitof-style service businesses. It uses clean ES6 modules and localStorage demo data so another developer can understand the business flow and later replace persistence with backend APIs.

## How to Run

Use any simple local server. With VS Code Live Server:

1. Open the `webitof-client-management` folder in VS Code.
2. Right-click `index.html`.
3. Choose `Open with Live Server`.
4. Open the generated localhost URL in the browser.

The app has no backend, database, npm dependency, build step, React, Vue, or Angular.

## Folder Structure

```txt
webitof-client-management/
  index.html
  README.md
  assets/
    css/
      main.css          CSS variables, reset, typography
      layout.css        App shell, sidebar, header, content layout
      components.css    Cards, buttons, badges, tabs, modals, empty states
      forms.css         Inputs, selects, checkboxes, form grids
      tables.css        Responsive tables and table actions
      invoice.css       Invoice preview and print styling
      responsive.css    Mobile and tablet layout rules
    images/
      placeholder-logo.svg
    js/
      app.js            App bootstrap
      router.js         Hash-based routing
      state.js          Central in-memory state
      storage.js        localStorage helpers
      constants.js      Menus, statuses, GST constants
      seed.js           Default, sample, and 50K project demo data
      components/       Reusable UI renderers
      data/             Default settings, states, services, categories, tax rates
      modules/          Routed feature screens
      utils/            GST, finance, invoice number, validation, formatting helpers
```

## Key GST Logic

GST helpers live in `assets/js/utils/gst.js`.

- Default company state: `Chhattisgarh`
- Default GST rate: `18%`
- Company settings store legal details such as GSTIN, PAN, CIN, Udyam, ISO, registered address, and state code
- Client records store GST registration type, state code, country, billing/shipping address, and place of supply
- Export without payment of IGST under LUT: GST is `0`
- Export with payment of IGST: GST applies as IGST
- Same company state and place of supply: GST splits into CGST and SGST
- Same UT supplier state and place of supply: GST splits into CGST and UTGST
- Different Indian supplier state and place of supply: GST applies as IGST
- GST-inclusive invoices reverse-calculate taxable value from total
- GST-extra invoices calculate GST on taxable value
- Invoice forms auto-select place of supply and export/SEZ invoice type from the selected client

Finance helpers in `assets/js/utils/finance.js` treat GST as liability, not income:

- Revenue = invoice taxable amount
- ITC eligible expense = amount before GST
- Non-ITC expense = total amount including GST
- Profit = revenue - expense
- Net GST payable = output GST - input GST

GST logic should be verified by a CA before production use.

## Renewal Workflows

Renewal helpers live in `assets/js/utils/renewals.js`.

- Renewals dashboard shows expired records first and nearby renewals for the next 30 days.
- Expired renewal records remain visible until the renewal date is updated.
- Domain, hosting, and software license records support add, edit, delete, provider dropdowns, purchase date, term in years, auto-calculated renewal date, pricing, and remarks.
- Software licenses can be marked internal or client-linked. Client-linked licenses can create an invoice; internal/client licenses can create an expense.
- AMC records have dynamic AMC Type and Billing Cycle dropdowns from Masters.
- Client detail pages show domains, hosting, software licenses, AMC records, and a renewal history timeline.

## Outsourcing + Lead Commission Accounting

The outsourcing and commission integration is added as an extension of the existing ERP state and modules:

- Vendor master uses the existing `masters.vendors` collection and is exposed through the Vendors page.
- Outsourcing expenses are stored in `outsourcingExpenses`.
- Referral/lead commissions are stored in `leadCommissions`.
- Calculations are centralized in `assets/js/utils/outsourcingAccounting.js`.
- Project profitability is centralized in `assets/js/utils/projectProfitability.js`.
- Existing project, client, P&L, GST, and report summaries include outsourcing, commission, TDS, and ITC without changing old invoice behavior.

Accounting rules implemented:

- Client invoices remain for full taxable project/service value.
- Outsourcing and commission are booked separately as costs.
- GST output is calculated on full client invoice value, not profit.
- Unregistered vendors/referral partners produce zero GST and no ITC.
- Registered vendor/referral partner GST can create ITC rows.
- Commission TDS is calculated on commission base amount, not GST.
- Project gross profit = sales taxable value - outsourcing base cost - commission base cost - other project expenses.

New screens:

- Vendors
- Outsourcing Expenses
- Lead Commissions
- Project Profitability
- Reports: Project Profit, Vendor Expenses, Commissions, ITC, TDS, Pending Payables

## Data Storage

All data is stored in browser localStorage under:

```txt
webitofClientManagementStateV1
```

The app seeds sample data automatically on first run. Dashboard buttons can also:

- Create Sample Data
- Create 50K Project Demo
- Reset All Data

## Replacing localStorage With Backend APIs

The app is intentionally structured so persistence can be replaced later:

- Keep `state.js` as the in-memory UI state boundary.
- Replace `storage.js` functions with API clients such as `fetch('/api/clients')`.
- Move validation and finance formulas to shared backend services if production accuracy is required.
- Convert module submit handlers from direct state mutation to API calls.
- Keep components reusable because they are pure HTML render helpers.

Suggested backend resources:

- `/api/clients`
- `/api/projects`
- `/api/invoices`
- `/api/payments`
- `/api/expenses`
- `/api/banking/accounts`
- `/api/banking/transactions`
- `/api/amc`
- `/api/renewals`
- `/api/masters`
- `/api/reports`
- `/api/settings`

## Production Notes

This is a frontend prototype. Before production use, add authentication, authorization, server-side validation, audit logs, database transactions, invoice PDF generation, email delivery, file storage, backup policy, and CA-reviewed GST compliance.
