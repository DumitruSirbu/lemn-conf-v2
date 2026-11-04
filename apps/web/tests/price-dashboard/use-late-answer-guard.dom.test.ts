// @vitest-environment happy-dom
//
// A write's answer belongs to the field it was sent for: the guard says whether the person has moved on since it was sent.
import { describe, expect, it } from "vitest";

import { useLateAnswerGuard } from "@/price-dashboard/use-late-answer-guard";

import { renderHook } from "../support/render-hook";

describe("the late-answer guard", () => {
  it("says a write has not been moved past until the person moves on", () => {
    const hook = renderHook(useLateAnswerGuard);
    const hasMoved = hook.result.current.begin();

    expect(hasMoved()).toBe(false);
    hook.result.current.moveOn();
    expect(hasMoved()).toBe(true);
    hook.unmount();
  });

  it("holds a write sent after the person moved on to the moves that follow it, not the ones before", () => {
    const hook = renderHook(useLateAnswerGuard);
    hook.result.current.moveOn();
    const hasMoved = hook.result.current.begin();

    expect(hasMoved()).toBe(false);
    hook.result.current.moveOn();
    expect(hasMoved()).toBe(true);
    hook.unmount();
  });

  it("answers each write on its own: a move past an earlier write is a move past a later one sent before it", () => {
    const hook = renderHook(useLateAnswerGuard);
    const first = hook.result.current.begin();
    hook.result.current.moveOn();
    const second = hook.result.current.begin();

    expect([first(), second()]).toEqual([true, false]);
    hook.unmount();
  });

  it("keeps its functions through a render, so a callback that depends on them is not rebuilt", () => {
    const hook = renderHook(useLateAnswerGuard);
    const before = hook.result.current;

    hook.rerender();

    expect(hook.result.current).toBe(before);
    hook.unmount();
  });
});
