import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("invoicePdfPrototype", {
  exportDocument: (documentKind) =>
    ipcRenderer.invoke("pdf-prototype:export-document", documentKind),
});
