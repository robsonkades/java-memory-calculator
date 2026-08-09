import {
    buildJvmFlags,
    calculateMemory,
    ramPercentageFor,
    solveHeapForContainer,
    type GcType,
    type JavaVersion,
    type MemoryInputs,
} from '@/lib/jvm-memory';

/**
 * Sizing as code: GET /api/size
 *
 * Query parameters mirror the calculator URL contract exactly:
 *   v        Java version: 21 | 25            (default 25)
 *   gc       G1 | ZGC | Serial | Parallel     (default G1)
 *   heap     desired heap in MiB              (default 384; heap mode only)
 *   threads  expected platform threads        (default 85)
 *   classes  expected loaded classes          (default 30000)
 *   xss      stack size per thread in MiB     (default 1)
 *   cc       ReservedCodeCacheSize in MiB     (default 64)
 *   dm       MaxDirectMemorySize in MiB       (default 10)
 *   hr       headroom percent                 (default 15)
 *   mode     heap | container                 (default heap)
 *   limit    container limit in Mi            (default 1024; container mode only)
 *
 * 200 → { inputs, breakdown, flags, flagsPercentage, containerLimitMiB, ramPercentage }
 * 400 → { error } for malformed parameters
 * 422 → { error } when mode=container and the limit cannot fit any heap
 *
 * Example: /api/size?heap=384&threads=85&classes=30000 → containerTotal 897.
 * CI usage: fail the pipeline when your manifest limit is below containerLimitMiB.
 */

class BadRequest extends Error {}

function numberParam(params: URLSearchParams, key: string, fallback: number): number {
    const raw = params.get(key);
    if (raw === null) return fallback;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) throw new BadRequest(`Invalid ${key}: "${raw}" (expected a non-negative number)`);
    return n;
}

export async function GET(request: Request) {
    const params = new URL(request.url).searchParams;
    try {
        const versionRaw = params.get('v') ?? '25';
        if (versionRaw !== '21' && versionRaw !== '25') {
            throw new BadRequest(`Invalid v: "${versionRaw}" (expected 21 or 25)`);
        }
        const gcRaw = params.get('gc') ?? 'G1';
        if (gcRaw !== 'G1' && gcRaw !== 'ZGC' && gcRaw !== 'Serial' && gcRaw !== 'Parallel') {
            throw new BadRequest(`Invalid gc: "${gcRaw}" (expected G1, ZGC, Serial or Parallel)`);
        }
        const modeRaw = params.get('mode') ?? 'heap';
        if (modeRaw !== 'heap' && modeRaw !== 'container') {
            throw new BadRequest(`Invalid mode: "${modeRaw}" (expected heap or container)`);
        }

        const shared: Omit<MemoryInputs, 'heapMiB'> = {
            javaVersion: Number(versionRaw) as JavaVersion,
            gcType: gcRaw as GcType,
            threads: numberParam(params, 'threads', 85),
            classes: numberParam(params, 'classes', 30000),
            stackSizeMiB: numberParam(params, 'xss', 1),
            codeCacheMiB: numberParam(params, 'cc', 64),
            directMemoryMiB: numberParam(params, 'dm', 10),
            headroomPercent: numberParam(params, 'hr', 15),
        };

        let inputs: MemoryInputs;
        let containerLimitMiB: number;
        let ramPercentage: number;
        if (modeRaw === 'container') {
            const limit = numberParam(params, 'limit', 1024);
            const solved = solveHeapForContainer(limit, shared);
            if (solved === null) {
                return Response.json(
                    { error: `Container limit ${limit} Mi cannot fit any heap: the fixed overheads plus headroom already exceed it.` },
                    { status: 422 },
                );
            }
            inputs = { ...shared, heapMiB: solved.heapMiB };
            containerLimitMiB = limit;
            ramPercentage = solved.maxRamPercentage;
        } else {
            inputs = { ...shared, heapMiB: numberParam(params, 'heap', 384) };
            containerLimitMiB = calculateMemory(inputs).containerTotal;
            ramPercentage = ramPercentageFor(inputs.heapMiB, containerLimitMiB);
        }

        return Response.json({
            inputs,
            breakdown: calculateMemory(inputs),
            flags: buildJvmFlags(inputs),
            flagsPercentage: buildJvmFlags(inputs, { ramPercentage }),
            containerLimitMiB,
            ramPercentage,
        });
    } catch (error) {
        if (error instanceof BadRequest) {
            return Response.json({ error: error.message }, { status: 400 });
        }
        throw error;
    }
}
