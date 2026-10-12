import { runCli } from "./cli.ts";

const code = await runCli(process.argv.slice(2));
process.exit(code);
