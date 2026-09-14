import { app, BrowserWindow } from "electron";

const prototypeUrl = "http://127.0.0.1:4173/?variant=B";

function createPrototypeWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: "Invoice creation experience prototype",
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
    },
  });

  void window.loadURL(prototypeUrl);
}

void app.whenReady().then(createPrototypeWindow);

app.on("window-all-closed", () => {
  app.quit();
});
