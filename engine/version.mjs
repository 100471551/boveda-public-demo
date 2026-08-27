import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export const APPLICATION_VERSION = require("../package.json").version;
