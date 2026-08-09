import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
    title: 'API',
    description: 'Sizing as code: the jvm.expert JSON API. Compute a JVM container memory footprint from CI, gate deployments on it, or embed the result.',
    alternates: { canonical: '/api-docs' },
};

const PARAMS: Array<{ name: string; type: string; def: string; semantics: string }> = [
    { name: 'v', type: '21 | 25', def: '25', semantics: 'Java version the model targets.' },
    { name: 'gc', type: 'G1 | ZGC | Serial | Parallel', def: 'G1', semantics: 'Garbage collector — changes the native GC-structures estimate.' },
    { name: 'mode', type: 'heap | container', def: 'heap', semantics: 'heap: you provide the heap, the API derives the limit. container: you provide the limit, the API solves the largest heap that fits.' },
    { name: 'heap', type: 'number (MiB)', def: '384', semantics: 'Desired heap (-Xmx). Used in heap mode only.' },
    { name: 'limit', type: 'number (Mi)', def: '1024', semantics: 'Container memory limit. Used in container mode only.' },
    { name: 'threads', type: 'number', def: '85', semantics: 'Expected platform threads (stacks are counted as reserved upper bound: threads × xss).' },
    { name: 'classes', type: 'number', def: '30000', semantics: 'Expected loaded classes — drives the metaspace and internals estimates.' },
    { name: 'xss', type: 'number (MiB)', def: '1', semantics: 'Stack size per thread (-Xss).' },
    { name: 'cc', type: 'number (MiB)', def: '64', semantics: 'ReservedCodeCacheSize.' },
    { name: 'dm', type: 'number (MiB)', def: '10', semantics: 'MaxDirectMemorySize.' },
    { name: 'hr', type: 'number (%)', def: '15', semantics: 'Headroom applied on top of the JVM subtotal.' },
];

const EXAMPLE_RESPONSE = `{
  "inputs": {
    "javaVersion": 25, "gcType": "G1", "threads": 85, "classes": 30000,
    "stackSizeMiB": 1, "codeCacheMiB": 64, "directMemoryMiB": 10,
    "headroomPercent": 15, "heapMiB": 384
  },
  "breakdown": {
    "heap": 384, "metaspace": 147, "compressedClassSpace": 44,
    "codeCache": 64, "threadStacks": 85, "directMemory": 10,
    "gcStructures": 20, "jvmInternals": 70,
    "subtotal": 780, "headroom": 117, "containerTotal": 897
  },
  "flags": "-XX:+UseG1GC -Xms384m -Xmx384m -Xss1m -XX:ReservedCodeCacheSize=64m -XX:MaxDirectMemorySize=10m -XX:+ExitOnOutOfMemoryError",
  "flagsPercentage": "-XX:+UseG1GC -XX:InitialRAMPercentage=42.0 -XX:MaxRAMPercentage=42.0 -Xss1m -XX:ReservedCodeCacheSize=64m -XX:MaxDirectMemorySize=10m -XX:+ExitOnOutOfMemoryError",
  "containerLimitMiB": 897,
  "ramPercentage": 42
}`;

const CI_EXAMPLE = `#!/bin/sh
# Fail the pipeline when the manifest limit is below the computed footprint.
LIMIT_MI=$(grep -A2 'limits:' deploy.yaml | grep memory | tr -dc '0-9')
NEEDED_MI=$(curl -sf "https://jvm.expert/api/size?gc=G1&heap=384&threads=200&classes=35000" \\
  | jq '.breakdown.containerTotal')

if [ "$LIMIT_MI" -lt "$NEEDED_MI" ]; then
  echo "deploy.yaml limit \${LIMIT_MI}Mi < computed footprint \${NEEDED_MI}Mi" >&2
  exit 1
fi`;

const preClass = "rounded-lg border bg-surface p-4 overflow-x-auto text-sm font-mono";
const thClass = "py-2 pr-4 font-medium";

export default function ApiDocsPage() {
    return (
        <div className="px-4 py-8 max-w-3xl mx-auto">
            <h1 className="text-2xl font-semibold tracking-tight">API</h1>
            <p className="mt-1 text-sm text-secondary">
                Sizing as code: everything the <Link href="/" className="text-accent hover:underline">calculator</Link>{' '}
                computes, as JSON. No authentication, no state — the same model, the same numbers.
            </p>

            <h2 className="text-lg font-medium mt-8 mb-2">Endpoint</h2>
            <pre className={preClass}>GET /api/size</pre>

            <h2 className="text-lg font-medium mt-8 mb-2">Parameters</h2>
            <p className="text-sm text-secondary mb-3">
                All optional; the defaults mirror the calculator exactly. The parameter names are the same
                ones the calculator keeps in its URL — a shared sizing link and an API call are interchangeable.
            </p>
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-left text-xs uppercase tracking-wide text-secondary border-b">
                            <th className={thClass}>Param</th>
                            <th className={thClass}>Type</th>
                            <th className={thClass}>Default</th>
                            <th className="py-2 font-medium">Semantics</th>
                        </tr>
                    </thead>
                    <tbody>
                        {PARAMS.map((p) => (
                            <tr key={p.name} className="border-b align-top">
                                <td className="py-2 pr-4 font-mono">{p.name}</td>
                                <td className="py-2 pr-4 font-mono text-secondary">{p.type}</td>
                                <td className="py-2 pr-4 font-mono">{p.def}</td>
                                <td className="py-2 text-secondary">{p.semantics}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <h2 className="text-lg font-medium mt-8 mb-2">Response</h2>
            <p className="text-sm text-secondary mb-3">
                <code className="font-mono">200</code> for the reference case (<code className="font-mono">/api/size?heap=384</code> with defaults):
            </p>
            <pre className={preClass}>{EXAMPLE_RESPONSE}</pre>
            <ul className="mt-3 text-sm text-secondary space-y-1 list-disc pl-6">
                <li><code className="font-mono">containerLimitMiB</code> — in heap mode, the recommended limit; in container mode, the limit you passed.</li>
                <li><code className="font-mono">flags</code> vs <code className="font-mono">flagsPercentage</code> — fixed <code className="font-mono">-Xms/-Xmx</code> style and the computed <code className="font-mono">MaxRAMPercentage</code> style (recommended in containers).</li>
                <li><code className="font-mono">400</code> — malformed parameter, <code className="font-mono">{'{ "error": "..." }'}</code>.</li>
                <li><code className="font-mono">422</code> — container mode with a limit too small for any heap.</li>
            </ul>

            <h2 className="text-lg font-medium mt-8 mb-2">Sizing as code</h2>
            <p className="text-sm text-secondary mb-3">
                The intended use: gate a deployment when the manifest limit falls below the computed footprint.
            </p>
            <pre className={preClass}>{CI_EXAMPLE}</pre>

            <p className="mt-8 text-sm text-secondary">
                Want the number as a visual instead? The same query renders as a compact card at{' '}
                <code className="font-mono">/embed?heap=384&amp;gc=G1&amp;...</code> — iframe-friendly and unindexed.
            </p>
        </div>
    );
}
