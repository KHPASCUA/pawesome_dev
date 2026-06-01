**Database & Transaction Integrity Audit**

Summary
- **Scope**: transactional safety, concurrency/locking, referential integrity, auditability, payment & inventory consistency for the Laravel backend.
- **Note**: No schema or migration files were modified. This file documents findings and non-destructive remediation steps.

Findings

- **HIGH-RISK: Non-atomic payment verification flows**
  - **Affected tables**: `appointments`, `boardings`, `groomings`, `customer_orders`, `service_requests`, `payments`.
  - **Affected files**: [backend/app/Services/PaymentVerificationService.php](backend/app/Services/PaymentVerificationService.php), [backend/app/Http/Controllers/Api/CashierPaymentController.php](backend/app/Http/Controllers/Api/CashierPaymentController.php)
  - **What**: `PaymentVerificationService` uses raw `DB::table(...)->update(...)` and then calls `ServiceBillingService::markBaseServiceAsPaid()` and sends notifications outside a single DB transaction. Controllers often delegate to this service without wrapping the whole flow.
  - **Exploit / Failure scenario**: Update succeeds but downstream billing sync or notification fails (exceptions, network/email failures) → record shows `paid` while service billing totals remain stale → inconsistent balances, inability to reconcile (incorrect `amount_paid`, `balance_due`).
  - **Rollback risk**: Low for single-row updates, but business-state rollback becomes manual (cannot automatically revert side effects like sent emails or partial billing updates).
  - **Recommended fixes (non-destructive first steps)**:
    - Wrap verification/rejection flows in `DB::transaction()` so the status update, billing sync, activity logging, and notifications are logically atomic where possible.
    - Prefer Eloquent model updates (`->save()` on model instances) instead of raw `DB::table()->update()` to trigger model events and consistent timestamp handling.
    - Add `ActivityLog::log()` entries from the verification service (not only controllers) to ensure audit trail regardless of callsite.
    - Add idempotency checks: re-check current `payment_status` inside the transaction before mutating state.

- **HIGH-RISK: Inventory FEFO deduction not fully protected by row-level locks/transactions**
  - **Affected tables**: `inventory_items`, `inventory_batches`, `inventory_logs`.
  - **Affected files**: [backend/app/Services/InventoryService.php](backend/app/Services/InventoryService.php), [backend/app/Models/InventoryItem.php](backend/app/Models/InventoryItem.php), [backend/app/Http/Controllers/Cashier/POSController.php](backend/app/Http/Controllers/Cashier/POSController.php)
  - **What**: `InventoryItem::deductStockFefo()` updates batches and item stock but does not use `DB::transaction()` nor explicit `SELECT ... FOR UPDATE` on batches. `InventoryService::deductStock()` does not always wrap the FEFO path in a transaction; it relies on callers (e.g., POS flow) to open a transaction and lock the item.
  - **Exploit / Failure scenario**: Under concurrency two simultaneous sales may both observe sufficient `stock` and both deduct overlapping batch quantities → negative or incorrect remaining quantities, double-sales, incorrect `inventory_logs` and inconsistent `stock` vs batches.
  - **Rollback risk**: Moderate — fixing requires careful transactional migration and in-production reconciliation (inventory adjustments) for any inconsistent records.
  - **Recommended fixes**:
    - Ensure FEFO deduction is always executed inside a `DB::transaction()` that locks both the `inventory_items` row and the selected `inventory_batches` rows (`lockForUpdate()` / `SELECT ... FOR UPDATE`) before modifying `remaining_quantity`.
    - Add defensive checks after batch updates to assert total batch remaining equals `inventory_items.stock` (monitoring alert when mismatch occurs).
    - Add automated tests simulating concurrent deductions (use parallel test harness) and a reconciliation job that reports mismatches.

