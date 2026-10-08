# CertiPass — Student Achievement Passport & OD Verification

CertiPass replaces certificates sent over WhatsApp, e-mail and Google Forms with one workflow:

```
Certificate → smart extraction → student confirmation → achievement passport → OD request
            → faculty verification → verified digital record → QR verification → college reports
```

Students upload a certificate and request OD in the same flow. Faculty verify it against a checklist.
The result is a QR-backed record anyone can check at `/verify/<ID>`, plus reports and analytics for the college.

**Stack:** React 19 + TypeScript · Tailwind CSS 4 · Supabase (Postgres, Auth, Storage, Edge Functions) ·
React Router · Recharts · Lucide · `qrcode.react` · Tesseract.js / pdf.js (pluggable OCR)

---

## Quick start

### 1. Create a Supabase project and apply the schema

```bash
npm install -g supabase            # or use `npx supabase`
supabase link --project-ref <your-project-ref>
supabase db push                   # applies supabase/migrations/*.sql in order
```

The migrations create every table, trigger, RLS policy, RPC function, storage bucket and the reference data
(departments, the ten event categories, default settings). For a brand-new project you can instead paste the single file `supabase/setup.sql` (all migrations bundled — regenerate it with
`npm run build-sql`) into the Supabase SQL Editor and click Run.

### 2. Configure the app

```bash
cp .env.example .env.local
# fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (Project Settings → API → anon / publishable key)
```

Only the **anon** key goes in `VITE_*` variables. The service-role key is used only by the seed script and the
edge function and must never be exposed to the browser.

### 3. Deploy the admin edge function

Admins create student/faculty accounts from the UI. That needs the service-role key, so it runs server-side:

```bash
supabase functions deploy admin-create-user
```

### 4. Create the first administrator

Public sign-up can only ever create students, so bootstrap the first admin from your machine:

```bash
# in .env.local (NOT prefixed with VITE_):  SUPABASE_URL=...   SUPABASE_SERVICE_ROLE_KEY=...
npm run create-admin -- --email you@college.edu --password "Str0ngPass1" --name "Your Name"
```

### 5. Turn OFF "Confirm email" (one switch, one time)

CertiPass has **no email verification**. Supabase's dashboard setting must match:
**Authentication → Providers → Email → "Confirm email" = OFF → Save.**
Check it any time with `npm run check-auth`.

### 6. Run it

```bash
npm install
npm run dev          # http://localhost:5173
npm run check-db     # confirms your project's database is installed and private data is protected
npm run check-auth   # confirms "Confirm email" is off and username sign-in is installed
```

Optional sample data (faculty, students, achievements in every status with generated certificate PDFs, ODs,
verification records): `npm run seed`. Sample students sign in with usernames such as `dinesh2024`; the password is
printed by the script — development only.

**Upgrading a project that already has the earlier migrations?** Run only
`supabase/migrations/20260101000006_username_auth.sql` in the SQL Editor (it keeps existing rows and gives each
existing student a username). It is safe to run again, so if you installed an earlier copy of it (the 30-character
username rule), just run the current file once more. For a brand-new project paste the whole of `supabase/setup.sql`
instead.

---

## Sign-in model

| Who | Signs in with | Page |
|---|---|---|
| **Student** | **Username + password** — no email anywhere | `/login`, `/register` |
| **Faculty** | email + password (accounts are created by an admin) | `/faculty/login` |
| **Admin** | email + password (first one made with `npm run create-admin`) | `/admin/login` |

**Registration** (`/register`): username, password, confirm password, full name, register number, department, year,
section → account and profile are created, the student is signed in automatically and lands on their Achievement
Passport. There is no confirmation e-mail, no "check your inbox" page, no resend button and no verification step.

**How a username works with Supabase Auth.** Supabase Auth identifies people by an e-mail-shaped address, so a student's
login identity is *derived* from their username: `dinesh2024` ⇒ `dinesh2024@certipass.invalid`. `.invalid` is a reserved
top-level domain that can never resolve, so nothing is ever delivered and no real person's address is involved. That
address is internal: the profile stores **no** e-mail for students, the interface never shows it, and the staff
directory views don't expose it. Passwords are handled and hashed by Supabase Auth (never stored by CertiPass, never in
the profile tables).

