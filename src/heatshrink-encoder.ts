/**
 * Heatshrink encoder implementation for heatshrink-ts
 *
 * Produces the same bitstream format that HeatshrinkDecoder reads.
 */

import {
    HS_BACKREF_MARKER,
    HS_LITERAL_MARKER,
    HS_MIN_LOOKAHEAD_BITS,
    HS_MIN_WINDOW_BITS,
    HS_MAX_WINDOW_BITS
} from "./heatshrink-basic";

class BitWriter {
    private buffer: Uint8Array;
    private pos: number = 0;
    private currentByte: number = 0;
    private bitIndex: number = 1 << 7; // MSB-first

    constructor(initialSize: number = 256) {
        this.buffer = new Uint8Array(initialSize);
    }

    writeBits(value: number, count: number) {
        if (count <= 0) return;
        // Write from MSB to LSB of the 'count' bits
        for (let i = count - 1; i >= 0; --i) {
            const bit = (value >> i) & 1;
            if (bit) {
                this.currentByte |= this.bitIndex;
            }
            this.bitIndex >>= 1;
            if (this.bitIndex === 0) {
                this.ensure(1);
                this.buffer[this.pos++] = this.currentByte & 0xff;
                this.currentByte = 0;
                this.bitIndex = 1 << 7;
            }
        }
    }

    writeByte(b: number) {
        this.writeBits(b & 0xff, 8);
    }

    flush(): Uint8Array {
        // if there are remaining bits in currentByte, flush them (pad with zeros)
        if (this.bitIndex !== (1 << 7)) {
            this.ensure(1);
            this.buffer[this.pos++] = this.currentByte & 0xff;
            this.currentByte = 0;
            this.bitIndex = 1 << 7;
        }
        return this.buffer.subarray(0, this.pos);
    }

    private ensure(needed: number) {
        if (this.pos + needed <= this.buffer.length) {
            return;
        }
        let newSize = Math.max(this.buffer.length * 2, this.pos + needed);
        const nb = new Uint8Array(newSize);
        nb.set(this.buffer.subarray(0, this.pos));
        this.buffer = nb;
    }
}

export class HeatshrinkEncoder {
    private windowBits: number;
    private lookaheadBits: number;
    private windowSize: number;
    private lookaheadSize: number;

    constructor(windowBits: number, lookaheadBits: number) {
        if (lookaheadBits >= windowBits) {
            throw new Error("Invalid lookahead must be smaller than window bits");
        }
        if (lookaheadBits <= 0 || windowBits <= 0) {
            throw new Error("windowBits and lookaheadBits must be > 0");
        }
        if (windowBits < HS_MIN_WINDOW_BITS || windowBits > HS_MAX_WINDOW_BITS) {
            throw new Error(`windowBits must be in [${HS_MIN_WINDOW_BITS}, ${HS_MAX_WINDOW_BITS}]`);
        }

        this.windowBits = windowBits;
        this.lookaheadBits = lookaheadBits;
        this.windowSize = 1 << this.windowBits;
        this.lookaheadSize = 1 << this.lookaheadBits;
    }

    /**
     * Compress input and return compressed Uint8Array in heatshrink bitstream format.
     */
    public compress(rawInput: Uint8Array | ArrayBuffer): Uint8Array {
        const input = rawInput instanceof ArrayBuffer ? new Uint8Array(rawInput) : rawInput;
        const writer = new BitWriter(Math.max(256, input.length >> 1));

        const inputLen = input.length;
        let pos = 0;

        while (pos < inputLen) {
            // search window for longest match
            const windowStart = Math.max(0, pos - this.windowSize);
            const maxMatch = Math.min(this.lookaheadSize, inputLen - pos);

            let bestLen = 0;
            let bestOffset = 0;

            // naive search: for each potential start in window
            for (let i = windowStart; i < pos; ++i) {
                if (input[i] !== input[pos]) continue;
                let len = 1;
                while (len < maxMatch && input[i + len] === input[pos + len]) {
                    ++len;
                }
                if (len > bestLen) {
                    bestLen = len;
                    bestOffset = pos - i; // offset > 0
                    if (bestLen === maxMatch) break;
                }
            }

            // Choose threshold for backref. Use backref when length >= 2 (saves bits normally).
            if (bestLen >= 2) {
                // Emit backref tag (0)
                writer.writeBits(HS_BACKREF_MARKER, 1);

                // Decoder expects encoded index = offset - 1, encoded across windowBits bits but split
                const encodedIndex = bestOffset - 1;
                if (this.windowBits > 8) {
                    const msbCount = this.windowBits - 8;
                    const msb = encodedIndex >>> 8;
                    writer.writeBits(msb, msbCount);
                    const lsb = encodedIndex & 0xff;
                    writer.writeBits(lsb, 8);
                } else {
                    writer.writeBits(encodedIndex, this.windowBits);
                }

                // write count: decoder expects encoded count = length - 1 across lookaheadBits
                const encodedCount = bestLen - 1;
                if (this.lookaheadBits > 8) {
                    const msbCount = this.lookaheadBits - 8;
                    const msb = encodedCount >>> 8;
                    writer.writeBits(msb, msbCount);
                    const lsb = encodedCount & 0xff;
                    writer.writeBits(lsb, 8);
                } else {
                    writer.writeBits(encodedCount, this.lookaheadBits);
                }

                pos += bestLen;
            } else {
                // Emit literal: tag 1 then 8-bit literal
                writer.writeBits(HS_LITERAL_MARKER, 1);
                writer.writeByte(input[pos]);
                pos += 1;
            }
        }

        return writer.flush();
    }
}
