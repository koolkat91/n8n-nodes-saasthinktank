# SaaS Think Tank n8n connector

**Lifecycle:** Active — 2026-10-29

## What this is

A community connector for searching and comparing published software research
inside n8n workflows. See [README.md](README.md) for installation and operations.

## How it works

Three read-only operations call SaaS Think Tank's public research service using
n8n's built-in request helper. Only the selected public research parameters are
sent. Results preserve sources, dates, conditions, unknowns and reuse terms.

## How it connects

The public research service supplies released findings. The app-builder guide
provides their wider context. This connector makes that existing public material
available to n8n users; it has no access to private research or website accounts.

## Current status

Version 0.1.0 is published on npm with GitHub Actions source provenance. All three
operations passed tests in self-hosted n8n Community 2.45.5, and the official
published-package scanner passed. One real local AI agent tool call also passed.
The n8n Creator Portal automated review is complete; its manual review is under
way after submission of the installation and operation demo.

## Major decisions

Use one fixed public service address and no runtime dependencies. Link readers to
the existing app-builder guide. Keep the research's own license separate from
the connector's MIT code license.

## Tradeoffs

The narrow public edition is easy to inspect, but it does not cover the whole
publication. Each run depends on the public service being available.

## Known limitations

The current edition contains 16 findings about four products and four questions.
It does not supply current pricing or overall rankings. The AI agent check covers
one Bubble code-export question, not general answer accuracy. n8n Cloud
availability depends on n8n verification, which is still pending.

## Future direction

Await the n8n manual review. Add coverage only after its research is
released publicly and the connector's stated scope can be updated accurately.

## Success criteria

Users can install the public package, run the three operations, inspect sources
and dates, and reach the guide from the published listing.

## Non-goals

Private research access, website editing, user tracking and automatic publishing.
