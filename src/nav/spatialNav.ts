// Source: norigin v2.1.0 published type definitions (dist/SpatialNavigation.d.ts)
// Verified options: debug, visualDebug, nativeMode, throttle, throttleKeypresses,
//   useGetBoundingClientRect, shouldFocusDOMNode, shouldUseNativeEvents, rtl.
// NOTE: distanceCalculationMethod is documented in the README but NOT present in the
//   v2.1.0 type definitions — omitted to avoid TS error. shouldFocusDOMNode=true is
//   the critical flag for Playwright focus assertions.
// NOTE: process.env.NODE_ENV is not available in Vite; use import.meta.env.DEV instead.
import { init } from "@noriginmedia/norigin-spatial-navigation";

export function initSpatialNav() {
  init({
    debug: import.meta.env.DEV,
    visualDebug: false,
    // shouldFocusDOMNode=true makes document.activeElement follow norigin's
    // focus target, which is required for Playwright assertions and for native
    // :focus-visible ring styling to fire on each tile.
    shouldFocusDOMNode: true,
  });
}
