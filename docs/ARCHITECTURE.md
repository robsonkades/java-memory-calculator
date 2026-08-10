# Architecture

## Design philosophy

jvm.expert is a set of independent, paste-based analyzers, not one integrated pipeline with a
backend. This is deliberate:

- **No agent, no upload.** Every parser runs in the browser. Pasted command output never leaves
  the client except when it is explicitly exported (a report, a URL).
- **The URL is the state.** Calculator inputs are encoded as query parameters (see the API
  contract below) so a sizing result is a link, can be embedded (`/embed`), and can be recomputed
  headlessly via `/api/size`.
- **`lib/` is the product; `app/` is the presentation.** Every parser and calculation is a pure,
  framework-free TypeScript function in `lib/`, unit-tested independently of React. Route
  components in `app/` are thin: collect text input, call into `lib/`, render the result.

## Core calculation engine — `lib/jvm-memory.ts`

`calculateMemory(inputs: MemoryInputs): MemoryBreakdown` is the single source of truth for
container sizing, used by the Calculator, the Fleet Planner, the Diagnosis Session and
`/api/size`. It sums:

| Component | Estimated as |
|---|---|
| Heap | `-Xmx` input, unchanged |
| Metaspace (incl. compressed class space) | `classes × ~5 KiB` |
| Code cache | `-XX:ReservedCodeCacheSize` input |
| Thread stacks | `threads × -Xss` (reserved upper bound, not committed) |
| Direct memory | `-XX:MaxDirectMemorySize` input |
| GC structures | percentage of heap, calibrated per collector (`GC_STRUCTURES_PERCENT`: Serial 1%, Parallel 3%, G1 5%, ZGC 6%) |
| JVM internals | fixed base (40 MiB) + per-class symbol table cost |

`subtotal` sums all of the above; `headroom` applies the configured percentage on top;
`containerTotal` is `subtotal + headroom` — the recommended container memory limit.

Two entry points cover the two ways a service gets sized:

- **Heap-first** (`calculateMemory`): "I want an `-Xmx` of N, what container limit do I need?"
- **Container-first** (`solveHeapForContainer`): "I have a container limit of N, what's the
  largest safe heap?" — solves for heap by binary search against the same model, and also derives
  the `-XX:MaxRAMPercentage` value that reproduces that heap from the container limit.

`buildJvmFlags` turns a `MemoryInputs` (plus an optional `ramPercentage`) into the actual flag
line to paste into a deployment manifest.

## Module map

Each analyzer route has one matching `lib/` module that owns parsing and computation; the route
component only handles input/display.

| `lib/` module | Route(s) | Parses |
|---|---|---|
| `jvm-memory.ts` | `/`, `/fleet`, `/api/size` | (no parsing — the sizing model itself) |
| `scenarios.ts` | `/`, `/fleet` | Saved calculator scenarios (localStorage) |
| `collect.ts` | `/collect` | (no parsing — generates the capture shell script) |
| `diagnose.ts` | `/diagnose` | All of the below, combined, plus cross-tool checks |
| `nmt.ts` | `/nmt` | `jcmd VM.native_memory summary` |
| `gclog.ts` | `/gclog` | Unified GC log (`-Xlog:gc`) |
| `histogram.ts` | `/histogram` | `jcmd GC.class_histogram` / `jmap -histo` |
| `threaddump.ts` | `/threads` | `jstack` thread dump |
| `smaps.ts` | `/smaps` | `/proc/<pid>/smaps`, `smaps_rollup`, `pmap -x` |
| `jfr-binary.ts`, `jfrprint.ts` | `/jfr` | Binary `.jfr` file / `jfr print` text output |
| `flags-audit.ts` | `/flags` | A JVM flags line |
| `k8s-import.ts` | `/import` | Deployment YAML / `kubectl describe` output |
| `report.ts` | `/diagnose`, `/collect` | Renders findings into a shareable text report |
| `guides.ts` | `/guides`, sitemap, RSS feed | Guide index (single source of truth) |
| `i18n/` | all routes | Translation dictionaries and the active-locale hook |

