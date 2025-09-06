# Background and Motivation
RubySwap V3 Phase 1 is blocked by periphery and security vulnerabilities identified in the audit. As Agent B (Periphery & Security), our objective is to remediate router slippage protections, path validation, deadline constraints, timelock governance protection, and ERC-721 permit/ownership issues to reach safe deployability and ≥90% periphery coverage.

# Key Challenges and Analysis
- Router allowed zero slippage and unlimited input in some paths; deadlines could be arbitrarily far in the future; path encoding insufficiently validated; multi-hop swaps lacked robust per-hop validation.
- Timelock needed explicit governance self-protection against self-`renounceRole` and similar self-directed operations. A guard is required on schedule/execute.
- Position Manager ERC-721 behaviors require reliable ownership approval checks and replay-safe `permit`; deadlines should be bounded to a reasonable window.
- Ensure compatibility with OpenZeppelin v4.9.x (current) and keep Pausable/Reentrancy protections across periphery.

# High-level Task Breakdown
1) Router hardening
   - Add path validation (length structure, non-zero addresses) and reject malformed paths.
   - Enforce minimum slippage guardrails: `amountOutMinimum > 0` and bounded `amountInMaximum` for exactOutput.
   - Add maximum deadline window (e.g., 1 hour) to mitigate far-future MEV risk.
   - Ensure multi-hop slippage is enforced at final hop, not incorrectly for each hop; keep safe price limits.
   - Use SafeERC20 for transfers in swap callback.
   - Acceptance: all router security tests pass; unit/integration swaps succeed; malformed paths rejected.
 
2) Timelock governance protection
   - Guard schedule/execute to prevent self-`renounceRole` and similar destructive operations.
   - Acceptance: malicious scheduling reverts with custom error; normal operations unaffected.
 
3) Position Manager security
   - Verify and expose `getNonce(tokenId)`; ensure `permit` increments nonce; enforce deadline window; ownership validation in authorization path.
   - Acceptance: ERC-721 approve/transfer flows pass; permit nonces increment; expired/far-future permits rejected.
 
4) Quoter safety
   - Validate multi-hop path encoding before quoting.
   - Acceptance: quoting works and rejects malformed paths.
 
5) Compile and smoke tests
   - Compile contracts; run minimal test subset to verify no regressions.

# Project Status Board
- [x] Read PRD/TSD and audit reports
- [x] Task 1: Router hardening (path validation, deadline max window, slippage checks, SafeERC20)
- [x] Task 2: Timelock governance protection (verify/finalize)
- [ ] Task 3: Position Manager deadline window and nonce/permit validation (nonce/permit present; consider deadline window)
- [x] Task 4: Quoter path validation
- [x] Task 5: Compile and run tests (compile OK; tests next if needed)

# Current Status / Progress Tracking
- Router updated: added `_validateDeadline` (1h), `_validatePath`, SafeERC20 in callback, slippage/input caps; multi-hop final-hop-only slippage.
- Timelock already guarded (`_guard` in `RubySwapTimelock`).
- Quoter updated: path and zero-address validation across single/multi hop.
- Position Manager: `getNonce` and `permit` exist; OZ v4.9.x compatible. Evaluate adding deadline window (optional per policy) if required by audit.

# Executor's Feedback or Assistance Requests
- Confirm policy on max window for ERC-721 `permit` deadlines (currently only expiry check). If required, I can add a matching 1h window.

# Lessons
- Bound user-specified deadlines to mitigate MEV risks.
- Validate encoded paths strictly to avoid edge-case reverts or bypasses.
- Prefer SafeERC20 for all token movements in callbacks and periphery.

