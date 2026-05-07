// ═══════════════════════════════════════════════════════════════════════
// Shared Engine Generation & System Config Types
// Used by: Ingestion (writes config), Backend (reads for staleness check)
// ═══════════════════════════════════════════════════════════════════════

export interface SystemConfigRow {
  configKey: string;
  configValue: string;
  updatedAt: string;
  updatedBy: string;
  effectiveAt: string;
}

export interface CursorRow {
  sourceName: string;
  cursorValue: string;
  updatedAt: string;
  lagSeconds: number;
  lastSuccessfulObservationAt: string;
}
