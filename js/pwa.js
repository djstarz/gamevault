
if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register("./sw.js");
      console.log("GameVault service worker registered:", registration.scope);
    } catch (error) {
      console.error("GameVault service worker registration failed:", error);
    }
  });
}
// Hide GameVault loading screen after page loads
window.addEventListener("load", () => {
  const loader = document.getElementById("gamevault-loader");

  if (loader) {
    setTimeout(() => {
      loader.classList.add("hidden");

      setTimeout(() => {
        loader.remove();
      }, 500);
    }, 700);
  }
});
