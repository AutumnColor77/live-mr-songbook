let adminPollTimer: number | undefined;

export function stopAdminPolling() {
  if (adminPollTimer !== undefined) {
    window.clearInterval(adminPollTimer);
    adminPollTimer = undefined;
  }
}

export function startAdminPolling(fn: () => void, ms = 4000) {
  stopAdminPolling();
  adminPollTimer = window.setInterval(fn, ms);
}
