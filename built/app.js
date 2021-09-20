"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("colors");
const commander_1 = require("commander");
const path_1 = require("path");
const node_jose_1 = __importDefault(require("node-jose"));
const utils_1 = require("./lib/utils");
const BulkDataClient_1 = __importDefault(require("./lib/BulkDataClient"));
const cli_1 = __importDefault(require("./reporters/cli"));
const text_1 = __importDefault(require("./reporters/text"));
const reporters = {
    cli: cli_1.default,
    text: text_1.default
};
const APP = new commander_1.Command();
APP.name("node .");
APP.version("2.0.0");
// Bulk Data Server base URL
APP.option("-f, --fhir-url [url]", "FHIR server base URL. Must be set either as parameter or in the configuration file.");
APP.option('-F, --_outputFormat [string]', `The output format you expect.`);
APP.option("-s, --_since [date]", "Only include resources modified after this date");
APP.option('-t, --_type [list]', "Zero or more resource types to download. If omitted downloads everything.");
APP.option('-e, --_elements [list]', 'Zero or more FHIR elements to include in the downloaded resources');
APP.option('-p, --patient [list]', 'Zero or more patient IDs to be included. Implies --post');
APP.option('-i, --includeAssociatedData [list]', 'String of comma delimited values. When provided, server with support for the parameter and requested values SHALL return a pre-defined set of metadata associated with the request.');
APP.option('-q, --_typeFilter [string]', 'Experimental _typeFilter parameter passed as is to the server');
APP.option('--global', 'Global (system-level) export');
APP.option('--post', 'Use POST kick-off requests');
APP.option('-g, --group [id]', 'Group ID - only include resources that belong to this group. Ignored if --global is set');
APP.option('--lenient', 'Sets a "Prefer: handling=lenient" request header to tell the server to ignore unsupported parameters');
APP.option('-d, --destination [destination]', 'Download destination. See config/defaults.js for examples');
APP.option("--config <path>", 'Relative path to config file.');
APP.option("--reporter [cli|text]", 'Reporter to use to render the output. "cli" renders fancy progress bars and tables. "text" is better for log files. Defaults to "cli".');
APP.action(async (args) => {
    const { config, ...params } = args;
    if (!config) {
        console.log("A '--config' option is required, specifying the config file to load".red);
        return APP.help();
    }
    const configPath = (0, path_1.resolve)(__dirname, "..", config);
    const defaultsPath = (0, path_1.resolve)(__dirname, "../config/defaults.js");
    const cfg = require(configPath);
    const base = require(defaultsPath);
    const options = { ...base, ...cfg, ...params };
    // Verify fhirUrl ----------------------------------------------------------
    if (!options.fhirUrl) {
        console.log("A 'fhirUrl' is required as configuration option, or as '-f' or " +
            "'--fhir-url' parameter!".red);
        return APP.help();
    }
    options.fhirUrl = options.fhirUrl.replace(/\/*$/, "/");
    // Verify tokenUrl ---------------------------------------------------------
    if (!options.tokenUrl) {
        try {
            options.tokenUrl = await (0, utils_1.detectTokenUrl)(options.fhirUrl);
        }
        catch {
            console.log("Failed to auto-detect 'tokenUrl'! " +
                "Please set it in the config file".red);
            return;
        }
    }
    // Verify privateKey -------------------------------------------------------
    if (options.tokenUrl !== "none") {
        if (!options.privateKey) {
            console.log("A 'privateKey' option must be set in the config file!".red);
            return;
        }
        try {
            options.privateKey = await node_jose_1.default.JWK.asKey(options.privateKey, "json");
        }
        catch {
            console.log("Invalid 'privateKey' option in the config file!".red);
            return;
        }
    }
    // console.log(options)
    const client = new BulkDataClient_1.default(options);
    const reporter = reporters[options.reporter](client);
    process.on("SIGINT", () => {
        console.log("\nExport canceled.".magenta.bold);
        reporter.detach();
        client.abort();
        process.exit(0);
    });
    process.on("uncaughtException", e => (0, utils_1.exit)(e));
    client.on("error", error => {
        console.error(error);
        process.exit(1);
    });
    const statusEndpoint = await client.kickOff();
    const manifest = await client.waitForExport(statusEndpoint);
    const downloads = await client.downloadFiles(manifest);
    // console.log(downloads)
});
async function main() {
    await APP.parseAsync(process.argv);
}
main();
