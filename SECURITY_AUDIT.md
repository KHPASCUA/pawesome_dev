**Security & RBAC Deep Audit**

Scope
- Inspect authentication, authorization, API exposure, file upload handling, mass-assignment, chatbot privileges, and middleware architecture for the Laravel backend. No changes to auth libraries or config performed — this is documentation only.

Executive summary
- Overall posture: Good — Laravel Sanctum is used, RBAC and middleware exist, and services centralize logic. Key risks are misconfiguration and missing defensive checks that allow privilege escalation, token misuse, and API enumeration. Priority remediation items are listed at the top.

Top priority actions (Do Now — SAFE)
- Harden verification and privileged actions: add service-level authorization checks and `ActivityLog` writes for all payment/booking/inventory flows. (HIGH)
- Validate and centralize token validation and revocation paths; ensure `ApiTokenAuth` respects token expiry and revocation. (HIGH)
- Add rate limiting and stricter throttle middleware on sensitive endpoints (login, payment verify, booking create). (HIGH)

1) Authentication

Severity: HIGH

Findings
- Uses Laravel Sanctum (composer.json, config/sanctum.php) and `PersonalAccessToken` — token creation and lookup exist (see [backend/app/Http/Middleware/ApiTokenAuth.php](backend/app/Http/Middleware/ApiTokenAuth.php) and `AuthController`).
- `ApiTokenAuth` accepts bearer token or `?token=` query param; it resolves tokens via `PersonalAccessToken::findToken()` and sets the authenticated user.

Risks / exploit scenarios
- Token leakage via query-string (`?token=`) in logs, referer, or browser history.
- Missing revocation checks: tokens that are soft-deleted or revoked may still be accepted if not explicitly checked.
- No explicit expiration enforcement visible in middleware (Sanctum supports token expiration metadata; ensure it's enforced).

Recommendations
- Remove acceptance of tokens via URL query parameters or restrict to internal/test-only endpoints. Prefer Authorization header only.
- Verify token revocation/expiration: check `expires_at` or `revoked` flags (or use `PersonalAccessToken::findToken()` plus an explicit expiration check) before setting user.
- Enforce secure cookie flags and CSRF for SPA flows via Sanctum config. Review `config/sanctum.php` for `stateful` domains and cookie settings.
- Add endpoint to list & revoke tokens for an admin or user (with MFA): ensure revocation sets token invalid and is accepted across middleware.

2) Authorization (RBAC)

Severity: HIGH

Findings
- `EnsureRole` middleware enforces role presence but relies on `$user->role` string matching; role normalization is simplistic ([backend/app/Http/Middleware/EnsureRole.php](backend/app/Http/Middleware/EnsureRole.php)).
- Authorization is scattered: controllers may rely on middleware while services sometimes assume callers are authorized (service-level checks vary).

Risks / exploit scenarios
- Role string mutation or unexpected roles could bypass checks (e.g., inconsistent role naming like `vet` vs `veterinary`).
- Services called from CLI, jobs, or other services may execute privileged actions without middleware enforcement.

Recommendations
- Implement Laravel Policies for resource-level authorization and call them in services where critical side-effects occur (payment verify, inventory adjust, mark paid).
- Harden `EnsureRole` mapping and add fallback logging for unknown roles; prefer capabilities/permissions (e.g., `can:approve_payments`) instead of coarse role strings.
- Ensure services enforce authorization when called from non-HTTP contexts (jobs, CLI) by calling Policy checks or a centralized `Gate::forUser($user)->authorize(...)`.

3) API Security & Endpoint Exposure

Severity: MODERATE-HIGH

Findings
- Public endpoints and controllers exist for payment verification, booking, POS, and file uploads. Some controllers accept identifiers and perform cross-model updates.
- Route listing shows `sanctum/csrf-cookie` is exposed (expected), but rate-limiting coverage for sensitive endpoints is not guaranteed.

Risks / exploit scenarios
- Enumeration: endpoints that return user/customer lists or search by email/phone could be abused for enumeration.
- Inconsistent HTTP status codes could leak internal state and be used for fingerprinting.
- Missing throttling on login, verify, and booking endpoints may enable brute-force or automated abuse.

Recommendations
- Add `throttle` middleware to sensitive routes: login, token issuance, payment verify/reject, appointment creation.
- Standardize status codes across controllers (422 for validation, 401 for auth, 403 for forbidden, 500 for server errors). Convert raw exceptions to structured errors with minimal leak.
- Audit public endpoints for PII leakage; redact or require stronger auth for endpoints exposing emails, phone numbers, or invoices.

4) File Upload Security

Severity: HIGH (if upload endpoints accept unvalidated files)

