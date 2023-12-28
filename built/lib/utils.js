"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fileDownloadDelay = exports.filterResponseHeaders = exports.createDecompressor = exports.exit = exports.ask = exports.generateProgress = exports.fhirInstant = exports.assert = exports.humanFileSize = exports.getAccessTokenExpiration = exports.print = exports.formatDuration = exports.wait = exports.detectTokenUrl = exports.getTokenEndpointFromCapabilityStatement = exports.getTokenEndpointFromWellKnownSmartConfig = exports.getCapabilityStatement = exports.getWellKnownSmartConfig = void 0;
require("colors");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const url_1 = require("url");
const moment_1 = __importDefault(require("moment"));
const prompt_sync_1 = __importDefault(require("prompt-sync"));
const util_1 = __importDefault(require("util"));
const source_1 = require("got/dist/source");
const zlib_1 = __importDefault(require("zlib"));
const request_1 = __importDefault(require("./request"));
const stream_1 = require("stream");
const types_1 = require("util/types");
const debug = util_1.default.debuglog("app");
const HTTP_CACHE = new Map();
/**
 * Given a `baseUrl` fetches a `/.well-known/smart-configuration` statement
 * from the root of the baseUrl. Note that this request is cached by default!
 * @param baseUrl The server base url
 * @param noCache Pass true to disable caching
 */
async function getWellKnownSmartConfig(baseUrl, noCache = false) {
    const url = new url_1.URL("/.well-known/smart-configuration", baseUrl);
    return (0, request_1.default)(url, {
        responseType: "json",
        cache: noCache ? false : HTTP_CACHE
    }).then(x => {
        debug("Fetched .well-known/smart-configuration from %s", url);
        return x;
    }, e => {
        debug("Failed to fetch .well-known/smart-configuration from %s", url, e.response?.statusCode, e.response?.statusMessage);
        throw e;
    });
}
exports.getWellKnownSmartConfig = getWellKnownSmartConfig;
/**
 * Given a `baseUrl` fetches the `CapabilityStatement`. Note that this request
 * is cached by default!
 * @param baseUrl The server base url
 * @param noCache Pass true to disable caching
 */
async function getCapabilityStatement(baseUrl, noCache = false) {
    const url = new url_1.URL("metadata", baseUrl.replace(/\/*$/, "/"));
    return (0, request_1.default)(url, {
        responseType: "json",
        cache: noCache ? false : HTTP_CACHE
    }).then(x => {
        debug("Fetched CapabilityStatement from %s", url);
        return x;
    }, e => {
        debug("Failed to fetch CapabilityStatement from %s", url, e.response?.statusCode, e.response?.statusMessage);
        throw e;
    });
}
exports.getCapabilityStatement = getCapabilityStatement;
async function getTokenEndpointFromWellKnownSmartConfig(baseUrl) {
    const { body } = await getWellKnownSmartConfig(baseUrl);
    return body.token_endpoint || "";
}
exports.getTokenEndpointFromWellKnownSmartConfig = getTokenEndpointFromWellKnownSmartConfig;
async function getTokenEndpointFromCapabilityStatement(baseUrl) {
    const oauthUrisUrl = "http://fhir-registry.smarthealthit.org/StructureDefinition/oauth-uris";
    const { body } = await getCapabilityStatement(baseUrl);
    try {
        // @ts-ignore
        const rest = body.rest.find(x => x.mode === "server");
        // @ts-ignore
        const ext = rest.security.extension.find(x => x.url === oauthUrisUrl).extension;
        // @ts-ignore
        const node = ext.find(x => x.url === "token");
        // @ts-ignore
        return node.valueUri || node.valueUrl || node.valueString || "";
    }
    catch {
        return "";
    }
}
exports.getTokenEndpointFromCapabilityStatement = getTokenEndpointFromCapabilityStatement;
/**
 * Given a FHIR server baseURL, looks up it's `.well-known/smart-configuration`
 * and/or it's `CapabilityStatement` (whichever arrives first) and resolves with
 * the token endpoint as defined there.
 * @param baseUrl The base URL of the FHIR server
 */
async function detectTokenUrl(baseUrl) {
    try {
        const tokenUrl = await Promise.any([
            getTokenEndpointFromWellKnownSmartConfig(baseUrl),
            getTokenEndpointFromCapabilityStatement(baseUrl)
        ]);
        debug("Detected token URL from %s -> %s", baseUrl, tokenUrl);
        return tokenUrl;
    }
    catch {
        debug("Failed to detect token URL for FHIR server at %s", baseUrl);
        return "none";
    }
}
exports.detectTokenUrl = detectTokenUrl;
/**
 * Simple utility for waiting. Returns a promise that will resolve after the
 * given number of milliseconds. The timer can be aborted if an `AbortSignal`
 * is passed as second argument.
 * @param ms Milliseconds to wait
 * @param signal Pass an `AbortSignal` if you want to abort the waiting
 */
function wait(ms, signal) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            if (signal) {
                signal.removeEventListener("abort", abort);
            }
            resolve(void 0);
        }, ms);
        function abort() {
            if (timer) {
                debug("Aborting wait timeout...");
                clearTimeout(timer);
            }
            reject("Waiting aborted");
        }
        if (signal) {
            signal.addEventListener("abort", abort, { once: true });
        }
    });
}
exports.wait = wait;
function formatDuration(ms) {
    let out = [];
    let meta = [
        { n: 1000 * 60 * 60 * 24 * 7, label: "week" },
        { n: 1000 * 60 * 60 * 24, label: "day" },
        { n: 1000 * 60 * 60, label: "hour" },
        { n: 1000 * 60, label: "minute" },
        { n: 1000, label: "second" }
    ];
    meta.reduce((prev, cur, i, all) => {
        let chunk = Math.floor(prev / cur.n); // console.log(chunk)
        if (chunk) {
            out.push(`${chunk} ${cur.label}${chunk > 1 ? "s" : ""}`);
            return prev - chunk * cur.n;
        }
        return prev;
    }, ms);
    if (!out.length) {
        // @ts-ignore
        out.push(`0 ${meta.pop().label}s`);
    }
    if (out.length > 1) {
        let last = out.pop();
        out[out.length - 1] += " and " + last;
    }
    return out.join(", ");
}
exports.formatDuration = formatDuration;
exports.print = (() => {
    let lastLinesLength = 0;
    const _print = (lines = "") => {
        _print.clear();
        lines = Array.isArray(lines) ? lines : [lines];
        process.stdout.write(lines.join("\n") + "\n");
        lastLinesLength = lines.length;
        return _print;
    };
    _print.clear = () => {
        if (lastLinesLength) {
            process.stdout.write("\x1B[" + lastLinesLength + "A\x1B[0G\x1B[0J");
        }
        return _print;
    };
    _print.commit = () => {
        lastLinesLength = 0;
        return _print;
    };
    return _print;
})();
/**
 * Given a token response, computes and returns the expiresAt timestamp.
 * Note that this should only be used immediately after an access token is
 * received, otherwise the computed timestamp will be incorrect.
 */
