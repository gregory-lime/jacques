/**
 * Catalog Module
 *
 * Pre-extracts expensive data from JSONL files into per-project .jacques/
 * directories for fast dashboard loading.
 */

// Types
export type {
  SessionManifest,
  ExtractSessionOptions,
  ExtractSessionResult,
  BulkExtractOptions,
  BulkExtractResult,
  CatalogProgress,
} from "./types.js";

// Single-session extraction
export {
  extractSessionCatalog,
  extractExploreResult,
  extractSearchResults,
  createSessionManifest,
} from "./extractor.js";

// Bulk extraction
export {
  extractProjectCatalog,
  extractAllCatalogs,
} from "./bulk-extractor.js";
