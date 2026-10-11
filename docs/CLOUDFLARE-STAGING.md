# GitHub and Cloudflare staging

Deployment is now authorized for a staging preview. Keep the existing local configuration for development; do not deploy its local mailbox or synthetic seed. There is no public launch authorization.

## Connect Cloudflare to GitHub

In Cloudflare Workers & Pages, create/import a Worker from `SilverlazeR/vouchroster`, granting the Cloudflare GitHub app access to this repository. Choose the implementation feature branch for staging. For the existing Worker `vouchroster`, use its `https://vouchroster.shawn-silvia.workers.dev` origin. The deployment script derives the Worker name from this origin and will use that existing project. Account-owner consent for installing that GitHub app must happen in the dashboard; Git push access alone does not establish this connection.

Use build command `npm run check` and deployment command `npm run staging:deploy`. The generated config is in ignored `.wrangler/staging.wrangler.json`; it uses the staging D1 binding and production runtime settings. No local test data is copied. GitHub Actions validates commits and pull requests; automatic deployment is handled by the Cloudflare repository connection.

## Required settings

Create a D1 database named `vouchroster-staging` and use the account's existing workers.dev subdomain. Set these non-secret build variables:

- `CLOUDFLARE_ACCOUNT_ID`: selected Cloudflare account ID; optional when native Workers Builds supplies it or the scoped token identifies one account.
- `VOUCHROSTER_STAGING_DATABASE_ID`: staging D1 database UUID.
- `VOUCHROSTER_STAGING_ORIGIN`: your existing `https://vouchroster.<your-subdomain>.workers.dev` or `https://vouchroster-staging.<your-subdomain>.workers.dev` address (no trailing slash).
- `VOUCHROSTER_EMAIL_FROM`: verified Resend sender, when available.
- `VOUCHROSTER_ADMIN_EMAIL`: initial administrator email, needed only when bootstrapping.

The deployment runner needs a scoped Cloudflare API token through secure build/environment settings: Account Workers Scripts Edit, Account D1 Edit, and Account Settings Read for discovery, scoped to the chosen account. Check the Cloudflare token permission list when creating the token. Do not paste it in chat or commit it. Native Cloudflare builds may provide their own deploy-token binding; verify that it is available to the staging command as `CLOUDFLARE_API_TOKEN`.

For login, add **Worker runtime secret** `RESEND_API_KEY` and runtime variable `EMAIL_FROM` in Cloudflare. A secret bound only to a Codex HTTP proxy or build process does not automatically become a deployed Worker secret. Enter the value directly into the Cloudflare Worker secret settings. Never copy proxy placeholders into deployed secrets. If sender configuration is set through the dashboard, also preserve `VOUCHROSTER_EMAIL_FROM` in build settings so later deployments retain it.

## Execute and verify

1. `npm run staging:prepare` validates supplied IDs/origin and writes the config without changing remote resources.
2. `npm run staging:deploy` applies only versioned staging migrations and deploys the Worker selected by the origin; it does not run the local seed. Public nominations remain paused and the staging page is labeled/noindex.
3. Once the real administrator email and delivery are configured, run `npm run staging:bootstrap`. This records an invited administrator, who must verify their email to activate the account. It does not promote an existing member or replace an existing administrator.
4. Verify homepage/branding, `/api/health`, anonymous `/api/members` rejection, `/api/dev/mail` rejection and the staging noindex header at the real HTTPS origin. Test real login and invitation delivery, then private member behavior. Do not claim these checks passed merely because deployment succeeds.

Public nominations are intentionally paused for this preview. Before enabling real submissions or launching, finish the production requirements in IMPLEMENTATION.md, including administrator MFA, anti-bot protection, moderation/privacy and backup restoration. Unlinking/removing unrelated Cloudflare projects or changing domain DNS is outside this staging setup.
