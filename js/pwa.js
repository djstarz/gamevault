
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
