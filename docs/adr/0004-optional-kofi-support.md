# Optional Ko-fi and crypto support

Status: Accepted, 2026-10-08.

## Context

vxPods is hosted for free and accepts optional one-time/monthly support through Vionix Consulting's Ko-fi account. Application state and provider credentials must remain independent of payments.

## Decision

Use Ko-fi/Crypto tabs in an app-owned native dialog with a click-loaded official Tip Panel iframe, a fixed close header and compact iframe centred within symmetric responsive margins; an external recovery link appears after a ten-second loading delay, and a narrow CSP frame origin. Reuse existing dialog lifecycle; transition out of About before opening Support. Send no source text, provider keys or application identity to Ko-fi and suppress referrer data.

## Consequences

Bundle dependency-free MIT-licensed `qrcode-generator` for local address-only QR codes and use `jsqr` only as an independent development test decoder. Port the approved single icon network selector, supported networks and two-second clipboard feedback from vxTradeJournal. Public wallet addresses remain app-owned; no wallet SDK, backend, persisted-data migration, new origin or privilege model is needed. A hosted QR service was rejected to keep receiving addresses and browser information off another origin. Ko-fi remains default; the owner can roll back the crypto panel without changing app data. Third-party form styling and payment availability remain provider-owned. Delayed embeds can use the external recovery link; no frame event confirms a completed donation.

## Alternatives and rollback

A floating vendor script would run in the parent page and add a separate button/dialog design. A shared hosted page would add another iframe layer. Removing support buttons/module and frame CSP allowance restores the preceding behavior without data conversion.
