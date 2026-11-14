# Working in this repository

Read `README.md` for the app commands and `docs/runtime-adapter.md` for the pinned public-runtime boundary.

For course authoring or maintenance, apply `.agents/skills/protocol-course-authoring/SKILL.md` and follow `docs/course-authoring.md`.

- Preserve the historical `protocol-analysis/` files and `protocol-analysis.zip`. Put new research in new files and new verification outputs under `artifacts/`.
- Do not hand-edit generated `app/src/vendor/original-runtime.mjs` or `dist/`. Course modules, translations, registration and validation belong in the authored modules.
- Unknown upstream hashes require renewed analysis. Do not update a pinned hash merely to suppress a failure.
- Keep wire data and simulated time distinct from interface translations and playback duration.
- Run the checks appropriate to the change. For a new course, use `npm test` and `npm run verify:build`; preserve the 24 baseline browser assertions and add meaningful protocol/interaction checks.
- Formal deployment is a separate task unless the user includes it in the current request. Local development, testing and static builds need no added confirmation flow.
