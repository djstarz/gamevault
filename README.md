# GameVault — GitHub Pages + Supabase Free

Static gaming gallery with username/password login, uploads, and an admin moderation panel. Uses Supabase Auth and RLS; no server is hosted by GitHub Pages.

## 1. Configure the client
Edit `js/config.js` and set `SUPABASE_URL` to the plain project URL (for example `https://project-ref.supabase.co`) and `SUPABASE_PUBLISHABLE_KEY` to the publishable key. Do not use Markdown link syntax or a secret/service_role key.

## 2. Run setup SQL
In Supabase → SQL Editor, run `setup.sql`. This creates the `profiles` table and profile trigger, and adds admin post/media delete policies. Keep your existing `posts` table and `gamevault-media` public bucket with owner-folder Storage policies.

## 3. Enable username-only sign-up
This version maps usernames to synthetic addresses like `playername@username.gamevault.invalid`. In Supabase → Authentication → Sign In / Providers → Email, turn **Confirm email OFF** for this username-only flow. No actual email is collected, so password recovery by email is unavailable. Existing email-based accounts are not automatically migrated; create a new username account or keep using the prior email version until you plan a migration. Never ask users to use a real person's email as a username.

Important limitation: synthetic-email usernames are a practical demo approach for a static site, not a substitute for a custom authentication backend. If you need reliable account recovery, email verification, or robust username reservation against concurrent signups, use a server-side function/auth flow instead.

## 4. Make yourself admin
1. Open GameVault and create/sign in to your own username account once.
2. In Supabase → SQL Editor, run the following after replacing `YOUR_USERNAME` with your exact username:

```sql
update public.profiles
set is_admin = true
where lower(username) = lower('YOUR_USERNAME');
```

3. Sign out and sign in again, then refresh the site. The Admin portal button/section should appear. Do not set `is_admin` for other users unless you trust them. Only project owners should edit this flag in SQL.

## 5. Publish
Upload the contents of this folder to the root of your `gamevault` GitHub repository (not the outer folder). Enable GitHub Pages from `main` and `/(root)`. In Supabase → Authentication → URL Configuration, set Site URL and Redirect URL to your GitHub Pages URL.

## Free-plan safety
Stay on Supabase Free; do not upgrade or enter billing details. Free quotas apply. Public bucket files can be viewed by anyone with their URL; do not upload private content. The admin UI alone is not security: the SQL RLS policies enforce post/media removal. Never disable RLS or expose a secret/service_role key.
