"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const util_1 = require("util");
const http_1 = __importDefault(require("http"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const node_jose_1 = __importDefault(require("node-jose"));
const url_1 = require("url");
const events_1 = require("events");
const aws_sdk_1 = __importDefault(require("aws-sdk"));
const path_1 = require("path");
const fs_1 = __importStar(require("fs"));
const code_1 = require("@hapi/code");
const stream_1 = require("stream");
const promises_1 = require("stream/promises");
const request_1 = __importDefault(require("./request"));
const FileDownload_1 = __importDefault(require("./FileDownload"));
const ParseNDJSON_1 = __importDefault(require("../streams/ParseNDJSON"));
const StringifyNDJSON_1 = __importDefault(require("../streams/StringifyNDJSON"));
const DocumentReferenceHandler_1 = __importDefault(require("../streams/DocumentReferenceHandler"));
const errors_1 = require("./errors");
const DownloadQueue_1 = __importDefault(require("./DownloadQueue"));
const utils_1 = require("./utils");
events_1.EventEmitter.defaultMaxListeners = 30;
const debug = (0, util_1.debuglog)("app-request");
/**
 * This class provides all the methods needed for making Bulk Data exports and
 * downloading data fom bulk data capable FHIR server.
 *
 * **Example:**
 * ```ts
 * const client = new Client({ ...options })
 * await client.run()
 * ```
 */
class BulkDataClient extends events_1.EventEmitter {
    get statusEndpoint() {
        return this._statusEndpoint;
    }
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
        this.downloadQueue = new DownloadQueue_1.default({
            parallelJobs: this.options.parallelDownloads,
            onProgress: (jobs) => {
                this.emit("downloadProgress", jobs.map(j => j.status).filter(Boolean));
            },
            onComplete: (jobs) => {
                this.emit("allDownloadsComplete", jobs.map(j => j.status).filter(Boolean));
            }
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
                ...this.options.requests?.context,
                ...options.context,
                interactive: this.options.reporter === "cli"
            }
        };
        const accessToken = await this.getAccessToken();
        if (accessToken) {
            _options.headers = {
                ..._options.headers,
                authorization: `Bearer ${accessToken}`
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
     * Internal method for formatting response headers for some emitted events
     * based on `options.logResponseHeaders`
     * @param headers
     * @returns responseHeaders
     */
    formatResponseHeaders(headers) {
        if (this.options.logResponseHeaders.toString().toLocaleLowerCase() === 'none')
            return undefined;
        if (this.options.logResponseHeaders.toString().toLocaleLowerCase() === 'all')
            return headers;
        // If not an array it must be a string or a RegExp 
        if (!Array.isArray(this.options.logResponseHeaders)) {
            return (0, utils_1.filterResponseHeaders)(headers, [this.options.logResponseHeaders]);
        }
        // Else it must be an array
        return (0, utils_1.filterResponseHeaders)(headers, this.options.logResponseHeaders);
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
                scope: this.options.scope || "system/*.rs",
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
        if (global) {
            var url = new url_1.URL("$export", fhirUrl);
        }
        else if (group) {
            var url = new url_1.URL(`Group/${group}/$export`, fhirUrl);
        }
        else {
            var url = new url_1.URL("Patient/$export", fhirUrl);
        }
        let capabilityStatement;
        try {
            capabilityStatement = (await (0, utils_1.getCapabilityStatement)(fhirUrl)).body;
        }
        catch {
            capabilityStatement = {};
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
            // @ts-ignore
            this.buildKickOffQuery(url.searchParams);
        }
        this.emit("kickOffStart", requestOptions);
        const requestParameters = {
            _outputFormat: this.options._outputFormat || undefined,
            _since: (0, utils_1.fhirInstant)(this.options._since) || undefined,
            _type: this.options._type || undefined,
            _elements: this.options._elements || undefined,
            includeAssociatedData: this.options.includeAssociatedData || undefined,
            _typeFilter: this.options._typeFilter || undefined
        };
        if (Array.isArray(this.options.custom)) {
            this.options.custom.forEach(p => {
                const [name, value] = p.trim().split("=");
                requestParameters[name] = value;
            });
        }
        return this.request(requestOptions, "kick-off request")
            .then(res => {
            const location = res.headers["content-location"];
            if (!location) {
                throw new Error("The kick-off response did not include content-location header");
            }
            this.emit("kickOffEnd", {
                response: res,
                capabilityStatement,
                requestParameters,
                responseHeaders: this.formatResponseHeaders(res.headers),
            });
            this._statusEndpoint = location;
            return location;
        })
            .catch(error => {
            this.emit("kickOffEnd", {
                response: error.response || {},
                capabilityStatement,
                requestParameters,
                responseHeaders: this.formatResponseHeaders(error.response.headers),
            });
            throw error;
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
    async waitForExport({ statusEndpoint, onPage }) {
        const status = {
            startedAt: Date.now(),
            completedAt: -1,
            elapsedTime: 0,
            percentComplete: -1,
            nextCheckAfter: 1000,
            message: "Bulk Data export started",
            xProgressHeader: "",
            retryAfterHeader: "",
            statusEndpoint
        };
        this.emit("exportStart", status);
        const pages = new Set();
        // @ts-ignore
        const checkStatus = async (url) => {
            const res = await this.request({
                url,
                throwHttpErrors: false,
                responseType: "json",
                headers: {
                    accept: "application/json"
                }
            }, "status request");
            const now = Date.now();
            const elapsedTime = now - status.startedAt;
            status.elapsedTime = elapsedTime;
            const { statusCode, statusMessage, headers, body } = res;
            const isManifest = body && typeof body === "object" && !("resourceType" in body);
            const manifest = isManifest ? body : null;
            const nextUrl = manifest && Array.isArray(manifest.link) ? manifest.link.find(l => l.relation === "next")?.url || "" : "";
            const shouldContinue = statusCode === 202 || nextUrl;
            const isLastPage = statusCode === 200 && !nextUrl;
            // -----------------------------------------------------------------
            // Export is complete on the server
            // -----------------------------------------------------------------
            if (statusCode === 200 && status.percentComplete < 100) {
                status.completedAt = now;
                status.percentComplete = 100;
                status.nextCheckAfter = -1;
                status.message = `Bulk Data export completed in ${(0, utils_1.formatDuration)(elapsedTime)}`;
                this.emit("exportProgress", { ...status, virtual: true });
                this.emit("exportComplete", manifest);
            }
            // -----------------------------------------------------------------
            // Received a manifest page
            // -----------------------------------------------------------------
            if ((nextUrl || isLastPage) && manifest && !pages.has(url)) {
                try {
                    (0, code_1.expect)(manifest, "No export manifest returned").to.exist();
                    (0, code_1.expect)(manifest.output, "The export manifest output is not an array").to.be.an.array();
                    // expect(manifest.output, "The export manifest output contains no files").to.not.be.empty()
                    pages.add(url);
                    this.emit("exportPage", manifest, url);
                    onPage?.(res);
                    if (isLastPage) {
                        this.emit("manifestComplete", manifest.transactionTime);
                        return;
                    }
                }
                catch (ex) {
                    this.emit("exportError", {
                        body: body || null,
                        code: statusCode || null,
                        message: ex.message,
                        responseHeaders: this.formatResponseHeaders(headers),
                    });
                    throw ex;
                }
            }
            // -----------------------------------------------------------------
            // Export is in progress
            // -----------------------------------------------------------------
            if (shouldContinue) {
                const now = Date.now();
                const progress = String(headers["x-progress"] || "").trim();
                const retryAfter = String(headers["retry-after"] || "").trim();
                const progressPct = parseInt(progress, 10);
                let retryAfterMSec = this.options.retryAfterMSec;
                if (retryAfter) {
                    if (retryAfter.match(/\d+/)) {
                        retryAfterMSec = parseInt(retryAfter, 10) * 1000;
                    }
                    else {
                        let d = new Date(retryAfter);
                        retryAfterMSec = Math.ceil(d.getTime() - now);
                    }
                }
                const poolDelay = Math.min(Math.max(retryAfterMSec, 100), 1000 * 60);
                Object.assign(status, {
                    percentComplete: isNaN(progressPct) ? -1 : progressPct,
                    nextCheckAfter: poolDelay,
                    message: isNaN(progressPct) ?
                        `Bulk Data export: in progress for ${(0, utils_1.formatDuration)(elapsedTime)}${progress ? ". Server message: " + progress : ""}` :
                        `Bulk Data export: ${progressPct}% complete in ${(0, utils_1.formatDuration)(elapsedTime)}`
                });
                this.emit("exportProgress", {
                    ...status,
                    retryAfterHeader: retryAfter,
                    xProgressHeader: progress,
                    body: isManifest ? null : body
                });
                // debug("%o", status)
                await (0, utils_1.wait)(poolDelay, this.abortController.signal);
                return checkStatus(nextUrl || url);
            }
            // -----------------------------------------------------------------
            // ERROR
            // -----------------------------------------------------------------
            const msg = `Unexpected status response ${statusCode} ${statusMessage}`;
            this.emit("exportError", {
                body: body || null,
                code: statusCode || null,
                message: msg,
                responseHeaders: this.formatResponseHeaders(headers),
            });
            const error = new Error(msg);
            error.body = body || null;
            throw error;
        };
        await checkStatus(statusEndpoint);
    }
    async downloadAllFiles(manifest, index = 0) {
        // Count how many files we have gotten for each ResourceType. This
        // is needed if the forceStandardFileNames option is true
        const fileCounts = {};
        const folder = this.options.allowPartialManifests ? index + "" : "";
        const createDownloadJob = (f, initialState = {}) => {
            const type = f.type || "output";
            if (!(type in fileCounts)) {
                fileCounts[type] = 0;
            }
            fileCounts[type]++;
            let fileName = (0, path_1.basename)(f.url);
            if (this.options.forceStandardFileNames) {
                fileName = `${fileCounts[type]}.${type}.ndjson`;
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
                completed: false,
                exportType: "output",
                error: null,
                ...initialState
            };
            return {
                status,
                descriptor: f,
                worker: async () => {
                    let subFolder = (0, path_1.join)(folder, status.exportType == "output" ? "" : status.exportType);
                    if (this.options.addDestinationToManifest) {
                        // @ts-ignore
                        f.destination = (0, path_1.join)(this.options.destination, subFolder, fileName);
                    }
                    await this.downloadFile({
                        file: f,
                        fileName,
                        onProgress: state => Object.assign(status, state),
                        authorize: manifest.requiresAccessToken,
                        subFolder,
                        exportType: status.exportType
                    });
                    status.completed = true;
                }
            };
        };
        this.downloadQueue.addJob(...(manifest.output || []).map(f => createDownloadJob(f, { exportType: "output" })));
        this.downloadQueue.addJob(...(manifest.deleted || []).map(f => createDownloadJob(f, { exportType: "deleted" })));
        this.downloadQueue.addJob(...(manifest.error || []).map(f => createDownloadJob(f, { exportType: "error" })));
        if (this.options.saveManifest) {
            this.downloadQueue.addJob({
                worker: async () => {
                    const readable = stream_1.Readable.from(JSON.stringify(manifest, null, 4));
                    return (0, promises_1.pipeline)(readable, this.createDestinationStream("manifest.json", folder));
                }
            });
        }
    }
    async downloadFile({ file, fileName, onProgress, authorize = false, subFolder = "", exportType = "output" }) {
        let accessToken = "";
        if (authorize) {
            accessToken = await this.getAccessToken();
        }
        this.emit("downloadStart", {
            fileUrl: file.url,
            itemType: exportType,
            resourceType: file.type
        });
        const download = new FileDownload_1.default(file.url);
        // Collect different properties form different events. The aggregate
        // object will be used to emit progress events once, after a FHIR 
        // resource has been parsed 
        let _state = {
            ...download.getState(),
            resources: 0,
            attachments: 0,
            itemType: exportType
        };
        // Just "remember" the progress values but don't emit anything yet
        download.on("progress", state => Object.assign(_state, state));
        const streams = [];
        // Start the download (the stream will be paused though)
        let downloadStream = await download.run({
            accessToken,
            signal: this.abortController.signal,
            requestOptions: this.options.requests,
            fileDownloadRetry: this.options.fileDownloadRetry,
        })
            .catch(e => {
            if (e instanceof errors_1.FileDownloadError) {
                this.emit("downloadError", {
                    body: null, // Buffer
                    code: e.code || null,
                    fileUrl: e.fileUrl,
                    message: String(e.message || "File download failed"),
                    responseHeaders: this.formatResponseHeaders(e.responseHeaders),
                });
            }
            throw e;
        });
        streams.push(downloadStream);
        // ---------------------------------------------------------------------
        // Create an NDJSON parser to verify that every single line is valid
        // ---------------------------------------------------------------------
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
        const parser = new ParseNDJSON_1.default({
            maxLineLength: this.options.ndjsonMaxLineLength,
            expectedCount: exportType == "output" ? file.count || -1 : -1,
            expectedResourceType
        });
        streams.push(parser);
        // ---------------------------------------------------------------------
        // Download attachments
        // ---------------------------------------------------------------------
        if (this.options.downloadAttachments !== false) {
            const docRefProcessor = new DocumentReferenceHandler_1.default({
                request: (options) => {
                    this.emit("downloadStart", {
                        fileUrl: options.url.toString(),
                        itemType: "attachment",
                        resourceType: null
                    });
                    return this.request({
                        ...options,
                        // Retry behavior should be the same as the fileDownloadRetry behavior
                        retry: this.options.fileDownloadRetry,
                    }, "Attachment");
                },
                onDownloadComplete: (url, byteSize) => {
                    this.emit("downloadComplete", {
                        fileUrl: url,
                        fileSize: byteSize,
                        resourceCount: null
                    });
                },
                inlineAttachments: this.options.inlineDocRefAttachmentsSmallerThan,
                inlineAttachmentTypes: this.options.inlineDocRefAttachmentTypes,
                pdfToText: this.options.pdfToText,
                baseUrl: this.options.fhirUrl,
                ignoreDownloadErrors: !!this.options.ignoreAttachmentDownloadErrors,
                downloadMimeTypes: this.options.downloadAttachments === true ? [] : this.options.downloadAttachments,
                save: (name, stream, sub) => {
                    return (0, promises_1.pipeline)(stream, this.createDestinationStream(name, subFolder + "/" + sub));
                },
                onDownloadError: e => {
                    this.emit("downloadError", {
                        body: null,
                        code: e.code || null,
                        fileUrl: e.fileUrl,
                        message: String(e.message || "Downloading attachment failed"),
                        responseHeaders: this.formatResponseHeaders(e.responseHeaders),
                    });
                }
            });
            docRefProcessor.on("attachment", () => _state.attachments += 1);
            streams.push(docRefProcessor);
        }
        // ---------------------------------------------------------------------
        // Transforms from stream of objects back to stream of line strings
        // ---------------------------------------------------------------------
        const stringify = new StringifyNDJSON_1.default();
        stringify.on("data", () => {
            _state.resources += 1;
            onProgress(_state);
        });
        streams.push(stringify);
        // ---------------------------------------------------------------------
        // Write the file to the configured destination
        // ---------------------------------------------------------------------
        streams.push(this.createDestinationStream(fileName, subFolder));
        // ---------------------------------------------------------------------
        // Run the pipeline
        // ---------------------------------------------------------------------
        try {
            await (0, promises_1.pipeline)(streams);
        }
        catch (e) {
            this.emit("downloadError", {
                body: null,
                code: e.code || null,
                fileUrl: e.fileUrl || file.url,
                message: String(e.message || "Downloading failed"),
                responseHeaders: this.formatResponseHeaders(e.responseHeaders),
            });
            throw e;
        }
        this.emit("downloadComplete", {
            fileUrl: file.url,
            fileSize: _state.uncompressedBytes,
            resourceCount: _state.resources
        });
    }
    /**
     * Creates and returns a writable stream to the destination.
     * - For file system destination the files are written to the given location
     * - For S3 destinations the files are uploaded to S3
     * - For HTTP destinations the files are posted to the given URL
     * - If the destination is "" or "none" no action is taken (files are discarded)
     * @param fileName The desired fileName at destination
     * @param subFolder Optional subfolder
     */
    createDestinationStream(fileName, subFolder = "") {
        const destination = (0, utils_1.normalizeDestination)(this.options.destination);
        // No destination ------------------------------------------------------
        if (!destination) {
            return new stream_1.Writable({ write(chunk, encoding, cb) { cb(); } });
        }
        // S3 ------------------------------------------------------------------
        if (destination.startsWith("s3://")) {
            if (this.options.awsAccessKeyId && this.options.awsSecretAccessKey) {
                aws_sdk_1.default.config.update({
                    accessKeyId: this.options.awsAccessKeyId,
                    secretAccessKey: this.options.awsSecretAccessKey
                });
            }
            if (this.options.awsRegion) {
                aws_sdk_1.default.config.update({ region: this.options.awsRegion });
            }
            let bucket = destination.substring(5);
            if (subFolder) {
                bucket = (0, path_1.join)(bucket, subFolder);
            }
            const stream = new stream_1.PassThrough();
            const upload = new aws_sdk_1.default.S3.ManagedUpload({
                params: {
                    Bucket: bucket,
                    Key: fileName,
                    Body: stream
                }
            });
            upload.promise().catch(console.error);
            return stream;
        }
        // HTTP ----------------------------------------------------------------
        if (destination.match(/^https?\:\/\//)) {
            const url = new url_1.URL((0, path_1.join)(destination, fileName));
            if (subFolder) {
                url.searchParams.set("folder", subFolder);
            }
            const req = http_1.default.request(url, { method: 'POST' });
            req.on('error', error => {
                console.error(`Problem with upload request: ${error.message}`);
            });
            return req;
        }
        // local filesystem destinations ---------------------------------------
        let path = destination;
        if (subFolder) {
            path = (0, path_1.join)(path, subFolder);
            if (!fs_1.default.existsSync(path)) {
                (0, fs_1.mkdirSync)(path, { recursive: true });
            }
        }
        return fs_1.default.createWriteStream((0, path_1.join)(path, fileName));
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
        if (this.options.allowPartialManifests) {
            params.append("allowPartialManifests", !!this.options.allowPartialManifests + "");
        }
        if (this.options.organizeOutputBy) {
            params.append("organizeOutputBy", this.options.organizeOutputBy);
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
        // allowPartialManifests -----------------------------------------------
        if (this.options.allowPartialManifests) {
            parameters.push({
                name: "allowPartialManifests",
                valueBoolean: this.options.allowPartialManifests
            });
        }
        // organizeOutputBy ----------------------------------------------------
        if (this.options.organizeOutputBy) {
            parameters.push({
                name: "organizeOutputBy",
                valueString: this.options.organizeOutputBy
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
    async run(statusEndpoint) {
        if (!statusEndpoint) {
            statusEndpoint = await this.kickOff();
        }
        return new Promise((resolve, reject) => {
            this.once("allDownloadsComplete", resolve);
            let page = 0;
            this.waitForExport({
                statusEndpoint: statusEndpoint,
                onPage: (res) => {
                    this.downloadAllFiles(res.body, page++);
                }
            })
                .then(() => this.downloadQueue.finalize())
                .catch(reject);
        });
    }
}
exports.default = BulkDataClient;
