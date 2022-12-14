"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const source_1 = __importDefault(require("got/dist/source"));
const util_1 = __importDefault(require("util"));
const utils_1 = require("./utils");
const prompt_sync_1 = __importDefault(require("prompt-sync"));
// @ts-ignore
const package_json_1 = __importDefault(require("../../package.json"));
require("colors");
const debug = util_1.default.debuglog("app-request");
exports.default = source_1.default.extend({
    hooks: {
        beforeRequest: [
            options => {
                options.headers["user-agent"] = `SMART-On-FHIR Bulk Data Client / ${package_json_1.default.version}`;
            }
        ],
        afterResponse: [
            (response, retryWithMergedOptions) => {
                const { options } = response.request;
                const payload = options.body || options.form || options.json;
                debug("\n=======================================================" +
                    "\n--------------------- Request -------------------------" +
                    "\n%s %s\n%o\n\n%o" +
                    "\n--------------------- Response ------------------------" +
                    "\n%s %s\n%o\n\n%o" +
                    "\n=======================================================", options.method, options.url, options.headers, payload ?? "", response.statusCode, response.statusMessage, response.headers, response.body ?? "");
                // Handle transient errors by asking the user if (s)he wants to
                // retry. Note that this only happens if the "reporter" option
                // is "cli", which implies interactive capabilities. If the
                // reporter is "text", then there may be no way to render a
                // question prompt so transient errors should be handled 
                // downstream by the postprocessing components
                if (options.context?.interactive && response.body && typeof response.body == "object") {
                    // @ts-ignore OperationOutcome errors
                    if (response.body.resourceType === "OperationOutcome") {
                        const oo = response.body;
                        if (oo.issue.every(i => i.code === 'transient')) {
                            let msg = oo.issue.map(i => i.details?.text || i.diagnostics).filter(Boolean);
                            utils_1.print.commit();
                            console.log("The server replied with transient error(s)".red.bold);
                            if (msg) {
                                console.log("- " + msg.join("\n- "));
                            }
                            const answer = process.env.AUTO_RETRY_TRANSIENT_ERRORS || (0, prompt_sync_1.default)()("Would you like to retry? [Y/n]".cyan);
                            if (!answer || answer.toLowerCase() === 'y') {
                                return retryWithMergedOptions(options);
                            }
                            else {
                                (0, utils_1.exit)("Cancelled by user");
                            }
                        }
                    }
                }
                return response;
            }
        ]
    }
});
