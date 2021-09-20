"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const util_1 = __importDefault(require("util"));
const zlib_1 = __importDefault(require("zlib"));
const stream_1 = require("stream");
const events_1 = __importDefault(require("events"));
const request_1 = __importDefault(require("./request"));
const debug = util_1.default.debuglog("app-request");
class FileDownload extends events_1.default {
    constructor(url) {
        super();
        this.url = url;
        this.state = {
            downloadedChunks: 0,
            downloadedBytes: 0,
            uncompressedBytes: 0,
        };
    }
    getState() {
        return { ...this.state };
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
                headers: {
                    ...requestOptions.headers,
                    "accept-encoding": "gzip, deflate, br, identity"
                }
            };
            if (accessToken) {
                options.headers.authorization = `bearer ${accessToken}`;
            }
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
            // In case the request itself fails --------------------------------
            downloadRequest.on("error", reject);
            // Count downloaded bytes --------------------------------------
            downloadRequest.on("data", (data) => this.state.downloadedBytes += data.length);
            // Everything else happens after we get a response -----------------
            downloadRequest.on("response", res => {
                // In case we get an error response ----------------------------
                if (res.statusCode >= 400) {
                    return reject(new Error(`${this.url} -> ${res.statusCode}: ${res.statusMessage}\n${res.body || ""}`));
                }
                // let transforms = []
                // Un-compress the response if needed --------------------------
                let decompress;
                switch (res.headers["content-encoding"]) {
                    case "gzip":
                        decompress = zlib_1.default.createGunzip();
                        decompress.on("error", e => {
                            e.message = `Error un-compressing "gzip" response: ${e.message}`;
                            reject(e);
                        });
                        res.pipe(decompress);
                        break;
                    case "deflate":
                        decompress = zlib_1.default.createInflate();
                        decompress.on("error", e => {
                            e.message = `Error un-compressing "deflate" response: ${e.message}`;
                            reject(e);
                        });
                        res.pipe(decompress);
                        break;
                    case "br": {
                        decompress = zlib_1.default.createBrotliDecompress();
                        decompress.on("error", e => {
                            e.message = `Error un-compressing "br" response: ${e.message}`;
                            reject(e);
                        });
                        res.pipe(decompress);
                        break;
                    }
                    default:
                        decompress = new stream_1.Stream.Transform({
                            readableObjectMode: false,
                            writableObjectMode: true,
                            transform(chunk, enc, cb) {
                                cb(null, chunk.toString("utf8"));
                            }
                        });
                        res.pipe(decompress);
                        break;
                }
                // Count uncompressed bytes ------------------------------------
                decompress.on("data", (data) => {
                    this.state.uncompressedBytes += data.length;
                    this.emit("progress", this.state);
                });
                // Count incoming raw data chunks ----------------------------------
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
