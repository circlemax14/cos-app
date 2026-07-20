/**
 * Small compat shim so v2 components can import BPS_SECTION_ORDER from
 * the local plan-v2 namespace without also pulling the bps-grouping
 * module's UnifiedSectionKey dependency. Re-exports the canonical order
 * defined alongside the grouping helper.
 */
export {
  BPS_SECTION_ORDER,
  bpsDomainToSectionKey,
  sectionKeyToPrimaryDomain,
} from './bps-grouping';
