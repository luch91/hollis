try {
  let theme = window.localStorage.getItem("hollis-theme");
  if (theme !== "dark" && theme !== "light") {
    theme = window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }
  document.documentElement.dataset.theme = theme;
} catch {
  // The stylesheet default remains active when browser storage is unavailable.
}
