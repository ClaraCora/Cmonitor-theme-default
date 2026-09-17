/// <reference types="node" />
import assert from "node:assert/strict"
import { parseTags, RADIX_COLORS } from "./tags.ts"

assert.deepEqual(parseTags("二网精品; 1Gbps<green>; 21日<AMBER>"), [
  { text: "二网精品" },
  { text: "1Gbps", color: "green" },
  { text: "21日", color: "amber" },
])
assert.deepEqual(parseTags("用途<unknown>;;"), [{ text: "用途<unknown>" }])
assert.deepEqual(parseTags("<green>"), [{ text: "<green>" }])
assert.deepEqual(parseTags(undefined), [])
for (const color of RADIX_COLORS) {
  assert.deepEqual(parseTags(`节点<${color}>`), [{ text: "节点", color }])
}
console.log("node tag parsing and Radix color names passed")
