PRAGMA foreign_keys = ON;

-- Production must never execute or advertise the deterministic test provider.
UPDATE shazan_feature_flags_v1
SET enabled=0, updated_by=NULL, updated_at=unixepoch()
WHERE flag_key='ENABLE_DEMO_PROVIDER';

UPDATE shazan_providers_v1
SET enabled=0, updated_by=NULL, updated_at=unixepoch()
WHERE provider_key='mock';

-- Retire any test job that was still holding credits. The existing refund
-- trigger releases its reservation exactly once.
UPDATE shazan_jobs_v1
SET status='cancelled',
    cancelled_at=unixepoch(),
    updated_at=unixepoch(),
    last_error='Legacy test job retired before live launch'
WHERE provider_key='mock' AND status IN ('queued','processing');

-- Old deterministic artifacts stay unavailable through both list and direct
-- asset APIs. Their database records remain as an audit trail.
UPDATE shazan_assets_v1
SET deleted_at=COALESCE(deleted_at, unixepoch())
WHERE source='mock';

-- Convert saved canvas defaults to real live model identifiers without
-- deleting projects or version history.
UPDATE shazan_projects_v1
SET workflow_json=replace(
      replace(
        replace(
          replace(workflow_json, '"mock-image-v1"', '"gpt_image_2"'),
          '"mock-video-v1"', '"seedance_2_0_standard"'
        ),
        '"mock-v1"', '"gpt_image_2"'
      ),
      '"mock"', '"gpt_image_2"'
    ),
    workflow_hash='live-migration-' || lower(hex(randomblob(16))),
    updated_at=unixepoch()
WHERE instr(lower(workflow_json), '"mock')>0;

UPDATE shazan_project_versions_v1
SET workflow_json=replace(
      replace(
        replace(
          replace(workflow_json, '"mock-image-v1"', '"gpt_image_2"'),
          '"mock-video-v1"', '"seedance_2_0_standard"'
        ),
        '"mock-v1"', '"gpt_image_2"'
      ),
      '"mock"', '"gpt_image_2"'
    ),
    workflow_hash='live-migration-' || lower(hex(randomblob(16))),
    reason=CASE WHEN lower(reason) LIKE '%demo%' THEN 'Migrated to live generation' ELSE reason END
WHERE instr(lower(workflow_json), '"mock')>0;

UPDATE shazan_credit_ledger_v1
SET reason='New account welcome credits'
WHERE lower(reason) IN ('new account demo credits','demo seed credits');

-- Preserve the historical seed account for auditability but make login
-- impossible and hide it from production administration views.
UPDATE shazan_auth_users_v2
SET status='suspended', updated_at=unixepoch()
WHERE lower(email)='demo@shazan.ai';
