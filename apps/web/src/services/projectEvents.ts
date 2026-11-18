const PROJECTS_CHANGED = 'projects:changed';

/** Tells other parts of the UI (e.g. the sidebar project list) that projects were created, edited or deleted. */
export function notifyProjectsChanged(): void {
  window.dispatchEvent(new Event(PROJECTS_CHANGED));
}

/** Subscribes to project changes; returns the unsubscribe function. */
export function onProjectsChanged(listener: () => void): () => void {
  window.addEventListener(PROJECTS_CHANGED, listener);
  return () => window.removeEventListener(PROJECTS_CHANGED, listener);
}
