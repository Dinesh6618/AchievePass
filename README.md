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

Admins create faculty (and student) accounts, set new passwords and delete faculty from the UI. That needs the
service-role key, so it runs server-side:

```bash
supabase functions deploy admin-create-user
```

No terminal? In the Supabase dashboard open **Edge Functions → Deploy a new function**, name it `admin-create-user`,
paste in the contents of `supabase/functions/admin-create-user/index.ts` and deploy (leave "Verify JWT" on).

### 4. Create the first administrator

Nobody can sign up as an administrator — the public form only ever makes students, and the admin screens can't create
one either. The very first admin is set up once, by whoever owns the Supabase project. Pick **one** way:

**A. No secret keys, no terminal** (easiest): register a fresh account at `/register` with the username you want for the
admin (for example `college.admin`), then open `supabase/bootstrap-admin.sql`, put that username on the line marked
`EDIT`, and run the script in the Supabase **SQL Editor**. Sign in at `/login/admin`. (It refuses an account that
already has achievements, so use a fresh one rather than your own student account.)

**B. From your machine** with the service-role key (this also lets you reset a forgotten admin password):

```bash
# in .env.local (NOT prefixed with VITE_):  SUPABASE_URL=...   SUPABASE_SERVICE_ROLE_KEY=...
npm run create-admin -- --username admin --password "Str0ngPass1" --name "Your Name"
# forgotten the password later?  add:  --reset
```

From then on the admin adds faculty from **Admin → Faculty Management** and nobody needs the SQL Editor again.

### 5. Turn OFF "Confirm email" (one switch, one time)

CertiPass has **no email verification**. Supabase's dashboard setting must match:
**Authentication → Providers → Email → "Confirm email" = OFF → Save.**
Check it any time with `npm run check-auth`.

### 6. Run it

```bash
npm install
npm run dev          # http://localhost:5173
npm run check-db     # confirms your project's database is installed and private data is protected
npm run check-auth   # confirms "Confirm email" is off, username sign-in is installed and the admin function is deployed
```

Optional sample data (faculty, students, achievements in every status with generated certificate PDFs, ODs,
verification records): `npm run seed`. Everyone signs in with a username — students such as `dinesh2024`, faculty
such as `cse.faculty`; the password is printed by the script — development only.

**Upgrading a project that already has the earlier migrations?** Run, in order, in the SQL Editor:
`supabase/migrations/20260101000006_username_auth.sql` (student usernames) and
`supabase/migrations/20260101000007_role_logins.sql` (usernames for faculty and admins too). Both keep existing rows,
give every existing account a username, and are safe to run again. Faculty or admin accounts you made *before* this change
still log in to Supabase with their e-mail address; switch them to username sign-in once with
`npm run convert-staff` (add `-- --dry-run` to preview). Their password stays the same, and their real e-mail remains
on the profile as contact information only. For a brand-new project paste the whole of `supabase/setup.sql` instead.

---

## Sign-in model

Everyone — student, faculty and admin — signs in with **Username + Password**. There is no e-mail verification, no
"check your inbox" page and no e-mail address anywhere in the sign-in flow.

| Who | Signs in at | Button | How the account is created |
|---|---|---|---|
| **Student** | `/login/student` | Login | Themselves: **Create Account** (`/register`) → signed in automatically → Achievement Passport |
| **Faculty** | `/login/faculty` | Faculty Login | **An admin** adds them (Admin → Faculty Management → Add Faculty) — no public sign-up |
| **Admin** | `/login/admin` | Admin Login | **Set-up only**: `npm run create-admin` on a trusted machine — no public sign-up, and the app can't create admins |

`/login` shows **Choose your account type — [Student] [Faculty] [Admin]**; picking one reveals that form. Only the Student
form has *Forgot Password?* and *Create Account*. After login each role lands on its own area — student → *Student
Achievement Passport*, faculty → *Verification Center*, admin → *Admin Dashboard* — and an account used on the wrong tab
is refused with a pointer to the right one. (`/faculty/login` and `/admin/login` still work and redirect.)

**Registration** (`/register`): Full Name, Username, Password, Confirm Password, Register Number, Department, Year,
Section → account and profile are created, the student is signed in and lands on their Passport.

