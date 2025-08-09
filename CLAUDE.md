# CLAUDE Delegation Guide

This file is the single source of truth for the Claude delegate working on Thea-Code. It’s code-free and meant to be used as a living checklist and plan.

## Working Agreement & Comms Protocol

- Roles
  - Engineering delegate (Claude): technical planning, architecture validation, specifications, risk assessment.
  - PM (you): priorities, stakeholder alignment, resource allocation, timelines/approvals.
- Cadence
  - Daily: end-of-day async summary (progress, next-day plan, blockers/decisions).
  - Immediate: escalate blockers within 2 hours of discovery.
  - Weekly: milestone checkpoint (Fridays) with decision log updates.
- Scope guardrails
  - Allowed: planning/specs, test strategy, risk/dependency mapping, rollout criteria.
  - Not allowed: code edits, repo writes, secret handling, deployments.
- Decision log format
  - Fields: Decision ID, Date, Context, Options, Decision, Rationale, Owner, Impact.
  - Change control: scope/timeline-impacting changes require PM approval; log all reversals with rationale.

### Daily Ritual (Delegate)
- [ ] Morning: Post Daily Start (goals, dependencies, risks) in chat.
- [ ] Deliver: Today’s planned artifact (spec, matrix, checklist, brief).
- [ ] Update: Decision Log if any decisions or reversals occurred.
- [ ] Evening: Post EOD Summary (done, deltas, blockers, next-day plan).

## Two-Week Milestone Plan (10 working days)

Week 1 — Foundation
- [ ] Day 1: Neutral Client architecture audit & validation report.
- [ ] Day 2: Neutral Vertex integration touchpoint matrix (auth, transport, streaming, config, telemetry, i18n).
- [ ] Day 3: VS Code extension constraints & capabilities checklist (secrets, state, webviews, cancellation, concurrency).
- [ ] Day 4: SSE communication patterns specification (lifecycle, backpressure, heartbeats, cancellation, buffering).
- [ ] Day 5: Risk & dependency map with mitigations (rate limits, auth flows, connectivity, i18n, telemetry privacy).

Week 2 — Implementation Planning
- [ ] Day 6: Neutral Vertex client API contract specification (prose interfaces, behaviors, events).
- [ ] Day 7: Error handling & telemetry strategy (taxonomy, retries, circuit breaker, metrics/events, privacy posture).
- [ ] Day 8: Test strategy matrix (unit/integration/E2E scenarios, fixtures, mocks, SSE simulation).
- [ ] Day 9: Configuration & feature flag plan (scopes, defaults, migration/back-compat).
- [ ] Day 10: Rollout acceptance criteria & validation checklist (Owner/QA/Docs/i18n readiness).

Notes
- Each day must end with a tangible text artifact checked into docs or shared in chat (spec, matrix, checklist, brief).
- If day slips, document why, impact, and mitigation in Decision Log and adjust plan.

## First Task Detailed Spec — Neutral Vertex Client (TypeScript VS Code Extension)

Problem Statement
- Provide a Vertex AI-backed implementation within the Neutral Client pattern for the extension, supporting auth, region/project/model selection, streaming responses (SSE), telemetry, and robust error handling without leaking provider specifics to callers.

Goals
- Uniform client surface across providers.
- Vertex auth (credentials, project, region) and model capability selection.
- Streaming (SSE) with incremental delivery and cancellation.
- Resilient retries, rate-limit handling, and clear user feedback.
- Telemetry and i18n-aware user-facing errors with privacy safeguards.

Non-Goals
- Exposing raw Vertex APIs to callers.
- Fine-tuning/dataset management.
- Any code changes in this planning phase.

Assumptions
- TypeScript VS Code extension; jest tests; build via tsc/esbuild; i18n infra present; VS Code Secrets API for credentials.