Findings
- Payment proof and other uploads exist (`payment_proof` fields used across services). Upload handling details not centralized.

Risks / exploit scenarios
- MIME type spoofing, executable uploads, public storage exposing uploaded files, improper sanitization of filenames → remote code execution or data exfiltration.

Recommendations
- Validate MIME type server-side and restrict allowed types (images/pdf). Use fileinfo-based checks, not only client-provided content-type.
- Store uploads outside the webroot or use signed temporary URLs for access; ensure uploaded files are not executable.
- Sanitize/normalize filenames and avoid using user-provided names in storage paths. Implement virus scanning for uploaded proofs if possible.

5) Mass Assignment & Validation

Severity: MODERATE

Findings
- Some code uses `forceFill()` (e.g., in `ServiceBillingService::syncServicePaymentState`) and some controllers use model `update()` with `$request->all()` patterns possibly.

Risks / exploit scenarios
- Mass-assignment could allow attackers to set privileged fields (e.g., `is_admin`, `role`, `verified_by`) if `fillable`/`guarded` aren't properly configured.
- `forceFill()` bypasses mass-assignment protection — ensure it's used only in trusted server-side flows with sanitized data.

Recommendations
- Audit all models for `fillable`/`guarded` completeness. Prefer `$request->validated()` and explicit field whitelisting.
- Restrict `forceFill()` usage and document its justification; add code comments and review gates.

6) Chatbot / Assistant Security

Severity: HIGH (if chatbot can trigger side effects)

Findings
- Chatbot integration exists (workflow notifier / chatbot logs). Need to verify the bot cannot call privileged endpoints.

Risks / exploit scenarios
- If the bot has API tokens with elevated scopes or is wired into admin flows, it could approve bookings, verify payments, deduct inventory, or modify users.

Recommendations
- Ensure chatbot tokens are scoped to read-only operations; use separate service accounts for automation with minimal privileges.
- Add an allowlist of actions for chatbot-driven requests; require human confirmation for destructive operations.
- Log all chatbot-initiated actions to `ActivityLog` with `source: chatbot` and perform periodic audits.

7) Middleware Architecture

Severity: MODERATE

Findings
- Middleware aliases in [backend/bootstrap/app.php](backend/bootstrap/app.php) register `auth.api` and `role` mapping to `ApiTokenAuth` and `EnsureRole` respectively.
- `ApiTokenAuth` sets the authenticated user but does not check token revocation/expiry in code.

Risks / exploit scenarios
- Middleware order misconfiguration could allow unauthenticated requests through or skip CSRF/session checks for some routes.

Recommendations
- Review middleware groups and ensure `auth.api` is applied before role-enforcement and rate limiting on sensitive API routes.
- Add explicit revocation/expiry checks in `ApiTokenAuth` (or delegate to Sanctum guard) and remove token-by-query acceptance.

Deliverable: Actionable file list & severity
- HIGH: `backend/app/Http/Middleware/ApiTokenAuth.php`, `backend/app/Http/Controllers/AuthController.php`, `backend/app/Http/Controllers/Api/CashierPaymentController.php`, `backend/app/Services/PaymentVerificationService.php`, upload handlers (search for `payment_proof` fields).
- HIGH: Chatbot-related integrations (workflow notifier, chatbot logs) — ensure tokens and scopes are minimal.
- MODERATE-HIGH: `backend/app/Http/Middleware/EnsureRole.php`, service-layer calls that assume middleware (e.g., `ServiceBillingService`, `InventoryService`).

Safe Remediation Plan (do in order)
1. Add token revocation & expiry checks in `ApiTokenAuth` and remove `?token=` acceptance. (Safe, small change)
2. Audit and centralize upload validation and storage policy. (Safe)
3. Introduce throttling on sensitive endpoints (`throttle:60,1` or stricter). (Safe)
4. Add service-level authorization checks and ensure `ActivityLog` writes inside transactions for privileged state changes. (Safe)
5. Harden chatbot privileges and rotate tokens; introduce allowlist for actions. (Safe)
6. Medium-term: implement Policy classes and migrate authorization into policies called from services.

Notes & constraints
- Do NOT remove or replace Sanctum or modify auth packages without test/staging — document findings first and apply small, reversible hardening changes.

Next steps I can take now
- Produce `SECURITY_AUDIT.md` (this file) and run an automated search for `payment_proof`, `file->store`, `->storeAs(`, `forceFill(` to produce a checklist and suggested patches.
- If you want, I can open targeted PRs for: `ApiTokenAuth` hardening (no query-token, expiry check), rate-limiting wrappers, and centralized upload validation.

-- Security audit generated by GitHub Copilot (GPT-5 mini)
