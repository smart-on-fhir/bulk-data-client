"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const util_1 = __importDefault(require("util"));
const events_1 = __importDefault(require("events"));
const request_1 = __importDefault(require("./request"));
const utils_1 = require("./utils");
const errors_1 = require("./errors");
const debug = util_1.default.debuglog("app-request");
class FileDownload extends events_1.default {
    constructor(url) {
        super();
        this.url = url;
        this.state = {
            downloadedChunks: 0,
            downloadedBytes: 0,
            uncompressedBytes: 0,
            requestOptions: {}
        };
    }
    getState() {
        return { ...this.state };
    }
    emit(eventName, ...args) {
        return super.emit(eventName, this.getState(), ...args);
    }
    /**
     * The actual request will be made immediately but the returned stream will
     * be in paused state. Pipe it to some destination and unpause to actually
     * "consume" the downloaded data.
     */
    run(options = {}) {
        const { signal, accessToken, requestOptions = {} } = options;
        return new Promise((resolve, reject) => {
            const options = {
                ...requestOptions,
                decompress: false,
                responseType: "buffer",
                throwHttpErrors: false,
                headers: {
                    ...requestOptions.headers,
                    "accept-encoding": "gzip, deflate, br, identity"
                }
            };
            if (accessToken) {
                options.headers.authorization = `Bearer ${accessToken}`;
            }
            this.state.requestOptions = { ...options, url: this.url };
            this.emit("start");
            const downloadRequest = request_1.default.stream(this.url, options);
            if (signal) {
                const abort = () => {
                    debug("Aborting download request");
                    downloadRequest.destroy();
                };
                signal.addEventListener("abort", abort, { once: true });
                downloadRequest.on("end", () => {
                    signal.removeEventListener("abort", abort);
                });
            }
            downloadRequest.once("end", () => this.emit("complete"));
            // In case the request itself fails --------------------------------
            // downloadRequest.on("error", reject)
            downloadRequest.on("error", error => {
                this.state.error = error;
                reject(error);
            });
            // Count downloaded bytes ------------------------------------------
            downloadRequest.on("data", (data) => {
                this.state.downloadedBytes += data.length;
            });
            // Everything else happens after we get a response -----------------
            downloadRequest.on("response", res => {
                // In case we get an error response ----------------------------
                if (res.statusCode >= 400) {
                    return reject(new errors_1.FileDownloadError({
                        fileUrl: this.url,
                        body: res.body,
                        responseHeaders: res.headers,
                        code: res.statusCode
                    }));
                }
                // Un-compress the response if needed --------------------------
                let decompress = (0, utils_1.createDecompressor)(res);
                res.pipe(decompress);
                // Count uncompressed bytes ------------------------------------
                decompress.on("data", (data) => {
                    this.state.uncompressedBytes += data.length;
                    this.emit("progress");
                });
                // Count incoming raw data chunks ------------------------------
                downloadRequest.on("data", () => this.state.downloadedChunks += 1);
                // Pause it now. We have only set up the downloading part of the
                // whole pipeline. Caller should pipe to other streams and resume
                decompress.pause();
                resolve(decompress);
            });
            downloadRequest.resume();
        });
    }
}
exports.default = FileDownload;
