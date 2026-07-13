# AI Studio Product Blueprint

## North Star
AI Studio is not a wrapper around video APIs. It is a creative operating system that converts an idea into a publishable film, ad, reel, song video, trailer, product clip, or episodic story.

## Product pillars

### 1. Multi-model marketplace
A common interface for video, image, audio, voice, lipsync, upscaling, and editing providers. Every provider implements the same internal contract for create, poll, cancel, retrieve, and estimate-cost operations.

### 2. Director workspace
Projects contain scripts, characters, locations, wardrobe, references, storyboards, shots, generations, edits, versions, and exports. The user works at the project level instead of treating every generation as an isolated prompt.

### 3. Continuity engine
Character identity, wardrobe, color language, camera grammar, location state, weather, time of day, and previous-shot context are stored as reusable production memory. Every shot request receives the relevant context automatically.

### 4. Model router
The system ranks available models for a shot using requested duration, aspect ratio, motion, reference count, audio, style, cost, latency, and historical success. Users may choose manually or use Auto Director.

### 5. Creator economy
Templates, public workflows, remixable projects, creator profiles, team spaces, referrals, subscriptions, prepaid credits, and eventually a marketplace for characters, styles, shot packs, and production recipes.

## Cloudflare architecture

- Pages: web client and public landing pages
- Workers: API gateway, auth, model adapters, webhooks, and admin APIs
- D1: users, workspaces, projects, shots, jobs, pricing, ledger, and audit records
- R2: source uploads, references, thumbnails, generated media, and exports
- Queues: generation submissions, polling, retrieval, moderation, thumbnails, and notifications
- Durable Objects: per-project collaboration state, rate limits, and job coordination where needed
- Analytics Engine / Logpush: product and operational telemetry

## Core entities

- User
- Workspace
- Membership
- Project
- Character
- CharacterVersion
- Location
- Asset
- Storyboard
- Shot
- Generation
- ProviderJob
- CreditAccount
- LedgerEntry
- PriceRule
- Subscription
- Template
- AuditEvent

## Generation lifecycle

1. Validate user and project permissions.
2. Normalize prompt and reference media.
3. Estimate provider cost and platform credits.
4. Reserve credits atomically.
5. Submit to provider and store provider job ID.
6. Poll or receive webhook updates.
7. On success, copy output to R2 before provider URLs expire.
8. Settle credits using actual usage.
9. On failure, release or refund reserved credits.
10. Generate thumbnail, metadata, safety result, and searchable tags.

## Public beta scope

- Authentication
- Project dashboard
- Text-to-video
- Image-to-video
- Reference upload
- Five provider slots with feature flags
- Generation queue and history
- R2 media library
- Character profiles and reference packs
- Credit ledger
- Admin pricing and job controls
- Demo mode when live credentials are unavailable

## Product expansion

- Story-to-shots planner
- Model comparison
- Multi-shot batch generation
- Timeline editor
- Video-to-video and restyle
- Extend and interpolate
- Lipsync, dubbing, music, and sound effects
- Ad generator with product URL ingestion
- Social publishing and campaign variants
- Team approvals and comments
- Public templates and remix marketplace

## Non-negotiables

- Provider keys never reach the browser.
- Credits are calculated and mutated only on the server.
- Every financial mutation is represented by an immutable ledger entry.
- Every generation is idempotent and auditable.
- Temporary provider outputs are copied to owned storage.
- Rate limits, abuse prevention, moderation, and legal takedown workflows exist before open public launch.
- Provider adapters are replaceable so the platform survives model shutdowns and pricing changes.
