# StreamVault v3 — Known Risks

## KR-01: WAN performance unverified

TTFF targets apply to LAN fixture only (80ms RTT, 20 Mbps, 4× CPU throttle).
Off-LAN deployments should expect TTFF ≥ 4s.
Status: post-MVP. Tracked as v3.1 performance work.

## KR-02: Fire Stick real-device smoke

All perf testing is throttled Chrome until hardware acquired.
If Fire Stick 4K Max not acquired before MVP tag: this entry blocks v3.1 release.
Status: user plans to buy before MVP release.

## KR-03: (reserved — intentionally skipped)

Reserved in v3 plan sequence. No current risk attached.

## KR-04: Dual-HLS memory pressure on Fire TV 4K Max

Phase 5a.7 runs `useHlsPlayer` inside SplitGuide for a live preview alongside
the main PlayerPage `useHlsPlayer`. Fire TV 4K Max has ~1.5 GB app-accessible
RAM; two simultaneous hls.js instances + segment buffers can OOM.

Mitigation (architecture decision — single active player at a time, matching
Apple TV and Roku platform conventions):

1. SplitGuide preview uses `capLevelToPlayerSize: true` on its hls.js config
   to cap the preview rendition to the small preview panel size (not full 1080p).
2. A module-level `ActivePlayer` coordinator (simple React context) ensures
   the SplitGuide preview `.pause()`es whenever PlayerPage mounts, and resumes
   only after PlayerPage unmounts.
3. DoD gate in Task 5a.7 asserts the pause-on-PlayerPage-mount behaviour.

Status: mitigated at design time; verify on real Fire TV hardware in Phase 8
smoke checklist (alongside KR-02). If memory pressure still observed, fall back
to poster-only SplitGuide preview (revert Task 5a.7).
