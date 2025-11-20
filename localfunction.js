// CHANGE BACKGROUND THEME
let themeMode;
window.addEventListener("DOMContentLoaded", () => {
    themeMode = localStorage.getItem("themeMode") === "light";
    applyTheme();
});
function themeSwitch() {
    localStorage.setItem("themeMode", (themeMode = !themeMode) ? "light" : "dark");
    applyTheme();
    logThemeChange();
}
function applyTheme() {
    const m = themeMode ? "lightmode" : "darkmode";
    const r = document.documentElement;
    ["fontcolor-1","fontcolor-2","backgroundcolor-1","backgroundcolor-2","backgroundcolor-3","backgroundcolor-4"]
        .forEach(v => r.style.setProperty(`--${v}`, `var(--${m}-${v})`));
}