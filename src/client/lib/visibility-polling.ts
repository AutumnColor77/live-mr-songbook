/** Poll while the tab is visible; pause when hidden and refresh on return. */
export function startVisibilityPolling(
  fn: () => void,
  ms: number,
): () => void {
  let timer: number | undefined;

  const tick = () => {
    if (!document.hidden) fn();
  };

  const arm = () => {
    if (timer !== undefined) window.clearInterval(timer);
    timer = window.setInterval(tick, ms);
  };

  const stop = () => {
    if (timer !== undefined) {
      window.clearInterval(timer);
      timer = undefined;
    }
  };

  const onVisibility = () => {
    if (document.hidden) {
      stop();
      return;
    }
    fn();
    arm();
  };

  document.addEventListener("visibilitychange", onVisibility);
  if (!document.hidden) arm();

  return () => {
    document.removeEventListener("visibilitychange", onVisibility);
    stop();
  };
}
