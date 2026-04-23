import { describe, it, expect, beforeEach } from "vitest";
import {
  rememberOriginator,
  consumeOriginator,
  resetOriginators,
  __peekOriginatorForTest,
  __sizeForTest,
} from "./backStack";

describe("backStack", () => {
  beforeEach(() => {
    resetOriginators();
  });

  it("consumeOriginator returns null when nothing is stored", () => {
    expect(consumeOriginator("/series")).toBe(null);
  });

  it("remember + consume returns the stored focusKey exactly once", () => {
    rememberOriginator("/series", "SERIES_CARD_42");
    expect(__peekOriginatorForTest("/series")).toBe("SERIES_CARD_42");
    expect(consumeOriginator("/series")).toBe("SERIES_CARD_42");
    expect(consumeOriginator("/series")).toBe(null);
  });

  it("per-route keys are independent", () => {
    rememberOriginator("/series", "SERIES_CARD_A");
    rememberOriginator("/search", "SEARCH_RESULT_SERIES_B");
    expect(consumeOriginator("/series")).toBe("SERIES_CARD_A");
    expect(consumeOriginator("/search")).toBe("SEARCH_RESULT_SERIES_B");
  });

  it("rememberOriginator ignores empty inputs", () => {
    rememberOriginator("", "SERIES_CARD_X");
    rememberOriginator("/series", "");
    expect(__sizeForTest()).toBe(0);
  });

  it("subsequent rememberOriginator calls for the same route overwrite", () => {
    rememberOriginator("/series", "SERIES_CARD_FIRST");
    rememberOriginator("/series", "SERIES_CARD_SECOND");
    expect(consumeOriginator("/series")).toBe("SERIES_CARD_SECOND");
  });

  it("resetOriginators clears every stored entry", () => {
    rememberOriginator("/series", "SERIES_CARD_A");
    rememberOriginator("/search", "SEARCH_RESULT_VOD_B");
    expect(__sizeForTest()).toBe(2);
    resetOriginators();
    expect(__sizeForTest()).toBe(0);
    expect(consumeOriginator("/series")).toBe(null);
    expect(consumeOriginator("/search")).toBe(null);
  });
});