Rules, enforced in the app *and* the database (so a hand-made API call can't bypass them):

* Usernames are 3–100 characters (letters, numbers, `.`, `-`, `_`, and at most one `@`), unique regardless of
  upper/lower case, and cannot be changed afterwards (the sign-in address is derived from them). Names like `admin` or
  `faculty` are reserved. A name that looks like an e-mail address, such as `dinesh.g.2024.aids@rajalakshmi.edu.in`,
  is allowed — it is only a name: nothing is ever sent to it and it is not checked as an address (its `@` is written
  `+` in the internal sign-in address). 100 is a generous cap rather than "unlimited" because the sign-in address has
  to stay under Supabase Auth's own 255-character limit.
* A public sign-up can only ever create a *student* whose login address matches the username — nobody can register a
  real e-mail address, or an account with a role, through the public form.

**Forgot password.** Students have no e-mail on file, so the link on the student login page leads to a clearly-marked
"coming soon" notice (ask faculty / an administrator for now). Faculty and admins keep the normal e-mail reset from their
own sign-in pages. A username-based recovery flow (for example an admin-issued reset) is a deliberate later addition.

**Admin-created accounts.** *Admin → Students → Add student* asks for a username (not an e-mail); *Add faculty member* asks
for an e-mail. Both need the `admin-create-user` edge function deployed (step 3).

### Troubleshooting

| What you see | Cause |
|---|---|
| "Registration is not switched on for this project yet…" | "Confirm email" is still ON in Supabase (step 5). Run `npm run check-auth`. |
| "Could not find the function public.username_available" / sign-up fails | The username migration hasn't been run (`supabase/migrations/20260101000006_username_auth.sql`). |
| "That username is already taken" | Usernames are unique, ignoring case. Pick another. |
| "Incorrect username or password" | Usernames are not case-sensitive, passwords are. |
| A faculty member can't sign in on the student page | Staff sign in at `/faculty/login` or `/admin/login` with their email. |

---

## What's in each role

| Role | Home | Can do |
|---|---|---|
| **Student** | `/student` — *My Achievement Journey* | Upload certificates, confirm scanned details, build the passport (timeline, wallet, heatmap), request OD, track status, OD calendar, notifications, QR records, print the digital passport |
| **Faculty** | `/faculty` — *Verification Center* | Review queue with quick actions, full verification screen (certificate left, details right, checklist), verify / reject (reason required) / request changes, OD decisions, student search and history, reports (CSV) |
| **Admin** | `/admin` | Dashboard, manage students & faculty (create, edit, deactivate), departments, event categories, system settings, all achievements and ODs, reports, analytics, audit feed |

Public: landing page, student registration, login (student / faculty / admin), forgot & reset password, and the
QR landing page `/verify/:code` (shows only public fields — never e-mail, phone or reviewer identity).

---

## Architecture

```
src/
  components/ui/          design-system primitives (Button, fields, Modal, Toast, Skeleton, …)
  components/charts/      validated chart palette + chart wrappers (every chart has a table twin)
  components/passport/    journey timeline, wallet, heatmap, verified record card (QR)
  components/certificates uploader (real progress), scan summary, details form
  components/layout/      student navy sidebar · faculty top-bar workspace · admin sidebar
  contexts/               auth (session + profile), notifications (realtime)
  services/               all data access; one file per domain
  services/ocr/           provider interface + parser (see below)
  lib/                    errors → friendly messages, dates, CSV, similarity, analytics, heatmap
  pages/{public,student,faculty,admin,shared}/
supabase/
  migrations/             schema, RLS, RPCs, reference data
  functions/admin-create-user/
  tests/database.test.ts  runs the real migrations in Postgres (PGlite) and checks the security rules
scripts/seed.mjs          admin bootstrap + sample data
```

### Security model

* **Role is never taken from the client.** The signup trigger forces `student` unless the account was created
  by the service role (`app_metadata`, which clients cannot write).
* **Row Level Security everywhere.** Students see only their own rows; faculty see only *submitted* records of
  students in **their department**; admins see everything. Reporting views use `security_invoker`, so the same
  rules apply to them.
* **Decisions go through RPCs** (`verify_achievement`, `reject_achievement`, `request_achievement_changes`,
  `review_od_request`): they check department scope, the current state and required reasons, and are atomic.
  Faculty have no direct UPDATE access to submissions.
* **Evidence is protected.** Pending/verified certificates can't be edited or deleted by the student, at the
  database *and* storage-policy level. The `certificates` bucket is private and served through short-lived signed URLs.
* **Profile hardening.** Users can't change their own role, e-mail, department or identifiers.
* **Public page** reads through a `SECURITY DEFINER` function returning a whitelisted set of fields.
* CSV export neutralises spreadsheet-formula injection; search input is sanitised before it reaches PostgREST filters.

### OCR is replaceable

`src/services/ocr` defines an `OcrProvider` (`scan(file) → text and/or structured fields`) and a pure parser that
turns text into fields (student, event, organisation, dates incl. ranges, result, type). Selected with `VITE_OCR_PROVIDER`:

* `tesseract` (default) — in the browser. PDFs with a text layer are read directly with pdf.js; scans and photos use
  Tesseract.js (language data is fetched from a CDN on first use).
* `http` — POST the file to your own endpoint (`VITE_OCR_API_URL`); contract documented in `httpProvider.ts`.
* `none` — manual entry only.

If reading fails, is skipped, or is unavailable, the wizard falls back to manual entry. Nothing else depends on OCR.

---

## Scripts

| Command | |
|---|---|
| `npm run dev` / `build` / `preview` | Vite |
| `npm run typecheck` | TypeScript |
| `npm test` | Vitest: parser, analytics, reports, forms, PDF pipeline, **and the database security tests** |
| `npm run create-admin` / `npm run seed` | Service-role scripts (see above) |

## Testing & what was verified

* **Database & sign-in rules (65 tests):** the actual migrations run in an in-process Postgres. They cover sign-up
  hardening (username rules, the login address tied to the username, reserved names, registration switch), the upgrade
  of a project that already had real-e-mail students, department scoping, locked states, forged review fields, the
  verify/reject/more-info workflows, notifications, storage-policy logic, the public verification payload, anonymous
  access, `setup.sql` matching the migrations, and a check that the app, the trigger and the edge function agree on the
  username rules.
* **Unit tests (44):** username validation and the derived login address, OCR parsing & name matching, duplicate
  similarity, analytics, heatmap, report builders, CSV safety, and a generated-PDF → pdf.js → parser round trip.
* **Browser run-through (Chrome, desktop + 390 px phone):** all three roles — login, passport, upload with progress and
  PDF reading, the duplicate warning, name-mismatch warning, OD flow, calendar, faculty verification, reports (CSV download),
  admin dashboard / analytics / user creation / settings, role guards, no horizontal scroll, no console errors.
  This ran against a **local stand-in for the Supabase API** (set up like a project with "Confirm email" off), not a
  real Supabase project. 50 further checks cover the username flow: the login page is exactly Username + Password +
  Login / Forgot Password? / Create Account; register → signed in → passport with no e-mail or inbox step and no
  verify/resend/callback request; sign-in in any letter case; duplicate username, register number and reserved or
  malformed names; weak or mismatched passwords; a project that still has "Confirm email" on gets a clear
  explanation; closed registration; e-mail-style usernames; staff e-mail sign-in unaffected; the old
  `/verify-email` and `/auth/callback` pages gone.

**Not verified against a live Supabase project** (please smoke-test these after deploying): the whole sign-up →
sign-in round trip against your real project (`npm run check-auth` covers the set-up, not a full registration),
the raw-body XHR upload to Storage (used for real progress events), Realtime notifications, the `admin-create-user`
edge function, the staff password-reset e-mail, and Tesseract on photographed (non-PDF) certificates, which needs
network access to its language-data CDN. (Supabase Auth itself was checked to accept the internal sign-in address,
including the `+` form used for e-mail-style usernames, up to 237 characters.)

## Known limitations

* Analytics and reports aggregate in the browser from the (RLS-scoped) views — fine at college scale; move to SQL views
  beyond tens of thousands of records.
* Light theme only. Chart colours are validated for colour-blind separation; the opt-in texture channel for
  print/forced-colors is not implemented — every chart instead ships a legend with counts and a "View as table" view.
* One certificate per achievement and one OD request per achievement (enforced in the database).
* If a student abandons the wizard after uploading, the file is removed on a best-effort basis (tab close can't be guaranteed).
* Project note: keeping `node_modules` inside a OneDrive-synced folder is slow — consider excluding it from sync.
