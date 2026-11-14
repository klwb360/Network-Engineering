---
name: protocol-course-authoring
description: Add or revise an independent Protocol Explorer lesson in this repository, preserving the pinned original UI and 39-course baseline while checking standards, event data, translations, protocol bytes and browser behavior.
---

# Protocol Explorer 课程制作

Use this skill when the task adds, revises, or maintains a course in this repository. The goal is a runnable, inspectable course that reuses the original visual and interaction style. Read `docs/course-authoring.md` and `docs/runtime-adapter.md` first, then inspect the current files and package scripts.

The repository contains a preserved public production snapshot, not recovered author source. Do not describe minified identifiers, generated vendor code or inferred module boundaries as the original TypeScript project.

## Workflow

1. **Preserve the baseline.** Run `npm run baseline:check`. Keep original assets, all 39 original courses, the 24 original browser assertions and their historical results intact. Put new evidence under `artifacts/`; do not run a script that overwrites `protocol-analysis/` results as a local regression harness.
2. **Check coverage before selecting a topic.** Read the 39-course catalog and relevant existing lessons. Choose an uncovered topic or a clearly deeper treatment, using available topology and codecs where practical. If the user has already chosen the topic, follow that choice.
3. **Verify protocol claims with primary standards.** Read the relevant RFC or official standard sections. State which behavior is required, optional, or a teaching simplification. Retain source URLs in course metadata. Do not invent packet behavior to match a desired animation.
4. **Write the brief.** Define learning objectives, topology, endpoints, observation point, steps, key fields, exception behavior, simulated time and omitted scope. Use the current first course, `app/src/courses/http-cache.mjs`, as a reference for a complete descriptor; check its actual current tests rather than assuming prior success.
5. **Author one independent course.** Copy `app/templates/course.mjs` into `app/src/courses/<id>.mjs`, replace placeholders, and reuse `app/src/authoring/helpers.mjs` where its encoding strategy applies. Keep narration separate from untranslated wire data. Use note events for local actions without network transmission.
6. **Register and translate.** Add the descriptor to `customCourses` in `app/src/courses/registry.mjs`. The descriptor contract is `{lesson,navigation,translations,meta}`. Prefer separate locale files for substantial translations. Existing upstream string translations take precedence; course translations fill missing keys. Keep existing languages functional and allow the documented English fallback for untranslated custom text.
7. **Validate before playback.** Run `npm run courses:check`. Fix schema, unique ID, layer/group, device, route, frame, latency, time, byte-length, metadata and translation issues using the actual validator contract. Do not bypass a failing validation or expand capabilities without implementing the corresponding runtime support.
8. **Verify behavior and knowledge.** Preserve and run the 24 baseline assertions, then add course-specific checks for switching, play, pause/resume, step, speed, replay/reset, shared packet selection, field/hex/ASCII highlighting, translations and mobile layout. Verify actual UI-extracted bytes, lengths, independent checksums and protocol-specific rules as well as rendered text. Run `npm test`, `npm run build`, then `npm run verify:build`; the final command exercises the static `dist/` application, original CSS and all 21 language choices. Record real outcomes and unresolved limitations.
9. **Maintain the workflow.** Update the course brief/metadata, tests, authoring guide and reusable template when the course exposes a missing authoring capability. Keep changes reviewable and explain which original mechanisms were reused and which were extended.

## Runtime rules

- Never hand-edit `app/src/vendor/original-runtime.mjs`. Change the adapter or own modules, then run `npm run prepare:runtime`.
- The original bundle is SHA-256-bound. Unknown snapshot hashes and changed AST hook shapes require a renewed source audit; changing a constant alone does not validate an upgrade.
- Preserve the original CSS, fonts and SVG devices. Add a device, topology route, frame or codec only when the lesson needs it; document the evidence-based hook, update the exposed capabilities, and add tests.
- The current app uses native ES modules and a static server. Do not introduce a framework or replace the renderer merely to add a lesson.
- Register courses once before app boot. The inspector caches encoded frames by lesson object; editing an already-running object in place can leave stale results. Reload during development.
- Use existing node IDs and frame names, valid endpoint routes, and an explicit latency for every communicating endpoint pair.
- Use the AST-derived `frameNodes` and `payloadKinds` capabilities. A known frame must intersect the course's node set, and a payload must use an actual upstream codec branch; arbitrary nested wire objects are not automatically supported.
- Distinguish simulated network timestamps from teaching playback duration. Long waits may be compressed. Do not claim measured latency or traffic capture from scripted data.
- Keep unknown bytes unknown. A 304 has no body; `Content-Length` uses bytes. The current helper accepts ASCII wire text and a fixed no-timestamp, single-segment TCP strategy. A complete TCP payload, including HTTP headers and body, must be at most 1460 bytes; larger messages are rejected until an explicit segmentation strategy is implemented.
- The cache course illustrates real HTTP cache semantics with scripted events; the app does not implement a live browser cache or a simulated origin backend. Do not present local/static delivery as evidence of backend cache correctness.

## Completion

The first reference course was completed on 2026-11-13 with 24/24 baseline browser checks, 29/29 new-course browser checks, 25/25 Node tests, a successful static build and 4/4 build checks covering all 21 language choices. The new-course checks included all 9 UI-extracted frames, byte lengths, IPv4/TCP checksums, all 6 HTTP payloads and the body-free 304. These are historical evidence, not permission to skip verification after subsequent edits; consult the current `artifacts/` results.

Report the selected topic and learning goals, entry files, standards checked, baseline retained, actual tests and build results, screenshots/evidence paths, and material teaching simplifications. Complete the authorized local workflow without inventing additional approval gates. The current project phase defers formal deployment; perform hosting or publication work when that becomes part of the task scope.
