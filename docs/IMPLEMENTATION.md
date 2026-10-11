# Initial implementation handoff

## Completed locally

The supplied nine-page static site is now in source control alongside a TypeScript Worker, versioned D1 schema, frozen dependency lockfile, migration/seed scripts, integration tests and browser journeys. The Worker serves assets and API under one origin. This first implementation deliberately keeps the visual direction and both product pillars together.

Authentication uses random 256+ bit single-use email links (15-minute login expiry, 24-hour nomination expiry), stores only their SHA-256 hashes, and uses a hashed seven-day HttpOnly SameSite=Strict session. Production session cookies also require Secure. Login responses are uniform for known/unknown addresses. API writes require the configured Origin and JSON content type. Payloads are size-limited; inputs are bounded; queries bind parameters. Rate limits are stored atomically in D1. Administrator endpoints require server-side roles. The private member directory excludes account email; contact details are explicitly opt-in profile fields. Listing fields are allowlisted for public responses. Dynamic DOM content uses textContent and server HTML is escaped. A restrictive script policy, frame denial, no-referrer policy and no-store private responses are applied by the Worker.

Nomination email verification confirms control of the email address, not recommendation truth. Approval requires human investigation and attestation; the operator must record evidence in review notes. The system blocks email-based conflicts, but cannot discover undisclosed relationships. Approving a recommendation does not invite a member, and accepting membership does not publish a recommendation.

Production email delivery has a Resend adapter (`RESEND_API_KEY` secret and verified `EMAIL_FROM` sender). It has not been exercised against a real provider. Production mode rejects the local mailbox and requires a configured HTTPS origin. No provider account, domain ownership, Cloudflare credentials or external deployment was requested or used.

## Before a real pilot

1. Establish the real administrator identity and an independent reviewer for conflicts. Add administrator MFA/step-up verification and safe role provisioning; there is no self-service administrator promotion API. The local-only seed always creates a synthetic administrator, never a production account.
2. Configure separate staging and production D1 databases, bind the correct database IDs, set `ENVIRONMENT=production`, `APP_ORIGIN` to the exact HTTPS origin, disable/remove `LOCAL_MAILBOX`, configure email secrets and verified sender. Choose the domain after ownership/brand checks. Test email delivery, expiry and recovery. Deployment is a separate user-authorized step.
3. Add server-validated Turnstile and deployment-aware abuse controls. The current IP limits provide a local foundation but are not a complete public anti-abuse system.
4. Add member/admin moderation, reporting, content edit/delete and concern workflows, re-review of changed public profiles, publication revocation procedures and reviewer-conflict escalation. The initial admin queue supports approve/decline and suspension; there is no request-more-information state, rich case management or automatic license check integration yet.
5. Establish operator/support and privacy contact details, retention/deletion/export procedures and consent language. The included privacy page explicitly describes a pilot draft; it is not a finalized launch policy. Add scheduled cleanup for expired tokens, sessions, rate-limit rows and unverified submissions after choosing retention rules.
6. Add safe image uploads to R2, file limits/type validation and private/public bucket policy. No uploads, photo editing or attachment features are currently provided.
7. Test backups and restoration, configure observability without private content/token logging, prepare CI and migration/rollback procedures, and run staging security and real-device/accessibility checks. Finish SEO/social metadata for the chosen public domain and keep previews/private routes out of indexing.

Public search has deterministic alphabetical ordering (no paid or referral-based rankings), 20 results per page and Douglas-only publication. The founding member directory is not paginated yet, and the recent conversation/event/admin feeds have bounded limits; add pagination as the founding cohort grows. Events are optional announcements, with local input converted to UTC and displayed in the viewer's local time. There is no attendance or referral tracking.

The business-contact field helps check conflicts but does not implement business ownership verification. Credential checks and publication permission must be independently gathered and recorded. Real names of recommenders are not published in this first version; displaying them later requires separate explicit consent. Public listing changes currently require separate development/admin workflow work; a private member-profile edit never changes the public directory.

## Validation and maintenance

The runtime is pinned by package-lock.json. The compatibility date is 2026-08-01, supported by both installed Wrangler and the integration-test workerd binary. Wrangler state, configuration and logs stay in ignored `.wrangler/`; no system home-directory writes are needed. `npm run setup` is repeatable and retains local records. Existing cloud tasks are isolated: use the existing checkout, and do not create Git worktrees unless the user requests one.

The initial audit and brand reference remain available outside the checkout in the onboarding snapshot. The current project README and tests are authoritative for starting this implementation; the old static Python reference server does not exercise this backend.


## Verified results for this implementation

- TypeScript checking and the Worker bundle build passed.
- All 10 runtime/D1 integration tests passed, including private access and role enforcement, session/token expiry and revocation, secure production cookies, disabled production test mailbox, cross-origin rejection, payload size limits and escaped public HTML.
- Browser journeys passed for invitation acceptance, private profile editing, conversation/reply creation, optional gathering creation, public nomination verification, independent approval, directory search, server-rendered profile display and listing suspension.
- 64 layout checks passed with no document overflow or JavaScript exceptions: eight key pages, four widths (320/375/768/1440) and both themes. The original Standards page overflow is fixed.
- All 14 static pages have resolving local asset/navigation links and no inline event handlers. The local D1 migration/seed path was rerun successfully without resetting data.

These results establish local behavior, not real email delivery, production security completeness, Cloudflare deployment, full accessibility compliance or new-task restoration. Test businesses are explicitly synthetic and have been suspended; the public directory has no invented live endorsements.
