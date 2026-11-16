/// <reference types="node" />
import assert from "node:assert/strict"
import { hasTag, parsePresetTags, parseTags, RADIX_COLORS } from "./tags.ts"

assert.deepEqual(parseTags("二网精品; 1Gbps<green>; 21日<AMBER>"), [
  { text: "二网精品" },
  { text: "1Gbps", color: "green" },
  { text: "21日", color: "amber" },
])
assert.deepEqual(parseTags("用途<unknown>;;"), [{ text: "用途<unknown>" }])
assert.deepEqual(parseTags("<green>"), [{ text: "<green>" }])
assert.deepEqual(parseTags(undefined), [])
assert(hasTag("备用; 游走<green>; 1Gbps", "游走"))
assert(hasTag("游走<AMBER>", " 游走 "))
assert(!hasTag("游走备用;非游走", "游走"), "preset labels never match a substring")
assert(!hasTag("游走<unknown>", "游走"), "unknown color suffixes remain part of the visible label")
assert(!hasTag(undefined, "游走"))
assert(!hasTag("游走", ""))
assert.deepEqual(parsePresetTags(" 游走 ; 主力\r\n备用；游走;; 主力\n "), ["游走", "主力", "备用"])
assert.deepEqual(parsePresetTags("游走"), ["游走"], "single-label settings remain compatible")
assert.deepEqual(parsePresetTags(" ;；\n\r "), [])
assert.deepEqual(parsePresetTags(undefined), [])
assert.deepEqual(parsePresetTags("US;us"), ["US", "us"], "label matching is case sensitive")
for (const color of RADIX_COLORS) {
  assert.deepEqual(parseTags(`节点<${color}>`), [{ text: "节点", color }])
}
console.log("node tag parsing and Radix color names passed")