### The collect → diagnose workflow

`/collect` generates a POSIX shell script (`buildCollectScript`) that runs the capture commands
inside the target container — NMT, histogram, thread dump, smaps — guarded so that one disabled
capture (e.g. NMT off) doesn't abort the others. Each captured file can be pasted into its
dedicated single-purpose analyzer (`/nmt`, `/histogram`, `/threads`, `/smaps`), or all of them
together into `/diagnose`, which runs the same parsers and then cross-checks the results —
producing findings no single analyzer can (e.g. heap-vs-live-set drift, the gap between measured
RSS and NMT's reserved total, VM thread count vs. expected pool sizes).

### Import → audit/size workflow

`/import` parses a Kubernetes manifest or `kubectl describe` output (line-based, not a full YAML
parser — block scalars for env values are not handled) to extract the container memory limit and
JVM flags, then routes them into `/flags` (audit) and `/` (calculator) pre-filled.

## API — `GET /api/size`

Sizing as code. Query parameters mirror the calculator's own URL contract exactly, so any sizing
result on the site can be reproduced by the API and vice versa.

| Param | Meaning | Default |
|---|---|---|
| `v` | Java version: `21` \| `25` | `25` |
| `gc` | `G1` \| `ZGC` \| `Serial` \| `Parallel` | `G1` |
| `mode` | `heap` (solve container from heap) \| `container` (solve heap from container) | `heap` |
| `heap` | Desired heap, MiB (`mode=heap` only) | `384` |
| `limit` | Container limit, Mi (`mode=container` only) | `1024` |
| `threads` | Expected platform threads | `85` |
| `classes` | Expected loaded classes | `30000` |
| `xss` | Stack size per thread, MiB | `1` |
| `cc` | `ReservedCodeCacheSize`, MiB | `64` |
| `dm` | `MaxDirectMemorySize`, MiB | `10` |
| `hr` | Headroom, percent | `15` |

Responses:

- `200` → `{ inputs, breakdown, flags, flagsPercentage, containerLimitMiB, ramPercentage }`
- `400` → `{ error }` for a malformed parameter
- `422` → `{ error }` when `mode=container` and the limit can't fit any heap (fixed overheads +
  headroom already exceed it)

Intended CI usage: fail the pipeline when a manifest's memory limit is below the API's
`containerLimitMiB` for that service's flags.

## Internationalization

Three locales — `lib/i18n/en.ts`, `pt-BR.ts`, `es.ts` — each exporting the same key shape.
`lib/i18n/i18n.test.ts` checks key parity across all three so a missing translation fails CI
rather than silently falling back. The active locale is resolved client-side (see
`lib/i18n/index.tsx`) and is independent of the guide articles, which are English-only MDX.

## Rendering, theme and offline use

- Guide articles are MDX (`app/guides/(articles)/*/page.mdx`), rendered through
  `mdx-components.tsx`; `lib/guides.ts` is the single index consumed by the guides listing, the
  sitemap and the RSS feed (`app/feed.xml`).
- Theme (light/dark) is stamped on `<html data-theme>` by an inline script in `app/layout.tsx`
  that runs before first paint, so an explicit user choice never flashes the OS-preferred theme.
- `public/sw.js` + `ServiceWorkerRegistrar` cache the calculator for offline/PWA use;
  `public/site.webmanifest` makes it installable.

## Testing strategy

- **Unit tests** (`lib/*.test.ts`, Vitest) cover parsers and calculators in isolation, and
  wherever possible run against real captured command output in `lib/__fixtures__/` (real GC logs
  for three collectors, a real NMT diff, a real thread dump, a real histogram) rather than
  synthetic fixtures, so a parser change that breaks on real-world formatting is caught.
- **End-to-end tests** (`e2e/*.spec.ts`, Playwright) drive each tool through the browser against a
  dev server on port 3100, plus navigation, theme/PWA behavior and i18n switching.
