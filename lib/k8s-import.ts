export interface K8sImport {
    /** First memory limit found, in MiB. */
    limitMiB?: number;
    /** JAVA_TOOL_OPTIONS / JDK_JAVA_OPTIONS value, when present. */
    flagsLine?: string;
    /** Container names recognized in the input (best effort). */
    containers: string[];
}

const QUANTITY_RE = /^(\d+(?:\.\d+)?)(Ki|Mi|Gi|Ti|k|M|G|T)?$/;

/** Kubernetes memory quantity ("1Gi", "512Mi", "1024M", plain bytes) → whole MiB. */
export function quantityToMiB(value: string): number | undefined {
    const match = QUANTITY_RE.exec(value.trim());
    if (!match) return undefined;
    const n = Number(match[1]);
    const MI = 1024 * 1024;
    switch (match[2]) {
        case 'Ki': return Math.round(n / 1024);
        case 'Mi': return Math.round(n);
        case 'Gi': return Math.round(n * 1024);
        case 'Ti': return Math.round(n * 1024 * 1024);
        case 'k': return Math.round((n * 1e3) / MI);
        case 'M': return Math.round((n * 1e6) / MI);
        case 'G': return Math.round((n * 1e9) / MI);
        case 'T': return Math.round((n * 1e12) / MI);
        default: return Math.round(n / MI); // plain bytes
    }
}

const ENV_NAMES = ['JAVA_TOOL_OPTIONS', 'JDK_JAVA_OPTIONS'];

function unquote(value: string): string {
    const trimmed = value.trim();
    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
        return trimmed.slice(1, -1);
    }
    return trimmed;
}

/**
 * Extracts the memory limit and JVM options from pasted Deployment/Pod YAML
 * or `kubectl describe pod` output. Line-based, no YAML parser: quoted and
 * plain scalars only (block scalars `|`/`>` for env values are not handled).
 * Returns null when neither a limit nor a flags line is found.
 */
export function parseK8sInput(text: string): K8sImport | null {
    const lines = text.split('\n');
    const containers: string[] = [];
    const limits: number[] = [];
    let flagsLine: string | undefined;

    let inLimitsIndent: number | null = null;
    let inContainersSection = false;
    let containersSectionIndent = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const indent = line.length - line.trimStart().length;
        const trimmed = line.trim();

        // --- YAML: `- name: X` entries; a container has an `image:` in its block,
        // an env entry named JAVA_TOOL_OPTIONS has a `value:` in its block.
        const nameEntry = /^-\s*name:\s*(.+)$/.exec(trimmed);
        if (nameEntry) {
            const name = unquote(nameEntry[1]);
            let isContainer = false;
            let value: string | undefined;
            for (let j = i + 1; j < lines.length; j++) {
                const next = lines[j];
                const nextTrimmed = next.trim();
                if (nextTrimmed === '') continue;
                const nextIndent = next.length - next.trimStart().length;
                if (nextIndent <= indent && nextTrimmed.startsWith('-')) break; // next list entry
                if (nextIndent < indent) break; // block ended
                if (/^image:\s*/.test(nextTrimmed)) isContainer = true;
                const valueMatch = /^value:\s*(.+)$/.exec(nextTrimmed);
                if (valueMatch && value === undefined) value = unquote(valueMatch[1]);
            }
            if (isContainer) containers.push(name);
            if (ENV_NAMES.includes(name) && value !== undefined && flagsLine === undefined) {
                flagsLine = value;
            }
        }

        // --- describe output: container names are `name:` headers right under `Containers:`.
        if (/^Containers:$/.test(trimmed)) {
            inContainersSection = true;
            containersSectionIndent = indent;
            continue;
        }
        if (inContainersSection) {
            if (trimmed !== '' && indent <= containersSectionIndent && !/^Containers:$/.test(trimmed)) {
                inContainersSection = false;
            } else {
                const header = /^([A-Za-z0-9][A-Za-z0-9._-]*):$/.exec(trimmed);
                if (header && indent === containersSectionIndent + 2) containers.push(header[1]);
            }
        }

        // --- memory under a Limits/limits block (YAML and describe share the shape).
        if (/^[Ll]imits:$/.test(trimmed)) {
            inLimitsIndent = indent;
            continue;
        }
        if (inLimitsIndent !== null) {
            if (trimmed === '' || indent <= inLimitsIndent) {
                inLimitsIndent = null;
            } else {
                const memory = /^memory:\s*"?([^"\s]+)"?/.exec(trimmed);
                if (memory) {
                    const mib = quantityToMiB(memory[1]);
                    if (mib !== undefined) limits.push(mib);
                }
            }
        }

        // --- describe output env: `JAVA_TOOL_OPTIONS:  -XX:...`
        if (flagsLine === undefined) {
            const describeEnv = new RegExp(`^(${ENV_NAMES.join('|')}):\\s+(.+)$`).exec(trimmed);
            if (describeEnv) flagsLine = describeEnv[2].trim();
        }
    }

    const limitMiB = limits[0];
    if (limitMiB === undefined && flagsLine === undefined) return null;

    return {
        ...(limitMiB !== undefined && { limitMiB }),
        ...(flagsLine !== undefined && { flagsLine }),
        containers,
    };
}
