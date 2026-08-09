import { describe, expect, it } from 'vitest';
import { inspectJfr, readVarint } from './jfr-binary';

const CHUNK_HEADER_BYTES = 60;

function writeChunkHeader(view: DataView, offset: number, options: {
    major?: number;
    minor?: number;
    chunkSize: number;
    durationNanos: bigint;
}) {
    view.setUint32(offset, 0x464c5200); // "FLR\0"
    view.setUint16(offset + 4, options.major ?? 2);
    view.setUint16(offset + 6, options.minor ?? 1);
    view.setBigUint64(offset + 8, BigInt(options.chunkSize));
    view.setBigUint64(offset + 16, BigInt(0)); // constant pool offset
    view.setBigUint64(offset + 24, BigInt(0)); // metadata offset
    view.setBigUint64(offset + 32, BigInt(0)); // start nanos
    view.setBigUint64(offset + 40, options.durationNanos);
    view.setBigUint64(offset + 48, BigInt(0)); // start ticks
    // ticksPerSecond (u8) would land at offset + 56 in a full 68-byte layout;
    // this fixture keeps the 60-byte layout the inspector reads.
    view.setUint32(offset + 56, 0); // features
}

describe('inspectJfr', () => {
    it('reads version, chunk count and total duration from chunk headers', () => {
        const buffer = new ArrayBuffer(CHUNK_HEADER_BYTES * 2);
        const view = new DataView(buffer);
        writeChunkHeader(view, 0, { chunkSize: CHUNK_HEADER_BYTES, durationNanos: BigInt(5_000_000_000) });
        writeChunkHeader(view, CHUNK_HEADER_BYTES, { chunkSize: CHUNK_HEADER_BYTES, durationNanos: BigInt(2_500_000_000) });

        const info = inspectJfr(buffer)!;
        expect(info.chunks).toHaveLength(2);
        expect(info.chunks[0].versionMajor).toBe(2);
        expect(info.chunks[0].versionMinor).toBe(1);
        expect(info.totalDurationSeconds).toBeCloseTo(7.5);
        expect(info.fileSizeBytes).toBe(120);
        expect(info.truncated).toBe(false);
    });

    it('marks a buffer that ends mid-chunk as truncated', () => {
        const buffer = new ArrayBuffer(CHUNK_HEADER_BYTES + 10);
        const view = new DataView(buffer);
        writeChunkHeader(view, 0, { chunkSize: 1000, durationNanos: BigInt(1_000_000_000) });

        const info = inspectJfr(buffer)!;
        expect(info.chunks).toHaveLength(1);
        expect(info.truncated).toBe(true);
    });

    it('skips event payload bytes between chunk headers', () => {
        const payload = 40;
        const buffer = new ArrayBuffer(CHUNK_HEADER_BYTES * 2 + payload);
        const view = new DataView(buffer);
        writeChunkHeader(view, 0, { chunkSize: CHUNK_HEADER_BYTES + payload, durationNanos: BigInt(1_000_000_000) });
        writeChunkHeader(view, CHUNK_HEADER_BYTES + payload, { chunkSize: CHUNK_HEADER_BYTES, durationNanos: BigInt(1_000_000_000) });

        expect(inspectJfr(buffer)!.chunks).toHaveLength(2);
    });

    it('returns null for non-JFR content', () => {
        expect(inspectJfr(new ArrayBuffer(4))).toBeNull();

        const buffer = new ArrayBuffer(CHUNK_HEADER_BYTES);
        new DataView(buffer).setUint32(0, 0x504b0304); // a zip, not a JFR
        expect(inspectJfr(buffer)).toBeNull();
    });
});

describe('readVarint', () => {
    const bufferOf = (...bytes: number[]) => {
        const view = new DataView(new ArrayBuffer(bytes.length));
        bytes.forEach((b, i) => view.setUint8(i, b));
        return view;
    };

    it('reads single-byte values', () => {
        expect(readVarint(bufferOf(0x05), 0)).toEqual({ value: BigInt(5), next: 1 });
        expect(readVarint(bufferOf(0x7f), 0)).toEqual({ value: BigInt(127), next: 1 });
    });

    it('reads multi-byte values, low 7 bits first', () => {
        expect(readVarint(bufferOf(0x85, 0x01), 0)).toEqual({ value: BigInt(133), next: 2 });
        expect(readVarint(bufferOf(0x80, 0x80, 0x01), 0)).toEqual({ value: BigInt(16384), next: 3 });
    });

    it('reads from a mid-buffer offset', () => {
        expect(readVarint(bufferOf(0xff, 0x05), 1)).toEqual({ value: BigInt(5), next: 2 });
    });
});
