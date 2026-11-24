# Sidequest – independent hosting migration

Prepared 19 November 2026 from the live app's source commit `3c1f6d8db2dea3f4178d985954ba090d4865e2d9`.

**Status: migration candidate. Supabase schema is provisioned and access tests passed; Cloudflare deployment, real login and data migration are pending.**
The existing ChatGPT-hosted app remains the live source of your data. This package contains code, not a copy of your current board.

## Accounts and ownership

- Private GitHub repository owned by Jay: source and version history.
- Cloudflare account owned by Jay: Worker + static app hosting.
- Supabase account owned by Jay: independent email/password login and Postgres storage.
- No paid subscriptions are activated by this package. Review each provider's current free-tier limits before deployment.

## What is included

The existing responsive desktop/mobile interface, tasks, movies, Lab, Grab & Go, maintenance, backups and offline/conflict handling; installable app manifest; server-side login session cookies; per-account database access; atomic revision checks for multi-device edits; and account sign-out. Legacy personal starter tasks, films and project seeds have been removed from this copy.

The app uses the same `/api/state` protocol as the current app. Supabase stores one JSON board per account. A compare-and-swap SQL function prevents a stale device from silently overwriting a more recent board. Existing client merge logic handles HTTP 409 conflicts. Settings and checklist completion travel with the board. GitHub stores code only.

## One-time Supabase setup

1. Create a free Supabase project. Retain the database password privately; never place it in the repository or chat.
2. Apply `supabase/001_sidequest.sql` using the project's SQL editor.
3. Disable public account sign-ups. Create Jay's email/password user in Supabase Auth. The user should set/retain the password privately. This candidate has no public signup or password-recovery UI; owner recovery is managed through Supabase during this initial personal deployment.
4. Add that Auth user's UUID to `public.sidequest_members` through the Supabase dashboard. This membership is required even after a successful login. Do not copy the old ChatGPT user ID – the new account has its own UUID.
5. Record the project URL and **publishable key** for the Cloudflare configuration below. A secret/service-role key is NOT needed by the app.
6. Run `supabase/002_verify_access.sql` in the SQL editor before cutover. It uses temporary test users in a transaction that rolls back. Verify all checks pass; if any fails, do not migrate production data.

## Cloudflare setup

Requires Node 22+ and npm. The app is built without a framework dependency.

```sh
npm install
npm test
npm run build
npx wrangler login
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_PUBLISHABLE_KEY
npm run deploy
```

Enter each configuration value at the secret prompt; do not put it in source. `SUPABASE_URL` must have the form `https://PROJECT.supabase.co` (no trailing slash). This candidate deliberately accepts only standard Supabase hosted domains.

`wrangler.jsonc` configures a Worker named `sidequest` and static assets. `/api/*` is handled by the Worker. `/login` is served from `login.html`. Build output is `dist`. The custom domain is optional; a provider address is enough to start.

For local development, use a separate development Supabase project and an ignored `.dev.vars` file containing those two values. Never point exploratory tests at the production board. Cookies use Secure + HttpOnly + SameSite=Strict and `__Host-` names; test actual login over HTTPS in staging.

Alternatively, connect the private GitHub repository directly to Cloudflare Workers Builds. Set build command `npm run build` and deploy command `npx wrangler deploy`. Commit the npm-generated package-lock.json. No GitHub token or Supabase secret belongs in client JavaScript.

## Connect movie lookup

Create a fresh TMDB API Read Access Token, then add it to the existing Sidequest Worker as the encrypted secret `TMDB_READ_TOKEN` under **Settings → Variables and Secrets**, or use `npx wrangler secret put TMDB_READ_TOKEN`. Signed-in Sidequest members can then search from Movies on any device. Manual entries work before the secret is configured.

## Move the live board safely

1. Finish edits on the old app and wait for **Saved to cloud** on each device.
2. In the old app's More view, export the full JSON backup. Keep this file private; it may contain personal notes and attachments. Never commit it to GitHub.
3. Open the independent app, sign in, and restore that JSON backup through More. The restore screen previews the counts and requires confirmation.
4. Wait for **Saved to cloud**. Open the new app on the other device with the same independent account.
5. Compare task/project/movie counts, Today membership, ordering, custom packing items, checked packing items, and maintenance last-done/next-due dates with the old app.
6. Add a disposable task on desktop, observe it on phone, complete it there, and observe that on desktop. Test offline changes and simultaneous edits before relying on the new app.
7. Export another backup from the new app. Only after verification, replace phone/desktop shortcuts with the new address.
8. Stop editing the old app after cutover. The two hosts do not sync with each other. Keep the old app available until you are satisfied; rolling back after new edits requires exporting the new board and intentionally restoring it, not simply switching URLs.

## Verification completed here

- Existing model, notes ordering, offline recovery, merge, Today and packing tests pass.
- Eight mocked Worker/API tests pass: authentication guard, account identity, cross-origin writes, invalid/large data, revision conflicts, cookie refresh, membership gate and recoverable outages.
- Static production build, JavaScript syntax checks and Cloudflare Worker dry-run packaging pass.

## Verification still required before live cutover

- Database isolation tests passed against Supabase using temporary fixtures rolled back after testing. Real account login remains pending.
- Live login, token refresh, password/account recovery and sign-out including multiple tabs.
- Real two-device sync, offline reopening/recovery, and installed desktop/iPhone behaviour.
- Cloudflare free-tier CPU budget with a representative imported board (especially images). The Worker validates the full board each save; a large attachment-heavy board may require optimisation or a paid tier. Do not enable a paid tier without approval.
- Export backups independently: the app includes manual JSON exports, not scheduled off-provider backups.
- Browser notifications are not added by this migration. Existing calendar export remains unchanged.

Official references:
- https://developers.cloudflare.com/workers/static-assets/
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/auth
- https://supabase.github.io/auth/
