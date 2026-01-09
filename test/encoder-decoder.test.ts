import { HeatshrinkEncoder } from "../src/heatshrink-encoder";
import { HeatshrinkDecoder } from "../src/heatshrink-decoder";

describe('test-encode-decode', () => {
    const encoder = new HeatshrinkEncoder(12, 4);
    const decoder = new HeatshrinkDecoder(12, 4, 1024);

    const text = "This is a test. This is a test. This is a test.";
    const input = Buffer.from(text, "utf8");
    it('encode and decode', () => {
        const compressed = encoder.compress(input);
        console.log("Compressed bytes:", compressed.byteLength);

        decoder.process(compressed);
        const out = decoder.getOutput();
        expect(Buffer.from(out).toString("utf8")).toEqual(text);
        console.log(Buffer.from(out).toString("utf8"), text);
    });
})
