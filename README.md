# Fuse Maintenance Log

Maintenance logging for the machines at Fuse Fabrication. It's a static website (GitHub → Netlify) backed by a Supabase database. There's no build step.

## What it does

**Shop floor (shared tablets)**
- **Who's doing the maintenance?** Each person taps their name before logging anything. After 10 minutes without a tap, the tablet returns to this screen.
- **Pick a machine.** Type the tag (for example `PB-001`), tap the machine's tile, or scan its QR label with the tablet camera.
- **Run a checklist.** Each item gets a big Yes / No answer, and a No needs a note. If anything fails, the tablet asks whether the machine can still run.
- **Skip a check.** The person has to give a reason and a note, and say whether it will be made up.
- **Report a problem.** This sets the machine to Running, Limited or Down and records whether it's locked out.
- **Log other work.** Repairs and similar jobs go here, with an option to mark the machine back to Running.
- **Shared machines.** Cranes, forklifts and compressors show up in every department that uses them. They only need one check per period.

**Office**
- **Dashboard.** Machines down, daily checks left today, exceptions to review, completion for each frequency, a table by department, and recent activity.
- **Machines and Departments.** Machines are grouped by owner department, with shared machines listed too.
- **Machine page.** Shows checklists with their revision, the full history, change status, log maintenance, corrections, the shop-floor link and QR code, and a printable label.
- **Exceptions.** Lists every skipped, missed or failed check. Supervisors review each one by acknowledging it, noting it was made up, or recording a corrective action. Exports to CSV.
- **Admin (supervisors).** Checklist editor with revisions, machines, people, holidays, and logins (admins only).

## ISO 9001 notes

- **Records can't be edited or deleted.** Inspections, skips, problems, status changes, maintenance logs and reviews can only be added. Mistakes get a *correction* that sits next to the original (7.5.3).
- **No back-dating.** The database sets the time and the period a check counts for, so the tablet clock doesn't matter.
- **Every record has a name.** Checks, skips, problems and logs all record who did them, and which login (tablet) was used.
- **Controlled checklists (7.5.2).** Each checklist has a document ID, revision, effective date and approver. Any edit creates a new revision, and old revisions are kept. Every inspection stores the exact wording it was answered against. A checklist with no approver shows as **Not approved**.
- **Exceptions and corrective action (10.2).** Missed periods are found automatically. "Machine down" and "not in use" skips close on their own. Everything else waits for a supervisor's review with a note.
- **Monitoring (9.1).** The dashboard and exceptions pages, plus their CSV exports, are the evidence for management review.

## Files

| File | What it is |
|---|---|
| `index.html` | Page layout and styles |
| `app.js` | The app |
| `config.js` | Supabase URL and publishable key, time zone, tablet timeout |
| `supabase/schema.sql` | Database tables, rules and views |
| `supabase/seed.sql` | Starting data: 9 departments, 50 machines, the Mazak daily checklist |

## Setup

### 1. GitHub
Upload these files to the repo, replacing the old ones. Delete `dates.js`, which isn't used any more. Netlify redeploys on its own. Leave the publish directory as the repo root, with no build command.

### 2. Database (one time)
In Supabase, open **SQL Editor → New query**. Paste all of `supabase/schema.sql` and click **Run**. Then do the same with `supabase/seed.sql`.

`schema.sql` removes the first version's `equipment`, `tasks` and `log` tables, which were empty, and keeps `holidays`. Both files are safe to run again.

### 3. Logins
Turn sign-ups off in **Authentication → Providers → Email → Allow new users to sign up**, so only people you create can get in. Then:

- **Supervisors and office users:** create each one in **Authentication → Users → Add user**. After they sign in once, an admin sets their role on **Admin → Logins**.
- **Tablets:** create one login per tablet (or one shared login), such as `prefab-tablet@…`. Sign in once on each tablet. New logins start as `tablet`, which can run checks but can't change machines, checklists or reviews.
- **Admin:** `seed.sql` makes `mike@fuse.example.com` an admin. Change that email in the file first if you need a different one.

### 4. Fill it in
1. **People.** On **Admin → People**, add everyone who does maintenance, with their department.
2. **Checklists.** On **Admin → Checklists → New checklist**, add one per machine per frequency. Put your name in **Approved by** to release it.
3. **Holidays.** On **Admin → Holidays**, add the days the shop is closed so daily checks aren't marked missed.
4. **QR labels (optional).** On each machine page, click **Print label**.
5. **Tablets.** On each tablet, pick the department under **This tablet is in** on the name screen.

## How due dates work
- **Daily:** due every weekday (Monday–Friday) except holidays.
- **Weekly:** Monday through Sunday.
- **Monthly:** the calendar month.
- **Semi-annual:** January–June and July–December.
- **Annual:** the calendar year.

A period counts as **missed** if it ended with no check and no skip recorded. Checklists only count from the day they're created. While a machine is Down, its missed checks aren't flagged.

To change the time zone, update it in `config.js` and in the `shop_today` and `shop_date` functions in `schema.sql`. Work days are set in `is_workday`.
