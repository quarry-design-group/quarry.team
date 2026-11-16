---
title: "Record architecture decisions"
description: "The next-gen quarry.team is a deliberate departure from the firm's previous, self-managed marketing-site stack. We are making a number of…"
sidebar:
  order: 1
---

<!-- GENERATED from docs/adr/0001-record-architecture-decisions.md — do not edit. Run: pnpm --filter @quarry/docs sync -->

:::note[Mirrored doc]
Source of truth: [`docs/adr/0001-record-architecture-decisions.md`](https://github.com/quarry-design-group/quarry.team/blob/main/docs/adr/0001-record-architecture-decisions.md). Edit there; this page is generated.
:::

- **Status:** Accepted
- **Date:** 2026-06-06
- **Deciders:** Engineering, Design Systems, Platform

## Context

The next-gen `quarry.team` is a deliberate departure from the firm's previous, self-managed marketing-site stack. We are making a number of consequential, interrelated decisions — framework, content model, hosting, infrastructure, analytics — over a short window, and several of them constrain each other.

This repository is public, and prospective clients and engineers will read it. The reasoning behind our choices needs to be durable, discoverable, and honest about trade-offs — not folded into chat threads, tickets, or someone's memory.

We want a lightweight, version-controlled record that lives next to the code, reviews through the same pull-request process, and is cheap enough to write that it actually gets written.

## Decision

We record architecturally significant decisions as **Architecture Decision Records (ADRs)** in a lightweight Nygard-style format (Context / Decision / Consequences / Alternatives), stored as Markdown in `docs/adr/`.

- One decision per file, named `NNNN-kebab-title.md`, where `NNNN` is a zero-padded, monotonically increasing number.
- Each ADR carries a **Status** (`Proposed`, `Accepted`, `Superseded by NNNN`, `Deprecated`), **Context**, **Decision**, **Consequences**, and **Alternatives considered**.
- An `Accepted` ADR is append-only. It takes dated, clearly marked amendment and status notes and in-place version-currency edits (a framework major, a renamed file); its decision text stands as written. A reversal is a new ADR that supersedes the old one, and the old record's status points forward to it.
- ADRs are reviewed in the pull request that introduces or changes the corresponding behavior.
- `docs/adr/README.md` indexes every ADR.

A decision is "architecturally significant" if it is costly to reverse, affects multiple teams or packages, or shapes a cross-cutting property (performance, accessibility, security, SEO, cost).

## Consequences

**Positive**

- The rationale for the stack is legible to new contributors and to outsiders inspecting the repo.
- Decisions are debated once, in writing, in the open.
- Superseded decisions remain readable, so we keep the "why we changed our minds" trail.

**Negative / costs**

- Marginal authoring overhead per significant decision.
- Requires discipline to keep status fields current.

## Alternatives considered

- **A wiki / Notion space.** Drifts from the code, not reviewed through PR, easy to let rot. Rejected for the canonical record (we still use Notion for working docs).
- **Decision log in a single file.** Becomes an unreadable monolith and produces merge conflicts. Rejected.
- **No formal record.** The default. Rejected — it is precisely the discipline this repo is meant to demonstrate.

