// Bridges and globals that the Matrix renderer pages receive from the preload script or from sibling scripts.
interface MatrixPaymentsCatalog {
  labels: Readonly<Record<string, string>>;
  label(method: unknown): string;
  normalize(text: string): string;
}

interface MatrixLogRow {
  id: number;
  at: number;
  kind: string;
  stage: string;
  message: string;
  runId: string;
  level: string;
  elapsedSeconds: number | null;
  stepSeconds: number | null;
}

interface MatrixUpdateStatus {
  ok: boolean;
  currentVersion: string;
  latestVersion?: string;
  available?: boolean;
  updaterAvailable?: boolean;
  installable?: boolean;
  autoUpdate: boolean;
  notes?: string;
  error?: string;
}

interface Window {
  matrixPortal: { open(role: string): unknown };
  matrixServices: { status(refresh: boolean): Promise<{ source: string; roundTripMs: number; clockOffsetMs: number }> };
  matrixLogs?: {
    subscribe(listener: (row: MatrixLogRow) => void): unknown;
    snapshot(): Promise<MatrixLogRow[]>;
    clear(): Promise<unknown>;
  };
  matrixUpdates: {
    check(): Promise<MatrixUpdateStatus>;
    close(): unknown;
    settings(enabled: boolean): Promise<{ ok: boolean; error?: string; enabled?: boolean }>;
    install(): Promise<{ ok: boolean; error?: string }>;
    subscribe(listener: (row: { phase: string; error?: string; percent?: number }) => void): unknown;
  };
  matrixBookingTiming?: { subscribe(listener: (row: { remainingMs?: number | null; active?: boolean; elapsedSeconds?: number }) => void): unknown };
  MATRIX_PAYMENTS?: MatrixPaymentsCatalog;
  MATRIX_BUILD?: { version?: string };
}

// Page-level globals the scripts read through globalThis or as bare identifiers (as the original scripts did).
declare var matrixBookingTiming: Window['matrixBookingTiming'];
declare var MATRIX_PAYMENTS: MatrixPaymentsCatalog | undefined;
declare var MATRIX_BUILD: { version?: string } | undefined;
