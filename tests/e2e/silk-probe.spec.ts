import { test, expect } from "@playwright/test";

test.describe("Silk Probe — norigin on WebKit", () => {
  test.use({
    userAgent:
      "Mozilla/5.0 (Linux; Android 9; AFTWMST22) AppleWebKit/537.36 (KHTML, like Gecko) Silk/100 like Chrome/100",
  });

  // FIX: B3 — assertions verify focus actually moves TL→TR→BR→BL→TL.
  // shouldFocusDOMNode=true (set in initSpatialNav) makes document.activeElement
  // follow norigin's internal focus target, which is what Playwright reads.
  test("D-pad moves focus TL → TR → BR → BL → TL", async ({ page }) => {
    await page.goto("/silk-probe");

    // Wait for norigin to mount and initial focus to settle on TL.
    // SilkProbe container calls focusSelf() on mount, which focuses first child.
    await page.waitForFunction(
      () => document.activeElement?.getAttribute("aria-label") === "TL",
      { timeout: 2000 },
    );

    const activeLabel = () =>
      page.evaluate(
        () => document.activeElement?.getAttribute("aria-label") ?? null,
      );

    // TL → TR (ArrowRight)
    await page.keyboard.press("ArrowRight");
    await page.waitForFunction(
      () => document.activeElement?.getAttribute("aria-label") === "TR",
      { timeout: 1000 },
    );
    expect(await activeLabel()).toBe("TR");

    // TR → BR (ArrowDown)
    await page.keyboard.press("ArrowDown");
    await page.waitForFunction(
      () => document.activeElement?.getAttribute("aria-label") === "BR",
      { timeout: 1000 },
    );
    expect(await activeLabel()).toBe("BR");

    // BR → BL (ArrowLeft)
    await page.keyboard.press("ArrowLeft");
    await page.waitForFunction(
      () => document.activeElement?.getAttribute("aria-label") === "BL",
      { timeout: 1000 },
    );
    expect(await activeLabel()).toBe("BL");

    // BL → TL (ArrowUp)
    await page.keyboard.press("ArrowUp");
    await page.waitForFunction(
      () => document.activeElement?.getAttribute("aria-label") === "TL",
      { timeout: 1000 },
    );
    expect(await activeLabel()).toBe("TL");

    const log = await page.locator("pre").textContent();
    console.log("Key log:", log);
    expect(log).toMatch(/key:/);
  });
});
