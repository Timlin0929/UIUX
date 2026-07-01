# UIUX Prototype Workspace

This workspace is a static HTML prototype playground. Edit the individual `.html` files directly; there is no build step or package-based app structure.

## Working rules

- Prefer the nearest prototype file as the source of truth. The main travel flow is centered on [app/ai-travel-planner-v8.html](app/ai-travel-planner-v8.html).
- Keep changes local to the target prototype unless the user explicitly asks for cross-file alignment.
- All app runtime files live in [app/](app/). `ai-travel-planner-v8.html` and `ai-travel-explore-final.html` load their styles/logic from sibling `.css`/`.js` files (e.g. [app/ai-travel-planner-v8.js](app/ai-travel-planner-v8.js), [app/ai-travel-planner-v8.css](app/ai-travel-planner-v8.css)). Edit those external files for CSS/JS changes; the `.html` keeps only markup, CDN/`weather.env.js` script tags, and the Google Maps loader. They are plain `<script src>`/`<link>` (not ES modules) so `file://` still works. Retired prototypes are in [archive/](archive/).
- Preserve the existing no-build, no-framework style. Avoid introducing frameworks, bundlers, or new abstractions unless requested.
- Shared runtime config lives in [app/weather.env.js](app/weather.env.js); use it for local API keys and environment values instead of hardcoding secrets into page markup.
- External services currently used by the prototypes include Firebase and Google Maps. Keep any related script loading and initialization compatible with the existing CDN-based approach.

## Editing guidance

- Work in the smallest file that owns the behavior.
- Keep UI changes consistent with the existing visual language unless the task is explicitly a redesign.
- If a change touches multiple prototype variants, update the most current version first and only backport when needed.

## Validation

- For HTML/CSS/JS changes, verify the edited page renders cleanly and the relevant interactions still work.
- If a script depends on local config, check [weather.env.js](app/weather.env.js) before assuming a missing key is a code bug.

## User-flow testing

After completing a requested change, run one more pass as a real user would: operate the affected feature from the beginning of the flow, not just the edited line of code. Look for user-logic mistakes in state, ordering, preview updates, button behavior, persistence, and edge cases.

When a change affects interactive behavior, test at least:

- A normal, expected user path.
- A boundary case.
- An error-prone case that could expose bad state or ordering.
- Whether preview, summary, and final result areas stay synchronized.
- Whether user-entered values are preserved unless the feature explicitly needs to correct them.
- Whether any automatic correction only triggers when necessary.

For schedule or itinerary-time features, specifically verify:

- Manually changing one stop time still works.
- A later stop time stays unchanged when it is already after the previous stop.
- A later stop is automatically delayed when its time is earlier than the previous stop.
- A later stop is automatically delayed when its time is equal to the previous stop.
- Multiple affected later stops are delayed in order.
- Changing the start time or interval updates the preview logically.
- Leaving and returning to a step keeps the adjusted times reasonable.

Report validation with this shape:

```markdown
## User Flow Test Result

### Summary
Briefly describe the flows tested.

### Issues Found
List each issue with reproduction steps, expected behavior, actual behavior, and the fix. If no issue was found, say so clearly.

### Fixed
List any files and logic changed during the test pass.

### Not Tested / Risk
Call out anything blocked by the local environment, such as browser automation, API keys, localStorage, Firebase, Google Maps, or network access.
```

If a user-logic issue is found during this pass, fix it directly and rerun the related flow before finishing.