**How a username works with Supabase Auth.** Supabase Auth identifies people by an e-mail-shaped address, so every login
identity is *derived* from the username: `dinesh2024` ⇒ `dinesh2024@certipass.invalid`. `.invalid` is a reserved
top-level domain that can never resolve, so nothing is ever delivered and no real person's address is involved. That
address is internal: profiles store **no** e-mail for new accounts, the interface never shows it, and the directory
views don't expose it. Passwords are handled and hashed by Supabase Auth (never stored by CertiPass, never in the
profile tables).

Rules, enforced in the app *and* the database (so a hand-made API call can't bypass them):

* Usernames are 3–100 characters (letters, numbers, `.`, `-`, `_`, and at most one `@`), unique regardless of
  upper/lower case and across all roles, and cannot be changed afterwards (the sign-in address is derived from them).
  Names like `admin` or `faculty` are reserved for the first administrator. A name that looks like an e-mail address,
  such as `dinesh.g.2024.aids@rajalakshmi.edu.in`, is allowed — it is only a name: nothing is ever sent to it and it is
  not checked as an address (its `@` is written `+` in the internal sign-in address). 100 is a generous cap rather than
  "unlimited" because the sign-in address has to stay under Supabase Auth's own 255-character limit.
* A public sign-up can only ever create a *student* whose login address matches the username. The role is read only from
  `app_metadata`, which only the service role can write, so nobody can sign themselves up as faculty or admin.
* Route protection: `/student`, `/faculty` and `/admin` each require that role, so a student typing `/faculty` or
  `/admin`, or a faculty member typing `/admin`, is sent back to their own area — and Row Level Security enforces the
  same split in the database, so the data stays out of reach even if someone bypasses the UI.

**Faculty management** (Admin → Faculty Management): *Add Faculty* asks for Full Name, Username, Password, Confirm
Password, Faculty ID, Department and Designation; the new account can sign in immediately. Per faculty member an admin can
**Edit** details, **Set a new password** (the way a forgotten password is handled — nobody has an e-mail address to send
a reset link to), **Disable / Enable**, and **Delete**. Deleting is refused for anyone who has already reviewed
certificates or OD requests (that history must keep its reviewer): disable them instead. Students are managed the same
way (without Delete — a student's passport is a permanent record). The same actions run through the
`admin-create-user` edge function, which re-checks in the database that the caller is an active admin and refuses to
create, change or delete administrator accounts.

**Forgot password.** The link on the Student form leads to a clearly-marked "coming soon" notice: self-service recovery
isn't built yet (it is a deliberate later addition, marked `TODO` in `PasswordPages.tsx`). Until then an admin sets a new
password from the Students or Faculty page (Edit → Set a new password).

### Troubleshooting

| What you see | Cause |
|---|---|
| "Registration is not switched on for this project yet…" | "Confirm email" is still ON in Supabase (step 5). Run `npm run check-auth`. |
| "Could not find the function public.username_available" / sign-up fails | The username migrations haven't been run (`…000006_username_auth.sql`, `…000007_role_logins.sql`). |
| "That username is already taken" | Usernames are unique, ignoring case and across roles. Pick another. |
| "Incorrect username or password" | Usernames are not case-sensitive, passwords are. |
| "That is a Faculty account, not a Student one…" | Right credentials on the wrong tab — choose the matching account type above the form. |
| I can't log in as faculty or admin — those tabs have no Create Account | By design: only a student can create their own account. The first admin is made once in step 4; the admin then adds each faculty member. |
| An older faculty/admin account (made with an e-mail) says "Incorrect username or password" | Run `npm run convert-staff` once; they then sign in with their username (shown in the admin's Faculty list). |
| Adding faculty says the function wasn't found / fails | Deploy it: `supabase functions deploy admin-create-user` (`npm run check-auth` tells you). |

---

## What's in each role

| Role | Home | Can do |
|---|---|---|
| **Student** | `/student` — *My Achievement Journey* | Upload certificates, confirm scanned details, build the passport (timeline, wallet, heatmap), request OD, track status, OD calendar, notifications, QR records, print the digital passport |
| **Faculty** | `/faculty` — *Verification Center* | Review queue with quick actions, full verification screen (certificate left, details right, checklist), verify / reject (reason required) / request changes, OD decisions, student search and history, reports (CSV) |
| **Admin** | `/admin` | Dashboard, Faculty Management and students (create, edit, set password, disable, delete faculty), departments, event categories, system settings, all achievements and ODs, reports, analytics, audit feed |

Public: landing page, student registration, the role-based login (student / faculty / admin), the forgot-password
notice, and the QR landing page `/verify/:code` (shows only public fields — never e-mail, phone or reviewer identity).

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

* **Database & sign-in rules (81 tests):** the actual migrations run in an in-process Postgres. They cover sign-up
  hardening (username rules for every role, the login address tied to the username, reserved names, registration
  switch, no public route to faculty/admin), the upgrade of projects that already had real-e-mail students or staff,
  department scoping, locked states, forged review fields, the verify/reject/more-info workflows, notifications,
  storage-policy logic, the public verification payload, anonymous access, `setup.sql` matching the migrations, and a check
  that the app, the trigger, the edge function and the scripts agree on the username rules.
* **Unit tests (44):** username validation and the derived login address, OCR parsing & name matching, duplicate
  similarity, analytics, heatmap, report builders, CSV safety, and a generated-PDF → pdf.js → parser round trip.
* **Browser run-through (Chrome, desktop + 390 px phone):** all three roles — login, passport, upload with progress and
  PDF reading, the duplicate warning, name-mismatch warning, OD flow, calendar, faculty verification, reports (CSV download),
  admin dashboard / analytics / user creation / settings, role guards, no horizontal scroll, no console errors.
  This ran against a **local stand-in for the Supabase API** (set up like a project with "Confirm email" off), not a
  real Supabase project. Two further suites cover authentication end to end:
  * *Roles (52 checks):* the account-type chooser and the exact fields / buttons of each form (Create Account and Forgot
    Password only for students); student **Create Account → signed in → Passport**; **admin login → Admin Dashboard →
    Faculty Management → Add Faculty** (exact form, validation, duplicate and reserved usernames, password never shown
    back); the **new faculty member signs in → Verification Center**; edit, set a new password (old one stops working),
    disable (cannot sign in) / enable, delete (refused when there is review history); a **student cannot open
    `/faculty` or `/admin`, a faculty member cannot open `/admin` or `/student`, signed-out visitors are redirected to
    the matching tab; credentials used on the wrong tab are refused; the admin function refuses to create an
    administrator.
  * *Username (51 checks):* registration and sign-in with no e-mail, inbox or verify/resend/callback request; any letter
    case; duplicate username / register number; reserved and malformed names; weak or mismatched passwords; a project that
    still has "Confirm email" on gets a clear explanation; closed registration; e-mail-style usernames; the old
    `/verify-email` and `/auth/callback` pages are gone.

**Not verified against a live Supabase project** (please smoke-test these after deploying): the whole sign-up →
sign-in round trip and the admin-creates-faculty flow against your real project (`npm run check-auth` covers the set-up,
not a full registration), the `admin-create-user` edge function itself (create / set password / delete), the raw-body
XHR upload to Storage (used for real progress events), Realtime notifications, and Tesseract on photographed (non-PDF)
certificates, which needs network access to its language-data CDN. (Supabase Auth itself was checked to accept the
internal sign-in address, including the `+` form used for e-mail-style usernames, up to 237 characters.)

## Known limitations

* Analytics and reports aggregate in the browser from the (RLS-scoped) views — fine at college scale; move to SQL views
  beyond tens of thousands of records.
* Light theme only. Chart colours are validated for colour-blind separation; the opt-in texture channel for
  print/forced-colors is not implemented — every chart instead ships a legend with counts and a "View as table" view.
* One certificate per achievement and one OD request per achievement (enforced in the database).
* If a student abandons the wizard after uploading, the file is removed on a best-effort basis (tab close can't be guaranteed).
* Project note: keeping `node_modules` inside a OneDrive-synced folder is slow — consider excluding it from sync.
