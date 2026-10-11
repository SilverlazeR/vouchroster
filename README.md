# VouchRoster

A free public directory of earned recommendations and a private community for reputable local professionals. Douglas County, Oregon is the only active founding county. Community membership does not automatically create a public endorsement. No fees, paid placement, commissions, referral quotas, attendance tracking, or exclusive industry seats.

## Run locally

Requires Node 22 or newer (Node 24 was verified).

```sh
npm ci --cache /workspace/.npm-cache
npm run setup
npm run dev
```

For ordinary machines, `npm ci` works without a custom cache path. The setup command applies versioned D1 migrations locally and creates one synthetic local administrator: `admin@vouchroster.test`. Re-running setup preserves existing data. It does not create public business listings, deploy anything, or configure a remote database.

The development server binds to `127.0.0.1:8787`. Open the Member Login page, request a link for the synthetic administrator, refresh the clearly labeled local mailbox, and use the link to confirm sign-in. Then open Administrator to invite a synthetic member or review a nomination. Only synthetic data should be used until the production requirements below are complete.

The local mailbox is deliberately available only when `ENVIRONMENT=development`, `LOCAL_MAILBOX=true`, and the request and configured application origin are loopback. Production mode disables it. It holds real authentication links for **local test accounts only**; do not enable it on a public host. No passwords or external email credentials are required locally.

## Working paths

- Public nominations require consent and email verification before entering the review queue.
- Administrators review firsthand basis, disclosures, applicable credential checks, and publication permission before approving a public listing.
- Public directory search filters approved records by name/service/location, category and county. Listing pages are rendered by the Worker with canonical URLs and business structured data.
- Invitations create member accounts, not listings. One-time email links activate invitations and establish HttpOnly sessions. Members can edit private profiles, find members, post/reply to conversations and announce optional gatherings.
- Administrators can suspend membership or a listing and view a basic action log. Suspended members immediately lose API access; suspended listings disappear from search, profile routes and sitemap.
- Known reviewer conflicts (matching recommender or business-contact email) block approval. Other conflicts and credential checks still require human review; the system does not claim to verify professional competence automatically.

## Architecture

One Cloudflare Worker serves the existing branded static assets and same-origin JSON API. This uses Workers Static Assets to keep local frontend/API behavior together; a separate Pages project is not required. D1 contains accounts, hashed single-use tokens and sessions, nominations, listings, discussions, gatherings and review events. No R2 integration or uploads are implemented yet.

`public/` preserves the supplied navy/forest/gold/neutral brand and light/dark modes. Member and admin HTML contain no private records; authenticated APIs supply data and enforce permissions. Prototype preview pages are retained as labeled references with noindex directives. The original repeated page shell remains; extracting shared templates is future maintenance work.

## Verification

```sh
npm run check
```

This runs TypeScript checking, a Worker bundle build, and integration tests against the actual Workers runtime with an isolated D1 database. These tests do not use the development database or send real email.

With the local server running, optional full browser journeys use Python Playwright and Chromium:

```sh
python tests/browser-smoke.py
```

The onboarding machine already provides these browser tools. On other machines install the version in `tests/requirements-browser.txt` and supply `CHROMIUM_PATH` if Chromium is not at `/usr/bin/chromium`. The browser suite creates explicitly synthetic local records, signs in via the test mailbox, verifies an invitation and public nomination, approves/searches/renders a listing, exercises private interactions, checks responsive layouts and themes, then suspends its synthetic listing. If interrupted, suspend any `Synthetic Test Business` listings in the local administrator view before further demonstrations. Reports and screenshots live in ignored `test-results/`.

## Public launch is not configured or authorized

`wrangler.jsonc` intentionally contains a local D1 placeholder and development-only settings. A separate staging deployment script is provided. Do not deploy the local configuration or seed local demo accounts into production.

Before a staging/public launch, follow [the implementation handoff](docs/IMPLEMENTATION.md): real D1 binding, HTTPS origin, secure email delivery, administrator identity and MFA, spam/bot protection, moderation, privacy/support procedures, backup/restore and deployment/rollback validation. Credentials belong in secure settings, never source control or chat. No deployed application or external delivery is claimed by local tests.

## Authorized staging setup

The user has authorized GitHub and Cloudflare staging setup. See [Cloudflare staging instructions](docs/CLOUDFLARE-STAGING.md). The local configuration remains development-only. `staging:prepare` validates real non-secret account/database/origin settings, and `staging:deploy` applies staging migrations and deploys a separate Worker with the local mailbox disabled and public nominations paused. Cloudflare account access and GitHub app consent are prerequisites; there is no claim that they have already been configured.
