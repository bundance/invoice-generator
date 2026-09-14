const { resolve } = require("node:path");

const { app } = require("electron");

const cdpPort = readArgument("verification-cdp-port");
const userDataDirectory = readArgument("verification-user-data-directory");

app.commandLine.appendSwitch("remote-debugging-port", cdpPort);
app.commandLine.appendSwitch("user-data-dir", userDataDirectory);
app.setPath("userData", userDataDirectory);
process.stderr.write(`Starting Invoice Generator verification on CDP port ${cdpPort}.\n`);

require(resolve(__dirname, "../../../../dist-electron/main.cjs"));

function readArgument(name) {
  const prefix = `--${name}=`;
  const argument = process.argv.find((value) => value.startsWith(prefix));
  if (!argument) throw new Error(`Missing ${prefix}<value>`);
  return argument.slice(prefix.length);
}