- **HIGH-RISK: Slot booking / appointment race conditions (double-booking)**
  - **Affected tables**: `appointments`, `vet_appointments` (if present), `users` (veterinarians)
  - **Affected files**: [backend/app/Services/BookingAvailabilityService.php](backend/app/Services/BookingAvailabilityService.php), [backend/app/Http/Controllers/AppointmentController.php](backend/app/Http/Controllers/AppointmentController.php)
  - **What**: Availability checks use `exists()` queries and the creation of `Appointment::create()` is not wrapped in a locking transaction. No unique index on (veterinarian_id, scheduled_at) was found to enforce uniqueness at DB level.
  - **Exploit / Failure scenario**: Under concurrency two users can both see a free slot and create appointments at the same scheduled time → double-booking and downstream work conflicts.
  - **Rollback risk**: Moderate — to add a DB uniqueness constraint may fail if current data contains duplicates; requires pre-migration cleanup and downtime or careful backfill.
  - **Recommended fixes**:
    - Short-term (non-schema): wrap availability check + create inside a `DB::transaction()` and acquire a lock on the veterinarian or appointment-date indexing row (e.g., `SELECT id FROM users WHERE id = ? FOR UPDATE`) to serialize bookings for the same veterinarian.
    - Medium-term (schema): add a DB- enforced uniqueness index on `(veterinarian_id, scheduled_at)` or a computed time-slot column; plan a migration that identifies and resolves duplicates before applying the constraint.

- **MODERATE-RISK: Late-added foreign keys & potential orphaned rows**
  - **Affected tables / migrations**: `inventory_batches` FK added later ([backend/database/migrations/2026_05_08_000102_add_inventory_batches_foreign_key.php](backend/database/migrations/2026_05_08_000102_add_inventory_batches_foreign_key.php)); several migrations add FKs in separate files.
  - **What**: Foreign keys added after initial data population can leave orphaned child records. The repository contains migrations that add constraints in a second step rather than in the initial `create_...` migration.
  - **Exploit / Failure scenario**: Orphaned batches, logs, or usages remain and later application code assumes referential integrity (e.g., cascade deletes), causing unexpected NULLs or exceptions.
  - **Rollback risk**: High for blind schema enforcement — adding constraints on live data requires cleaning or rejecting broken rows first.
  - **Recommended fixes**:
    - Before any FK-enforcing migration, run a discovery query to identify orphaned child rows and produce a remediation plan (delete or re-link, keep backups).
    - Add pre-migration checks and a safety script that outputs counts and sample rows for manual review.

- **MODERATE-RISK: Inconsistent archival strategy (SoftDeletes vs `archived_at`)**
  - **Affected files/tables**: multiple models use `archived_at` (inventory, pets) while some migrations add `softDeletes()` (e.g., pets migration) — see [backend/app/Models/InventoryItem.php](backend/app/Models/InventoryItem.php) and [backend/database/migrations/2026_05_18_203000_add_birthdate_to_pets_table.php](backend/database/migrations/2026_05_18_203000_add_birthdate_to_pets_table.php).
  - **What**: Mixed patterns make queries brittle (developers check `archived_at` in some controllers instead of relying on `SoftDeletes` scopes) and can cause hidden or duplicated records in lists and reconciliation scripts.
  - **Exploit / Failure scenario**: UI and reports show inconsistent results (archived records displayed where they should be hidden), or accidental permanent deletes when soft-delete patterns are not followed consistently.
  - **Rollback risk**: Low — mostly application-level refactor and standardization; schema changes to adopt `softDeletes()` everywhere require a migration strategy.
  - **Recommended fixes**:
    - Pick a single canonical pattern (prefer Laravel `SoftDeletes` trait for consistent query scoping) and add codemods/tests to migrate controllers/services to use `withTrashed()`/`onlyTrashed()` explicitly when needed.
    - Add developer docs and a repository-level lint rule or code review checklist for archival operations.

