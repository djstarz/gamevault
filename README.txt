GAMEVAULT DARK UI REDESIGN — SAFE INSTALL

This bundle contains only the redesigned visual files:
  index.html
  css/style.css

It intentionally does NOT include or replace js/app.js or js/config.js.

INSTALL:
1. Download and extract this bundle.
2. In your existing GameVault GitHub repository, replace the root index.html with this bundle's index.html.
3. Replace css/style.css with this bundle's css/style.css.
4. Keep your existing js/app.js and js/config.js exactly as they are.
5. Commit/push the changes and wait for GitHub Pages to deploy.

The redesign keeps the DOM IDs expected by the existing app.js, including:
account, auth-open, auth-dialog, auth-form, auth-heading, auth-submit,
auth-toggle, auth-status, username, password, upload-form, title, category,
description, media, upload-button, upload-status, gallery-grid, admin-panel,
admin-post-count, admin-username, admin-refresh, admin-close, admin-message,
and admin-posts.

No Supabase SQL, storage bucket, RLS policy, or configuration change is required for this visual redesign.
