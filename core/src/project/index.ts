/**
 * Project Module
 *
 * Data aggregation for the project dashboard view.
 */

// Types
export type { ProjectStatistics, ProjectSessionItem } from "./types.js";
export { getDefaultStatistics } from "./types.js";

// Aggregator
export {
  aggregateProjectStatistics,
  buildProjectSessionList,
  getProjectPlans,
  readLocalPlanContent,
} from "./aggregator.js";
