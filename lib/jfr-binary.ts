/**
 * Client-side inspector for binary JFR recordings (Flight Recorder format).
 *
 * Shipped tier: chunk-header inspection — magic, per-chunk version/size,
 * total duration. Event extraction from the binary format (metadata event +
 * constant pools + varint-encoded event payloads) is deliberately NOT
 * shipped: a partial implementation misparses real-world recordings
 * silently, and a wrong number is worse than no number. The UI directs to
 * `jfr print`, whose text output the /jfr page parses reliably.
 *
 * readVarint is the tested groundwork for a future event-extraction tier.
 */

export interface JfrChunk {
    versionMajor: number;
    versionMinor: number;
    chunkSizeBytes: number;
    durationNanos: bigint;
}

export interface JfrFileInfo {
    chunks: JfrChunk[];
    totalDurationSeconds: number;
    fileSizeBytes: number;
    /** True when the buffer ended mid-chunk (partial copy or still-recording file). */
    truncated: boolean;
}

const MAGIC = 0x464c5200; // "FLR\0"
const CHUNK_HEADER_BYTES = 60;

/**
 * Walks the chunk headers of a JFR recording. Returns null when the buffer
 * does not start with the JFR magic bytes.
 */
export function inspectJfr(buffer: ArrayBuffer): JfrFileInfo | null {
    const view = new DataView(buffer);
    if (buffer.byteLength < CHUNK_HEADER_BYTES || view.getUint32(0) !== MAGIC) return null;

    const chunks: JfrChunk[] = [];
    let truncated = false;
    let offset = 0;

    while (offset + CHUNK_HEADER_BYTES <= buffer.byteLength) {
        if (view.getUint32(offset) !== MAGIC) break;
        const chunkSize = view.getBigUint64(offset + 8);
        const chunk: JfrChunk = {
            versionMajor: view.getUint16(offset + 4),
            versionMinor: view.getUint16(offset + 6),
            chunkSizeBytes: Number(chunkSize),
            durationNanos: view.getBigUint64(offset + 40),
        };
        if (chunk.chunkSizeBytes < CHUNK_HEADER_BYTES) break; // corrupt header
        chunks.push(chunk);
        if (offset + chunk.chunkSizeBytes > buffer.byteLength) {
            truncated = true;
            break;
        }
        offset += chunk.chunkSizeBytes;
    }

    const totalNanos = chunks.reduce((sum, c) => sum + c.durationNanos, BigInt(0));
    return {
        chunks,
        totalDurationSeconds: Number(totalNanos) / 1e9,
        fileSizeBytes: buffer.byteLength,
        truncated,
    };
}

/**
 * Reads a JFR variable-length integer (LEB128, low 7 bits first, high bit
 * is the continuation flag; at most 9 bytes). Groundwork for event parsing.
 */
export function readVarint(view: DataView, offset: number): { value: bigint; next: number } {
    let value = BigInt(0);
    let shift = BigInt(0);
    let next = offset;
    for (let i = 0; i < 9; i++) {
        const byte = view.getUint8(next);
        next += 1;
        value |= BigInt(byte & 0x7f) << shift;
        if ((byte & 0x80) === 0) return { value, next };
        shift += BigInt(7);
    }
    return { value, next };
}
