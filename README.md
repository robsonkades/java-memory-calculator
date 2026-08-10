# JVM Expert

**[jvm.expert](https://jvm.expert)** is a browser-based toolkit for sizing and diagnosing JVM
memory in containers. Every tool runs client-side: paste the output of a standard JDK command
(`jcmd`, `jstack`, `-Xlog:gc`, `/proc/<pid>/smaps`...) and get a measured breakdown, a
recommendation, and the flags to fix it — no agent, no upload, no server-side storage.

## Tools

| Tool | Route | What it does |
|---|---|---|
| Calculator | `/` | Computes a JVM container memory footprint (heap, metaspace, code cache, thread stacks, direct memory, GC structures, headroom) from either a target heap or a container limit. |
| Start Here | `/start` | Two-question router that lands you on the right tool below. |
| Diagnostics Collector | `/collect` | Generates a shell script that captures NMT, class histogram, thread dump and smaps from a running JVM container. |
| Diagnosis Session | `/diagnose` | Pastes everything the collect script gathered and cross-checks the numbers (heap vs. live set, RSS gap, VM thread count, etc.) into a ticket-ready report. |
| NMT Analyzer | `/nmt` | Parses `jcmd VM.native_memory summary` into a native memory breakdown plus a container limit recommendation. |
| GC Log Analyzer | `/gclog` | Parses a unified GC log (`-Xlog:gc`) into pause statistics, throughput, allocation rate and a live-set-based heap recommendation. |
| Heap Histogram Analyzer | `/histogram` | Parses `jcmd GC.class_histogram` / `jmap -histo` into top heap consumers and estimated Compact Object Headers savings. |
| Thread Dump Analyzer | `/threads` | Parses a `jstack` dump into counts by state/pool and the stack memory implication for sizing. |
| Smaps Analyzer | `/smaps` | Parses `/proc/<pid>/smaps`, `smaps_rollup` or `pmap -x` to show where container RSS actually lives. |
| JFR Analyzer | `/jfr` | Reads a Flight Recorder file (or `jfr print` output) in the browser for a live-set-based heap recommendation. |
| Flags Audit | `/flags` | Audits a JVM flags line for container deployments: removed flags, unsafe defaults, redundant options, missing hygiene. |
| Import from Kubernetes | `/import` | Extracts the memory limit and JVM flags from a pasted Deployment YAML or `kubectl describe` output. |
| Fleet Planner | `/fleet` | Sums container memory limits across a fleet of services from saved calculator scenarios plus manual entries. |
| OOMKilled Runbook | `/runbook` | Interactive incident checklist for exit-code-137 pods, wired to the tool that answers each step. |
| Embed | `/embed` | Compact, iframe-friendly view of a sizing result. |
| API | `/api-docs`, `GET /api/size` | Sizing as code — compute a footprint from CI and gate deployments on it. |
| Guides | `/guides` | Long-form articles on JVM memory, GC choice and native memory diagnostics. |
| Glossary | `/glossary` | The JVM memory vocabulary in one page. |

Deeper technical documentation — the calculation engine, module map and API contract — lives in
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Getting started

Requires Node.js (see `package.json` engines / `.nvmrc` if present) and npm.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start the Next.js dev server. |
| `npm run build` | Production build. |
| `npm start` | Serve the production build. |
| `npm run lint` | ESLint. |
| `npm test` | Unit tests (Vitest) for everything under `lib/`. |
| `npm run test:e2e` | End-to-end tests (Playwright) under `e2e/`, against a server on port 3100. |

## Tech stack

- [Next.js](https://nextjs.org) (App Router) + React, TypeScript
- Tailwind CSS, Geist font
- MDX for guide articles
- Vitest for unit tests, Playwright for end-to-end tests
- PWA: web manifest + service worker for offline use of the calculator
- i18n: English, Portuguese (BR) and Spanish, key-parity checked in tests
- Deployed on Vercel, with [Vercel Analytics](https://vercel.com/analytics)

## Project structure

```
app/            Next.js routes — one directory per tool, plus guides/glossary/runbook content
app/api/size/   GET /api/size — the sizing API
app/components/ Shared UI (nav, footer, theme toggle, etc.)
lib/            Pure TypeScript: parsers, calculators and cross-checks — no React, fully unit-tested
lib/i18n/       Translation dictionaries (en, pt-BR, es) and the i18n hook
lib/__fixtures__/ Real-world command output used by unit and e2e tests
e2e/            Playwright specs, one per tool/flow
public/         Icons, manifest, service worker
```

## Testing

```bash
npm test          # unit tests for lib/
npm run test:e2e  # end-to-end tests against a running dev server
```

Unit tests live next to the module they cover (`lib/*.test.ts`) and run against real captured
output in `lib/__fixtures__/` wherever possible, rather than synthetic data.
