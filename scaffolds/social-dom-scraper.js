/**
 * Observes matching feed items and supplies text-only records. It never writes
 * HTML to the page and returns a cleanup function for callers to invoke.
 */
export function observeSocialFeed(selector, onItems) {
  if (typeof selector !== "string" || typeof onItems !== "function") {
    throw new TypeError("selector and onItems callback are required.");
  }
  const seen = new WeakSet();
  const emit = () => {
    const items = [...document.querySelectorAll(selector)]
      .filter((element) => !seen.has(element))
      .map((element) => {
        seen.add(element);
        return { text: element.textContent?.trim() ?? "" };
      });
    if (items.length > 0) onItems(items);
  };
  const observer = new MutationObserver(emit);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  emit();
  return () => observer.disconnect();
}
