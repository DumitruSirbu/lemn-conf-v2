// Registered for every test file by `vitest.config.ts`. The runner moves from one test to the next on
// microtasks alone, so a file of back-to-back synchronous tests is one blocked event loop for the sum
// of them, and past a minute vitest's RPC timeout fails the run (see `yield-to-the-event-loop`).
// Yielding after each test bounds the block to the longest single test.
import { afterEach } from "vitest";

import { yieldToTheEventLoop } from "./yield-to-the-event-loop.js";

afterEach(yieldToTheEventLoop);