- **LOW/MODERATE: Audit logging gaps**
  - **Affected areas**: Payment verification flows, some service-layer changes called directly by background jobs or external callers.
  - **Affected files**: [backend/app/Services/PaymentVerificationService.php](backend/app/Services/PaymentVerificationService.php) (no ActivityLog calls), some controllers call `ActivityLog::log()` but services do not consistently.
  - **What**: Audit entries are created in many controllers and services, but not consistently for centralized services. When a service is invoked outside a controller (CLI, job), the audit trail can be missing.
  - **Exploit / Failure scenario**: Lack of audit trail means harder forensic ability after disputes (who verified payment, when, and from which session/IP).
  - **Recommended fixes**:
    - Ensure every high-impact state change (payment status change, inventory adjustment, billing mark-as-paid) writes a canonical `ActivityLog` entry inside the same transaction as the change.
    - Add automated tests asserting audit log creation and include minimal audit metadata (user id, role, IP when available, request id).

Remediation Roadmap (recommended order)

- Immediate (low-effort, safe)
  - Add transactions around `PaymentVerificationService::verify/reject` flows and include audit logs inside the transaction.
  - Add transactions & explicit batch locking around FEFO deductions inside `InventoryItem::deductStockFefo()` (or wrap in InventoryService) and add assertions/counters for reconciliation.
  - Add idempotency and current-state re-checks inside all verification flows.

- Short term (tests & monitoring)
  - Add concurrency tests for POS/inventory deduction and booking flows.
  - Add a reconciliation job that runs nightly and reports mismatches between `inventory_items.stock` and `SUM(inventory_batches.remaining_quantity)`.
  - Add pre-deployment migration checks for FK additions (scripts that output or fail on orphaned rows).

- Medium term (schema & policy)
  - Add DB-level uniqueness constraints for appointment slots (after backfilling duplicates) or implement a time-slot table to serialize bookings.
  - Consider standardizing archival to Laravel `SoftDeletes` or document explicit `archived_at` policy and add Eloquent scopes accordingly.

Notes on Rollback & Production Safety
- Any schema change that adds constraints (FKs, uniqueness) requires pre-checks and backfill scripts; do not apply without a migration window and data cleanup.
- Behavioral fixes (wrapping in transactions, adding logs) are low-risk and should be deployed first; they will reduce new inconsistencies and make detection easier.

Key files for engineers (quick links)
- [backend/app/Services/PaymentVerificationService.php](backend/app/Services/PaymentVerificationService.php)
- [backend/app/Services/InventoryService.php](backend/app/Services/InventoryService.php)
- [backend/app/Models/InventoryItem.php](backend/app/Models/InventoryItem.php)
- [backend/app/Http/Controllers/Cashier/POSController.php](backend/app/Http/Controllers/Cashier/POSController.php)
- [backend/app/Http/Controllers/Api/CashierPaymentController.php](backend/app/Http/Controllers/Api/CashierPaymentController.php)
- [backend/app/Http/Controllers/AppointmentController.php](backend/app/Http/Controllers/AppointmentController.php)
- [backend/app/Services/BookingAvailabilityService.php](backend/app/Services/BookingAvailabilityService.php)
- Representative migrations: [backend/database/migrations/2026_05_08_000102_add_inventory_batches_foreign_key.php](backend/database/migrations/2026_05_08_000102_add_inventory_batches_foreign_key.php), [backend/database/migrations/2026_04_21_000002_create_payments_table.php](backend/database/migrations/2026_04_21_000002_create_payments_table.php), [backend/database/migrations/2026_05_11_140000_create_service_item_usages_table.php](backend/database/migrations/2026_05_11_140000_create_service_item_usages_table.php)

If you want, I can now:
- Open PR branches with the minimal transactional changes and accompanying unit/integration tests (recommended first step).
- Prepare pre-migration discovery scripts to detect orphaned rows and duplicate appointment slots.

-- Database Audit generated by GitHub Copilot (GPT-5 mini)
