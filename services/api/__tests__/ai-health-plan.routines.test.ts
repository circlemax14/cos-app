/**
 * Placeholder for RTL/msw-based routine wrapper tests (COS-475).
 *
 * Design-spec coverage waiting on msw harness:
 *   - listRoutines returns [] when server returns FEATURE_DISABLED
 *   - createRoutine sends Idempotency-Key header
 *   - updateRoutine sends If-Match header
 *   - deleteRoutine hits DELETE without hard=true param
 */
export {};
