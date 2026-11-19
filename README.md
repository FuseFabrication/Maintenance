# Fuse Maintenance Log

Static web page (index.html) that stores everything in Supabase. Netlify hosts the page.

## One-time setup

### 1. Supabase
1. Create a project.
2. SQL Editor > New query > paste `supabase/schema.sql` > Run.
3. Authentication > Sign In / Providers > Email: turn **off** "Allow new users to sign up" and turn **off** "Confirm email". Only people you create can sign in.
4. Authentication > Users > Add user > Create new user. For username `mike`, enter email `mike@fuse.example.com`, set a password, and tick **Auto Confirm User**. People type just `mike` on the sign-in screen. Repeat for each person.
5. Project Settings > API: copy the Project URL and the `anon` public key into `config.js`.

### 2. Netlify
1. Add new site > Import from Git > pick this repo.
2. Build command: leave empty. Publish directory: `/` (the repo root).
3. Deploy. Every push to the repo redeploys automatically.

## Notes
- Daily tasks are weekdays only. Any due date that lands on a weekend or a date in the Holidays tab moves to the next working day.
- History entries are stamped with the signed-in username.
- Equipment, tasks, history and holidays all live in Supabase, not in the repo.
