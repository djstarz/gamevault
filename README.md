# GameVault — GitHub Pages + Supabase Free

This is a static gaming gallery with Supabase email/password authentication, public posts, and media uploads.

## A. Configure the keys
Open `js/config.js` in a text editor. Replace the two placeholders with the **Project URL** and **Publishable key** from your Supabase dashboard. Never use a Secret or `service_role` key in browser code.

## B. Finish the database setup
Since you already created `public.posts` and its RLS policies, run `setup.sql` once in Supabase SQL Editor. This adds `storage_path`, used to remove the media file when its owner deletes a post.

## C. Check Storage
Create a bucket named exactly `gamevault-media` and make it **Public** so visitors can view shared files. The Storage insert/update/delete policies should restrict changes to authenticated users' own user-ID folders. Website uploads use `<auth-user-id>/<filename>` paths. If you haven't run the Storage policies yet, use the SQL policies you were given earlier.

## D. Configure authentication URLs
In Supabase, open Authentication → URL Configuration. Set Site URL to the final GitHub Pages URL and add that URL to Redirect URLs. A repository site usually looks like `https://YOUR-USERNAME.github.io/YOUR-REPOSITORY/`. If email confirmation is enabled, users need to confirm their email before signing in.

## E. Publish
1. Create a GitHub repository, for example `gamevault`.
2. Upload `index.html`, the `css` folder and the `js` folder (and optionally this README and setup.sql) to the repository root.
3. Open repository Settings → Pages.
4. Choose Deploy from a branch, branch `main`, folder `/ (root)`, then Save.
5. Wait for the published URL and add it to Supabase Authentication URL Configuration.

## Free-plan notes
Stay on Supabase Free; do not upgrade or add billing details. Free storage and bandwidth are limited. Uploads are capped at 20 MB per file in the UI. The media bucket is public, so anyone with a media URL can view shared uploads. Never upload private files. Never disable RLS or commit secret/service-role keys.
