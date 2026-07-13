# Assemble the spec

Type: task
Status: closed
Assignee: javierherrera52@gmail.com (session a910411f)
Blocked by: 01, 02, 03, 04, 05, 07, 08, 09, 10

## Question

Consolidate every decision on this map into `spec.md` in the effort directory: architecture (server + frontend, single process), extraction design, API surface, domain model and storage, reader UX, next-chapter flow, failure handling, and explicit non-goals. The spec must be complete enough that implementation can start with no open decisions. Resolving this ticket reaches the map's destination.

## Resolution

Done 2026-07-13: **[spec.md](../spec.md)** consolidates all ten resolved tickets — architecture, extraction (interface, heuristic, errors, next-chapter detection), API surface, domain model, storage, reader UX, image pipeline, failure handling, library screen, and explicit non-goals. Each section links the ticket holding its rationale; vocabulary references /CONTEXT.md; the reader prototype and site research are linked as primary sources. No open decisions remain — implementation can start from the spec alone. This resolution reaches the map's destination.