function getAccessTokenExpiration(tokenResponse) {
    const now = Math.floor(Date.now() / 1000);
    // Option 1 - using the expires_in property of the token response
    if (tokenResponse.expires_in) {
        return now + tokenResponse.expires_in;
    }
    // Option 2 - using the exp property of JWT tokens (must not assume JWT!)
    if (tokenResponse.access_token) {
        let tokenBody = jsonwebtoken_1.default.decode(tokenResponse.access_token);
        if (tokenBody && typeof tokenBody == "object" && tokenBody.exp) {
            return tokenBody.exp;
        }
    }
    // Option 3 - if none of the above worked set this to 5 minutes after now
    return now + 300;
}
exports.getAccessTokenExpiration = getAccessTokenExpiration;
/**
 * Returns the byte size with units
 * @param fileSizeInBytes The size to format
 * @param useBits If true, will divide by 1000 instead of 1024
 */
function humanFileSize(fileSizeInBytes = 0, useBits = false) {
    let i = 0;
    const base = useBits ? 1000 : 1024;
    const units = [' ', ' k', ' M', ' G', ' T', 'P', 'E', 'Z', 'Y'].map(u => {
        return useBits ? u + "b" : u + "B";
    });
    while (fileSizeInBytes > base && i < units.length - 1) {
        fileSizeInBytes = fileSizeInBytes / base;
        i++;
    }
    return Math.max(fileSizeInBytes, 0).toFixed(1) + units[i];
}
exports.humanFileSize = humanFileSize;
function assert(condition, error, ctor = Error) {
    if (!(condition)) {
        if (typeof error === "function") {
            throw new error();
        }
        else {
            throw new ctor(error || "Assertion failed");
        }
    }
}
exports.assert = assert;
function fhirInstant(input) {
    input = String(input || "");
    if (input) {
        const instant = (0, moment_1.default)(new Date(input));
        if (instant.isValid()) {
            return instant.format();
        }
        else {
            throw new Error(`Invalid fhirInstant: ${input}`);
        }
    }
    return "";
}
exports.fhirInstant = fhirInstant;
/**
 * Generates a progress indicator
 * @param pct The percentage
 * @returns
 */
