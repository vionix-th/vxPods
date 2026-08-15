# ADR 0003: Two-Stage Editorial Podcast Generation

Status: Accepted
Date: 2026-08-13

## Context

A single text-generation request had to select source material, infer an episode angle, assign speaker contributions, realize the selected Format and Roles, and emit canonical script JSON. Format and Roles define discourse structure and contribution tendencies, but not the editorial purpose of one episode. The model often optimized for even source coverage and produced an essay divided among speakers.

vxPods must preserve a fast source-to-podcast path while also allowing authors to inspect and steer editorial decisions before script writing.

## Decision

- Insert a validated, source-aware `EpisodePlan` between Podcast inputs and `PodcastScript`.
- Episode direction owns purpose, angle, priorities, depth, and omissions. Format owns discourse and participation structure. Speaker Roles own contribution and delivery tendencies within that Format.
- Quick generation remains the default and makes planner and writer requests consecutively. An optional review control stops after planning.
- Plans are visible and structurally editable in both paths. Users may also request a complete replacement plan through a model revision request.
- A current plan also enables complete-script revision. The model receives writer context, current script, and a session-only revision request; replacement remains subject to canonical schema validation.
- Plans, source text, raw model output, and revision requests remain session-only. They are not stored in render jobs or script exports.
- Planner and writer use the same selected provider and model through the API-neutral text-generation boundary. Every request is independently cancellable.
- A failed writer retains the valid plan and can retry without rerunning planning. Invalid planner output permits one explicit validation-only repair.
- Reusable Episode Direction templates extend settings schema 1 additively. Existing v1 records without the field receive bundled starters; an explicit empty collection remains empty.

## Consequences

- Quick generation uses two provider requests, increasing latency and text-generation cost.
- Editorial selection and spoken realization failures can be inspected independently.
- Source or editorial-input changes can stale a plan and script without destroying either artifact. Stale scripts remain renderable with a warning.
- The workflow controller owns an additional session-only state machine and cancellation boundary.
- Advanced prompt Settings expose planning, writing, and validation-repair layers separately.
- Revision does not modify a recoverable render job. Completed audio stays available and is marked stale when its script is replaced.

## Alternatives considered

- Continue single-stage prompting. Rejected because repeated prompt changes did not reliably separate editorial selection from spoken realization.
- Require plan approval for every generation. Rejected because it conflicts with the fast source-to-podcast job.
- Persist plans for reload recovery. Deferred because it would expand the local privacy and recovery contract for source-derived content.
- Use a separate planner model. Deferred to avoid another provider/model choice and inconsistent capability requirements.

## Rollback considerations

The writer can return to direct source-to-script generation without changing `PodcastScript` or render-job schemas. Episode Direction records can remain inert settings data. No persisted EpisodePlan requires migration or cleanup.
