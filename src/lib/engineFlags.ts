let suppressed = false;

/** After the user stops Docker on purpose, the setup screen must not restart it on its own. */
export const isEngineAutoStartSuppressed = () => suppressed;
export const setEngineAutoStartSuppressed = (value: boolean) => {
  suppressed = value;
};