function generateProgress(pct = 0, length = 40) {
    pct = parseFloat(pct + "");
    if (isNaN(pct) || !isFinite(pct)) {
        pct = 0;
    }
    let spinner = "", bold = [], grey = [];
    for (let i = 0; i < length; i++) {
        if (i / length * 100 >= pct) {
            grey.push("▉");
        }
        else {
            bold.push("▉");
        }
    }
    if (bold.length) {
        spinner += bold.join("").bold;
    }
    if (grey.length) {
        spinner += grey.join("").grey;
    }
    return `${spinner} ${pct}%`;
}
exports.generateProgress = generateProgress;
function ask(question) {
    return new Promise(resolve => {
        exports.print.commit();
        process.stdout.write(`${question}: `);
        process.stdin.once("data", data => {
            resolve(String(data).trim());
        });
    });
}
exports.ask = ask;
function exit(arg, details) {
    if (!arg) {
        process.exit();
    }
    if (typeof arg == "number") {
        process.exit(arg);
    }
    exports.print.commit();
    let exitCode = 0;
    if (typeof arg == "string") {
        console.log(arg);
    }
    else {
        if (arg instanceof source_1.HTTPError) {
            const { response, options, request } = arg;
            const requestBody = request?.options.body || request?.options.form;
            let title = "failed to make a request";
            let message = arg.message;
            const props = {
                "request": options.method + " " + options.url,
                "request headers": options.headers
            };
            if (requestBody) {
                props["request body"] = requestBody;
            }
            if (response) {
                title = "received an error from the server";
                props.response = [response.statusCode, response.statusMessage].join(" ");
                props["response headers"] = response.headers;
                if (response?.body && typeof response?.body == "object") {
                    // @ts-ignore OperationOutcome errors
                    if (response.body.resourceType === "OperationOutcome") {
                        const oo = response.body;
                        props.type = "OperationOutcome";
                        props.severity = oo.issue[0].severity;
                        props.code = oo.issue[0].code;
                        props.payload = oo;
                        message = oo.issue[0].details?.text || oo.issue[0].diagnostics || "Unknown error";
                    }
                    // @ts-ignore OAuth errors
                    else if (response.body.error) {
                        props.type = "OAuth Error";
                        props.payload = response.body;
                        // @ts-ignore
                        message = [response.body.error, response.body.error_description].filter(Boolean).join(": ");
                    }
                }
            }
            // @ts-ignore
            process.stdout.write((response?.requestUrl + ": " + String(title + ": ").bold).red);
            exitCode = 1;
            details = props;
            console.log(message.red);
        }
        else if (arg instanceof Error) {
            exitCode = 1;
            console.log(arg.message.red);
            details = { ...details, ...arg };
        }
    }
    if (details) {
        const answer = process.env.SHOW_ERRORS || (0, prompt_sync_1.default)()("Would you like to see error details [y/N]? ".cyan);
        if (answer.toLowerCase() == "y") {
            for (const prop in details) {
                console.log(prop.bold + ":", details[prop]);
            }
        }
    }
    process.exit(exitCode);
}
exports.exit = exit;
function createDecompressor(res) {
    switch (res.headers["content-encoding"]) {
        case "gzip": return zlib_1.default.createGunzip();
        case "deflate": return zlib_1.default.createInflate();
        case "br": return zlib_1.default.createBrotliDecompress();
        // Even if there is no compression we need to convert from stream of
        // bytes to stream of string objects
        default: return new stream_1.Transform({
            readableObjectMode: false,
            writableObjectMode: true,
            transform(chunk, enc, cb) {
                cb(null, chunk.toString("utf8"));
            }
        });
    }
}
exports.createDecompressor = createDecompressor;
/**
 * Filter a Headers object down to a selected series of headers
 * @param headers The object of headers to filter
 * @param selectedHeaders The headers that should remain post-filter
 * @returns Types.ResponseHeaders | {} | undefined
 */
function filterResponseHeaders(headers, selectedHeaders) {
    // In the event the headers is undefined or null, just return undefined
    if (!headers)
        return undefined;
    // NOTE: If an empty array of headers is specified, return none of them
    return Object
        .entries(headers)
        .reduce((matchedHeaders, [key, value]) => {
        // These are usually normalized to lowercase by most libraries, but just to be sure
        const lowercaseKey = key.toLocaleLowerCase();
        // Each selectedHeader is either a RegExp, where we check for matches via RegExp.test
        // or a string, where we check for matches with equality
        if (selectedHeaders.find((h) => (0, types_1.isRegExp)(h) ? h.test(lowercaseKey) : h.toLocaleLowerCase() === lowercaseKey))
            return { ...matchedHeaders, [key]: value };
        // If we don't find a selectedHeader that matches this header, we move on
        return matchedHeaders;
    }, {});
}
exports.filterResponseHeaders = filterResponseHeaders;
/**
 * An exponential backoff delay function for file-download retries
 * @param attemptCount The number attempt we're on
 * @param delay Minimum time to wait between requests
 * @returns the number of milliseconds to wait before the next request
 */
function fileDownloadDelay(attemptCount, delay = 1000) {
    return delay * Math.pow(2, attemptCount - 1) + Math.random() * 100;
}
exports.fileDownloadDelay = fileDownloadDelay;
