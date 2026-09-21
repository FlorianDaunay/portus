import { create } from "zustand";

/** How much history the dashboard charts keep. */
export const HISTORY_MS = 10 * 60 * 1000;

export interface MetricSample {
  /** When the sample was taken (ms since epoch). */
  t: number;
  /** Share of the host CPU used by running containers, 0-100. */
  cpu: number;
  /** Share of the host memory used by running containers, 0-100. */
  mem: number;
  memUsedMb: number;
  memTotalMb: number;
}

interface MetricsState {
  samples: MetricSample[];
  record: (sample: MetricSample) => void;
}

/** In-memory history of the engine's load, fed by the daemon-info poll in `AppShell`. */
export const useMetrics = create<MetricsState>((set) => ({
  samples: [],
  record: (sample) =>
    set((state) => ({
      samples: [...state.samples.filter((s) => sample.t - s.t <= HISTORY_MS && s.t !== sample.t), sample],
    })),
}));
