let adminPollTimer: number | undefined;
let adminVisHandler: (() => void) | undefined;

export function stopAdminPolling() {
  if (adminPollTimer !== undefined) {
    window.clearInterval(adminPollTimer);
    adminPollTimer = undefined;
  }
  if (adminVisHandler) {
    document.removeEventListener("visibilitychange", adminVisHandler);
    adminVisHandler = undefined;
  }
}

/** Poll while the tab is visible; pause when hidden and refresh on return. */
export function startAdminPolling(fn: () => void, ms = 8000) {
  stopAdminPolling();

  const tick = () => {
    if (!document.hidden) fn();
  };

  const arm = () => {
    if (adminPollTimer !== undefined) {
      window.clearInterval(adminPollTimer);
    }
    adminPollTimer = window.setInterval(tick, ms);
  };

  adminVisHandler = () => {
    if (document.hidden) {
      if (adminPollTimer !== undefined) {
        window.clearInterval(adminPollTimer);
        adminPollTimer = undefined;
      }
      return;
    }
    fn();
    arm();
  };

  document.addEventListener("visibilitychange", adminVisHandler);
  if (!document.hidden) arm();
}
