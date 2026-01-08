import { HeatshrinkEncoder } from "../src/heatshrink-encoder";
import { HeatshrinkDecoder } from "../src/heatshrink-decoder";
import assert from "assert";

const encoder = new HeatshrinkEncoder(12, 4); // 示例参数
const decoder = new HeatshrinkDecoder(12, 4, 1024);

const text = "This is a test. This is a test. This is a test. Hello heatshrink!";
const input = Buffer.from(text, "utf8");

const compressed = encoder.compress(input);
console.log("Compressed bytes:", compressed.byteLength);

decoder.process(compressed);
const out = decoder.getOutput();
assert.strictEqual(Buffer.from(out).toString("utf8"), text);
console.log("Roundtrip OK");
