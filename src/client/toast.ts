export type ToastController = {
  show: (message: string) => void;
};

/** Bind a toast controller to a toast element (or `#toast` under root). */
export function createToast(
  rootOrEl: ParentNode | HTMLElement | string = document,
): ToastController {
  let toastTimer: number | undefined;

  function resolveEl(): HTMLElement | null {
    if (typeof rootOrEl === "string") {
      return document.querySelector(rootOrEl);
    }
    if (rootOrEl instanceof HTMLElement && rootOrEl.id === "toast") {
      return rootOrEl;
    }
    return (rootOrEl as ParentNode).querySelector("#toast");
  }

  return {
    show(message: string) {
      const toast = resolveEl();
      if (!toast) return;
      toast.textContent = message;
      toast.hidden = false;
      window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => {
        toast.hidden = true;
      }, 2400);
    },
  };
}
