"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const util_1 = require("util");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const node_jose_1 = __importDefault(require("node-jose"));
const url_1 = require("url");
const events_1 = require("events");
const aws_sdk_1 = __importDefault(require("aws-sdk"));
const path_1 = require("path");
const fs_1 = __importStar(require("fs"));
const code_1 = require("@hapi/code");
const stream_1 = require("stream");
const request_1 = __importDefault(require("./request"));
const FileDownload_1 = __importDefault(require("./FileDownload"));
const ParseNDJSON_1 = __importDefault(require("../streams/ParseNDJSON"));
const StringifyNDJSON_1 = __importDefault(require("../streams/StringifyNDJSON"));
const DocumentReferenceHandler_1 = __importDefault(require("../streams/DocumentReferenceHandler"));
const utils_1 = require("./utils");
events_1.EventEmitter.defaultMaxListeners = 30;
const pipeline = (0, util_1.promisify)(stream_1.Stream.pipeline);
const debug = (0, util_1.debuglog)("app-request");
/**
 * This class provides all the methods needed for making Bulk Data exports and
 * downloading data fom bulk data capable FHIR server.
 *
 * **Example:**
 * ```ts
 * const client = new Client({ ...options })
 *
 * // Start an export and get the status location
 * const statusEndpoint = await client.kickOff()
 *
 * // Wait for the export and get the manifest
 * const manifest = await client.waitForExport(statusEndpoint)
 *
 * // Download everything in the manifest
 * const downloads = await client.downloadFiles(manifest)
 * ```
 */