API Contract (Prose)
- Construction: factory accepts credentials/config (project, region, model), timeouts, retry policy.
- Invocation: async call for text/chat completion with prompt, model options, streaming flag; returns response object with content segments, metadata, and finish reason.
- Streaming: event-style delivery of chunks (onStart/onChunk/onError/onComplete); caller can cancel.
- Configuration: set/get for timeouts, retries, model defaults, telemetry opt-in, localized error messages.
- Events/observability: connection status, rate-limit/circuit-breaker state, latency metrics, partial token counts.

Data Flows
1) Extension command → Neutral Client (Vertex adapter) → Auth → Vertex endpoint.
2) Vertex streaming → SSE handler → incremental events → UI render.
3) Errors → classification → retry/backoff or escalation → i18n message → user notification.
4) Metrics → telemetry service → analytics pipeline (privacy-compliant).

Error Handling
- Taxonomy: auth, network, rate-limit, server, client-usage, timeout, malformed-response.
- Retries: exponential backoff with jitter for retryable classes; circuit breaker on persistent failure.
- Rate limits: queue/defer with user feedback and cancel option.
- Auth: short-lived token refresh; credential invalidation path with guided re-auth.
- Malformed/partial: validate stream framing; graceful termination with details.

Telemetry
- Counters: requests, tokens in/out, retries, rate-limit hits, stream duration.
- Timers: time-to-first-token, total latency.
- Errors: categorized with counts; sampling to reduce noise.
- Privacy: no PII payloads; opt-in controls respected; redact prompts by default.

Configuration
- Keys: vertex.project, vertex.region, vertex.model, vertex.timeoutMs, vertex.retryPolicy, vertex.telemetryEnabled, vertex.i18nLocale.
- Scope: user vs workspace; defaults documented; migration notes for future changes.

Feature Flags
- vertex.enable (master), vertex.streaming, vertex.telemetry, vertex.circuitBreaker, vertex.experimentalModels.
- Rollout: progressive enablement with fallbacks.

Testing Strategy (No Code)
- Unit: factory validation, request shaping (headers/auth), response parsing, SSE chunk lifecycle, cancellation.
- Integration: simulated Vertex responses (success, slow-start, mid-stream error), 429 rate-limit, timeouts, auth expiry/refresh.
- Fixtures: textual prompts, templated responses, chunked SSE sequences, error payloads, i18n catalogs.
- Mocks: stubbed transport/SSE source with timed chunks and failures; token provider stub; telemetry sink spy.
- SSE: heartbeat tolerance, backpressure caps, reconnect policies, idempotent resume, cancellation propagation.

Acceptance Checklist (Delegate)
- [ ] API contract matches Neutral Client conventions and VS Code constraints.
- [ ] Error taxonomy + retry/circuit breaker rules specified with flow examples.
- [ ] Streaming lifecycle defined (start/chunk/complete/error) with cancellation.
- [ ] Telemetry events, sampling, and privacy posture specified; opt-in/out documented.
- [ ] Configuration and feature flags enumerated with scopes/defaults/rollout.
- [ ] Test matrix covers happy paths and edge/failure scenarios; fixtures described.

## Decision Log (Append-Only)

| ID | Date | Context | Options | Decision | Rationale | Owner | Impact |
|----|------|---------|---------|----------|-----------|-------|--------|
|    |      |         |         |          |           |       |        |

## How the Delegate Should Consume This File

1) Treat unchecked boxes as the active backlog for your day.
2) When asked “CHECKLIST TODAY”, output only the relevant unchecked items for the current plan day plus the Daily Ritual items.
3) When an item is delivered, state “Marking complete: <item>” in chat; PM will update the file or ask you to provide a short completion note.
4) If you need to change the plan, propose a Decision Log entry and await PM approval.

---

Trigger Phrases for Chat
- “ACK CLAUDE.md”: Acknowledge adoption of this doc as canonical.
- “CHECKLIST TODAY”: Return today’s action checklist (just checkboxes and short bullets).
- “BLOCKER”: Immediately escalate with context, severity, and next steps.
- “EOD SUMMARY”: Send end-of-day summary using the Daily Ritual template.
