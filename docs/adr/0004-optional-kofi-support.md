# Optional Ko-fi support

Status: Accepted, 2026-10-08.

## Context

vxPods is hosted for free and accepts optional one-time/monthly support through Vionix Consulting's Ko-fi account. Application state and provider credentials must remain independent of payments.

## Decision

Use an app-owned native dialog with a click-loaded official Tip Panel iframe, a fixed close header and compact iframe centred within symmetric responsive margins; an external recovery link appears after a ten-second loading delay, and a narrow CSP frame origin. Reuse existing dialog lifecycle; transition out of About before opening Support. Send no source text, provider keys or application identity to Ko-fi and suppress referrer data.

## Consequences

No extra runtime dependency, backend, persisted-data migration, or privilege model is needed. Third-party form styling and payment availability remain provider-owned. Delayed embeds can use the external recovery link; no frame event confirms a completed donation.

## Alternatives and rollback

A floating vendor script would run in the parent page and add a separate button/dialog design. A shared hosted page would add another iframe layer. Removing support buttons/module and frame CSP allowance restores the preceding behavior without data conversion.