class BulkDataClient extends events_1.EventEmitter {
    /**
     * Nothing special is done here - just remember the options and create
     * AbortController instance
     */
    constructor(options) {
        super();
        /**
         * The last known access token is stored here. It will be renewed when it
         * expires.
         */
        this.accessToken = "";
        /**
         * Every time we get new access token, we set this field based on the
         * token's expiration time.
         */
        this.accessTokenExpiresAt = 0;
        this.options = options;
        this.abortController = new AbortController();
        this.abortController.signal.addEventListener("abort", () => {
            this.emit("abort");
        });
    }
    /**
     * Abort any current asynchronous task. This may include:
     * - pending HTTP requests
     * - wait timers
     * - streams and stream pipelines
     */
    abort() {
        this.abortController.abort();
    }
    /**
     * Used internally to make requests that will automatically authorize if
     * needed and that can be aborted using [this.abort()]
     * @param options Any request options
     * @param label Used to render an error message if the request is aborted
     */
    async request(options, label = "request") {
        const _options = {
            ...this.options.requests,
            ...options,
            headers: {
                ...this.options.requests.headers,
                ...options.headers
            },
            context: {
                ...options.context,
                interactive: this.options.reporter === "cli"
            }
        };
        const accessToken = await this.getAccessToken();
        if (accessToken) {
            _options.headers = {
                ...options.headers,
                authorization: `bearer ${accessToken}`
            };
        }
        const req = (0, request_1.default)(_options);
        const abort = () => {
            debug(`Aborting ${label}`);
            req.cancel();
        };
        this.abortController.signal.addEventListener("abort", abort, { once: true });
        return req.then(res => {
            this.abortController.signal.removeEventListener("abort", abort);
            return res;
        });
    }
    /**
     * Get an access token to be used as bearer in requests to the server.
     * The token is cached so that we don't have to authorize on every request.
     * If the token is expired (or will expire in the next 10 seconds), a new
     * one will be requested and cached.
     */
    async getAccessToken() {
        if (this.accessToken && this.accessTokenExpiresAt - 10 > Date.now() / 1000) {
            return this.accessToken;
        }
        const { tokenUrl, clientId, accessTokenLifetime, privateKey } = this.options;
        if (!tokenUrl || tokenUrl == "none" || !clientId || !privateKey) {
            return "";
        }
        const claims = {
            iss: clientId,
            sub: clientId,
            aud: tokenUrl,
            exp: Math.round(Date.now() / 1000) + accessTokenLifetime,
            jti: node_jose_1.default.util.randomBytes(10).toString("hex")
        };
        const token = jsonwebtoken_1.default.sign(claims, privateKey.toPEM(true), {
            algorithm: privateKey.alg,
            keyid: privateKey.kid
        });
        const authRequest = (0, request_1.default)(tokenUrl, {
            method: "POST",
            responseType: "json",
            form: {
                scope: "system/*.read",
                grant_type: "client_credentials",
                client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
                client_assertion: token
            }
        });
        const abort = () => {
            debug("Aborting authorization request");
            authRequest.cancel();
        };
        this.abortController.signal.addEventListener("abort", abort, { once: true });
        return authRequest.then(res => {
            (0, utils_1.assert)(res.body, "Authorization request got empty body");
            (0, utils_1.assert)(res.body.access_token, "Authorization response does not include access_token");
            (0, utils_1.assert)(res.body.expires_in, "Authorization response does not include expires_in");
            this.accessToken = res.body.access_token || "";
            this.accessTokenExpiresAt = (0, utils_1.getAccessTokenExpiration)(res.body);
            this.emit("authorize", this.accessToken);
            return res.body.access_token;
        }).finally(() => {
            this.abortController.signal.removeEventListener("abort", abort);
        });
    }
    /**
     * Makes the kick-off request and resolves with the status endpoint URL
     */
    async kickOff() {
        const { fhirUrl, global, group, lenient, patient, post } = this.options;
        this.emit("kickOffStart");
        if (global) {
            var url = new url_1.URL("$export", fhirUrl);
        }
        else if (group) {
            var url = new url_1.URL(`Group/${group}/$export`, fhirUrl);
        }
        else {
            var url = new url_1.URL("Patient/$export", fhirUrl);
        }
        const requestOptions = {
            url,
            responseType: "json",
            headers: {
                accept: "application/fhir+json",
                prefer: `respond-async${lenient ? ", handling=lenient" : ""}`
            }
        };
        if (post || patient) {
            requestOptions.method = "POST";
            requestOptions.json = this.buildKickOffPayload();
        }
        else {
            this.buildKickOffQuery(url.searchParams);
        }
        return this.request(requestOptions, "kick-off request").then(res => {
            const location = res.headers["content-location"];
            (0, utils_1.assert)(location, "The kick-off response did not include content-location header");
            this.emit("kickOffEnd", location);
            return location;
        });
    }
    /**
     * Waits for the export to be completed and resolves with the export
     * manifest when done. Emits one "exportStart", multiple "exportProgress"
     * and one "exportComplete" events.
     *
     * If the server replies with "retry-after" header we will use that to
     * compute our pooling frequency, but the next pool will be scheduled for
     * not sooner than 1 second and not later than 10 seconds from now.
     * Otherwise, the default pooling frequency is 1 second.
     */
    async waitForExport(statusEndpoint) {
        const status = {
            startedAt: Date.now(),
            completedAt: -1,
            elapsedTime: 0,
            percentComplete: -1,
            nextCheckAfter: 1000,
            message: "Bulk Data export started"
        };
        this.emit("exportStart", status);
        const checkStatus = async () => {
            return this.request({
                url: statusEndpoint,
                throwHttpErrors: false,
                responseType: "json",
                headers: {
                    accept: "application/json"
                }
            }, "status request").then(res => {
                const now = Date.now();
                const elapsedTime = now - status.startedAt;
                status.elapsedTime = elapsedTime;
                // Export is complete
                if (res.statusCode == 200) {
                    status.completedAt = now;
                    status.percentComplete = 100;
                    status.nextCheckAfter = -1;
                    status.message = `Bulk Data export completed in ${(0, utils_1.formatDuration)(elapsedTime)}`;
                    this.emit("exportProgress", status);
                    (0, code_1.expect)(res.body, "No export manifest returned").to.exist();
                    (0, code_1.expect)(res.body.output, "The export manifest output is not an array").to.be.an.array();
                    (0, code_1.expect)(res.body.output, "The export manifest output contains no files").to.not.be.empty();
                    this.emit("exportComplete", res.body);
                    // debug("%o", status)
                    return res.body;
                }
                // Export is in progress
                if (res.statusCode == 202) {
                    const now = Date.now();
                    let progress = String(res.headers["x-progress"] || "").trim();
                    let retryAfter = String(res.headers["retry-after"] || "").trim();
                    let progressPct = parseInt(progress, 10);
                    let retryAfterMSec = 1000;
                    if (retryAfter.match(/\d+/)) {
                        retryAfterMSec = parseInt(retryAfter, 10) * 1000;
                    }
                    else {
                        let d = new Date(retryAfter);
                        retryAfterMSec = Math.ceil(d.getTime() - now);
                    }
                    const poolDelay = Math.min(Math.max(retryAfterMSec / 10, 1000), 10000);
                    Object.assign(status, {
                        percentComplete: isNaN(progressPct) ? -1 : progressPct,
                        nextCheckAfter: poolDelay,
                        message: isNaN(progressPct) ?
                            `Bulk Data export: in progress for ${(0, utils_1.formatDuration)(elapsedTime)}${progress ? ". Server message: " + progress : ""}` :
                            `Bulk Data export: ${progressPct}% complete in ${(0, utils_1.formatDuration)(elapsedTime)}`
                    });
                    this.emit("exportProgress", status);
                    // debug("%o", status)
                    return (0, utils_1.wait)(poolDelay, this.abortController.signal).then(checkStatus);
                }
                else {
                    // TODO: handle unexpected response
                    throw new Error(`Unexpected status response ${res.statusCode} ${res.statusMessage}`);
                    // this.emit("error", status)
                }
            });
        };
        return checkStatus();
    }
    async downloadAllFiles(manifest) {
        return new Promise((resolve, reject) => {
            // Count how many files we have gotten for each ResourceType. This
            // is needed if the forceStandardFileNames option is true
            const fileCounts = {};
            const createDownloadJob = (f, initialState = {}) => {
                if (!(f.type in fileCounts)) {
                    fileCounts[f.type] = 0;
                }
                fileCounts[f.type]++;
                let fileName = (0, path_1.basename)(f.url);
                if (this.options.forceStandardFileNames) {
                    fileName = `${fileCounts[f.type]}.${f.type}.ndjson`;
                }
                const status = {
                    url: f.url,
                    type: f.type,
                    name: fileName,
                    downloadedChunks: 0,
                    downloadedBytes: 0,
                    uncompressedBytes: 0,
                    resources: 0,
                    attachments: 0,
                    running: false,
                    completed: false,
                    exportType: "output",
                    error: null,
                    ...initialState
                };
                return {
                    status,
                    descriptor: f,
                    worker: async () => {
                        status.running = true;
                        status.completed = false;
                        this.downloadFile(f, fileName, state => {
                            Object.assign(status, state);
                            this.emit("downloadProgress", downloadJobs.map(j => j.status));
                        }, () => {
                            status.running = false;
                            status.completed = true;
                            if (this.options.addDestinationToManifest) {
                                // @ts-ignore
                                f.destination = (0, path_1.join)(this.options.destination, fileName);
                            }
                            tick();
                        }, true, status.exportType == "output" ? "" : status.exportType, status.exportType);
                    }
                };
            };
            const downloadJobs = [
                ...(manifest.output || []).map(f => createDownloadJob(f, { exportType: "output" })),
                ...(manifest.deleted || []).map(f => createDownloadJob(f, { exportType: "deleted" })),
                ...(manifest.error || []).map(f => createDownloadJob(f, { exportType: "error" }))
            ];
            const tick = () => {
                let completed = 0;
                let running = 0;
                for (const job of downloadJobs) {
                    if (job.status.completed) {
                        completed += 1;
                        continue;
                    }
                    if (job.status.running) {
                        running += 1;
                        continue;
                    }
                    if (running < this.options.parallelDownloads) {
                        running += 1;
                        job.worker();
                    }
                }
                this.emit("downloadProgress", downloadJobs.map(j => j.status));
                if (completed === downloadJobs.length) {
                    if (this.options.saveManifest) {
                        this.writeToDestination("manifest.json", stream_1.Readable.from(JSON.stringify(manifest, null, 4))).then(() => {
                            this.emit("downloadComplete", downloadJobs.map(j => j.status));
                            resolve(downloadJobs.map(j => j.status));
                        });
                    }
                    else {
                        this.emit("downloadComplete", downloadJobs.map(j => j.status));
                        resolve(downloadJobs.map(j => j.status));
                    }
                }
            };
            this.emit("downloadStart", downloadJobs.map(j => j.status));
            tick();
        });
    }
    async downloadFile(file, fileName, onProgress, onComplete, authorize = false, subFolder = "", exportType = "output") {
        let accessToken = "";
        if (authorize) {
            accessToken = await this.getAccessToken();
        }
        const download = new FileDownload_1.default(file.url);
        // Collect different properties form different events. The aggregate
        // object will be used to emit progress events once, after a FHIR 
        // resource has been parsed 
        let _state = {
            ...download.getState(),
            resources: 0,
            attachments: 0
        };
        // Just "remember" the progress values but don't emit anything yet
        download.on("progress", state => Object.assign(_state, state));
        // Start the download (the stream will be paused though)
        const downloadStream = await download.run({
            accessToken,
            signal: this.abortController.signal,
            requestOptions: this.options.requests
        });
        let expectedResourceType = "";
        if (this.options.ndjsonValidateFHIRResourceType) {
            switch (exportType) {
                case "output":
                    expectedResourceType = file.type;
                    break;
                case "deleted":
                    expectedResourceType = "Bundle";
                    break;
                case "error":
                    expectedResourceType = "OperationOutcome";
                    break;
                default:
                    expectedResourceType = "";
                    break;
            }
        }
        // Create an NDJSON parser to verify that every single line can be
        // parsed as JSON
        const parser = new ParseNDJSON_1.default({
            maxLineLength: this.options.ndjsonMaxLineLength,
            expectedCount: exportType == "output" ? file.count || -1 : -1,
            expectedResourceType
        });
        // Transforms from stream of objects back to stream of strings (lines)
        const stringify = new StringifyNDJSON_1.default();
        const docRefProcessor = new DocumentReferenceHandler_1.default({
            request: this.request.bind(this),
            save: (name, stream, subFolder) => this.writeToDestination(name, stream, subFolder),
            inlineAttachments: this.options.inlineDocRefAttachmentsSmallerThan,
            inlineAttachmentTypes: this.options.inlineDocRefAttachmentTypes,
            pdfToText: this.options.pdfToText,
            baseUrl: this.options.fhirUrl
        });
        docRefProcessor.on("attachment", () => _state.attachments += 1);
        const processPipeline = downloadStream
            .pipe(parser)
            .pipe(docRefProcessor)
            .pipe(stringify)
            .pause();
        // When we get an object from a line emit the progress event
        stringify.on("data", () => {
            _state.resources += 1;
            onProgress(_state);
        });
        await this.writeToDestination(fileName, processPipeline, subFolder);
        onComplete();
    }
    /**
     * Given a readable stream as input sends the data to the destination. The
     * actual actions taken are different depending on the destination:
     * - For file system destination the files are written to the given location
     * - For S3 destinations the files are uploaded to S3
     * - For HTTP destinations the files are posted to the given URL
     * - If the destination is "" or "none" no action is taken (files are discarded)
     * @param fileName The desired fileName at destination
     * @param inputStream The input readable stream
     * @param subFolder
     * @returns
     */
    writeToDestination(fileName, inputStream, subFolder = "") {
        const destination = String(this.options.destination || "none").trim();
        // No destination ------------------------------------------------------
        if (!destination || destination.toLowerCase() == "none") {
            return pipeline(inputStream, new stream_1.Writable({
                write(chunk, encoding, cb) { cb(); }
            }));
        }
        // S3 ------------------------------------------------------------------
        if (destination.startsWith("s3://")) {
            // assert(
            //     this.options.awsAccessKeyId,
            //     "Please set the 'awsAccessKeyId' property in your config file",
            //     { description: "The 'awsAccessKeyId' configuration option is required if the 'destination' option is an S3 uri" }
            // )
            // assert(
            //     this.options.awsSecretAccessKey,
            //     "Please set the 'awsSecretAccessKey' property in your config file",
            //     { description: "The 'awsSecretAccessKey' configuration option is required if the 'destination' option is an S3 uri" }
            // )
            // assert(
            //     this.options.awsRegion,
            //     "Please set the 'awsRegion' property in your config file",
            //     { description: "The 'awsRegion' configuration option is required if the 'destination' option is an S3 uri" }
            // )
            // aws.config.update({
            //     // apiVersion     : this.options.awsApiVersion,
            //     region         : this.options.awsRegion,
            //     accessKeyId    : this.options.awsAccessKeyId,
            //     secretAccessKey: this.options.awsSecretAccessKey
            // });
            let bucket = destination.substring(5);
            if (subFolder) {
                bucket = (0, path_1.join)(bucket, subFolder);
            }
            const upload = new aws_sdk_1.default.S3.ManagedUpload({
                params: {
                    Bucket: bucket,
                    Key: fileName,
                    Body: inputStream
                }
            });
            return upload.promise();
        }
        // HTTP ----------------------------------------------------------------
        if (destination.match(/^https?\:\/\//)) {
            return pipeline(inputStream, request_1.default.stream.post((0, path_1.join)(destination, fileName) + "?folder=" + subFolder), new stream_1.PassThrough());
        }
        // local filesystem destinations ---------------------------------------
        let path = destination.startsWith("file://") ?
            (0, url_1.fileURLToPath)(destination) :
            destination.startsWith(path_1.sep) ?
                destination :
                (0, path_1.resolve)(__dirname, "../..", destination);
        (0, utils_1.assert)(fs_1.default.existsSync(path), `Destination "${path}" does not exist`);
        (0, utils_1.assert)(fs_1.default.statSync(path).isDirectory, `Destination "${path}" is not a directory`);
        if (subFolder) {
            path = (0, path_1.join)(path, subFolder);
            if (!fs_1.default.existsSync(path)) {
                (0, fs_1.mkdirSync)(path);
            }
        }
        return pipeline(inputStream, fs_1.default.createWriteStream((0, path_1.join)(path, fileName)));
    }
    /**
     * Given an URL query as URLSearchParams object, appends all the
     * user-defined Bulk Data Export kick-off parameters from CLI or from config
     * files and returns the query object
     * @param params URLSearchParams object to augment
     * @returns The same URLSearchParams object, possibly augmented with new
     * parameters
     */
    buildKickOffQuery(params) {
        if (this.options._outputFormat) {
            params.append("_outputFormat", this.options._outputFormat);
        }
        const since = (0, utils_1.fhirInstant)(this.options._since);
        if (since) {
            params.append("_since", since);
        }
        if (this.options._type) {
            params.append("_type", this.options._type);
        }
        if (this.options._elements) {
            params.append("_elements", this.options._elements);
        }
        if (this.options.includeAssociatedData) {
            params.append("includeAssociatedData", this.options.includeAssociatedData);
        }
        if (this.options._typeFilter) {
            params.append("_typeFilter", this.options._typeFilter);
        }
        if (Array.isArray(this.options.custom)) {
            this.options.custom.forEach(p => {
                const [name, value] = p.trim().split("=");
                params.append(name, value);
            });
        }
        return params;
    }
    buildKickOffPayload() {
        const parameters = [];
        // _since --------------------------------------------------------------
        const since = (0, utils_1.fhirInstant)(this.options._since);
        if (since) {
            parameters.push({
                name: "_since",
                valueInstant: since
            });
        }
        // _type ---------------------------------------------------------------
        if (this.options._type) {
            String(this.options._type).trim().split(/\s*,\s*/).forEach(type => {
                parameters.push({
                    name: "_type",
                    valueString: type
                });
            });
        }
        // _elements -----------------------------------------------------------
        if (this.options._elements) {
            parameters.push({
                name: "_elements",
                valueString: this.options._elements
            });
        }
        // patient -------------------------------------------------------------
        if (this.options.patient) {
            String(this.options.patient).trim().split(/\s*,\s*/).forEach(id => {
                parameters.push({
                    name: "patient",
                    valueReference: {
                        reference: `Patient/${id}`
                    }
                });
            });
        }
        // _typeFilter ---------------------------------------------------------
        if (this.options._typeFilter) {
            parameters.push({
                name: "_typeFilter",
                valueString: this.options._typeFilter
            });
        }
        // _outputFormat -------------------------------------------------------
        if (this.options._outputFormat) {
            parameters.push({
                name: "_outputFormat",
                valueString: this.options._outputFormat
            });
        }
        // Custom parameters ---------------------------------------------------
        if (Array.isArray(this.options.custom)) {
            this.options.custom.forEach(p => {
                let [name, value] = p.trim().split(/\s*=\s*/);
                if (value == "false") {
                    parameters.push({ name, valueBoolean: false });
                }
                else if (value == "true") {
                    parameters.push({ name, valueBoolean: true });
                }
                else if (parseInt(value, 10) + "" === value) {
                    parameters.push({ name, valueInteger: parseInt(value, 10) });
                }
                else if (parseFloat(value) + "" === value) {
                    parameters.push({ name, valueDecimal: parseFloat(value) });
                }
                else if ((0, utils_1.fhirInstant)(value)) {
                    parameters.push({ name, valueInstant: (0, utils_1.fhirInstant)(value) });
                }
                else {
                    parameters.push({ name, valueString: value });
                }
            });
        }
        return {
            resourceType: "Parameters",
            parameter: parameters
        };
    }
    cancelExport(statusEndpoint) {
        this.abort();
        return this.request({
            method: "DELETE",
            url: statusEndpoint,
            responseType: "json"
        });
    }
}
exports.default = BulkDataClient;
