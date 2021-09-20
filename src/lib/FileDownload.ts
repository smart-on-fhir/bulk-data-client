import util         from "util"
import zlib         from "zlib"
import { PassThrough, Readable, Stream } from "stream"
import EventEmitter from "events"
import request      from "./request"
import { Headers, OptionsOfUnknownResponseBody } from "got/dist/source"


const debug = util.debuglog("app-request")

export interface FileDownloadState {
    downloadedChunks : number
    downloadedBytes  : number
    uncompressedBytes: number
}

export interface FileDownloadOptions {
    signal?: AbortSignal
    accessToken?: string
    requestOptions?: OptionsOfUnknownResponseBody
}

interface FileDownload {
    on(event: "progress", listener: (state: FileDownloadState) => void): this;
    emit(event: "progress", state: FileDownloadState): boolean;
}

class FileDownload extends EventEmitter
{
    readonly url: string

    private state: FileDownloadState

    constructor(url: string)
    {
        super()
        this.url = url
        this.state = {
            downloadedChunks : 0,
            downloadedBytes  : 0,
            uncompressedBytes: 0,
        }
    }

    public getState() {
        return { ...this.state }
    }

    /**
     * The actual request will be made immediately but the returned stream will
     * be in paused state. Pipe it to some destination and unpause to actually
     * "consume" the downloaded data.
     */
    public run(options: FileDownloadOptions = {}): Promise<Readable>
    {
        const { signal, accessToken, requestOptions = {} } = options;

        return new Promise((resolve, reject) => {
            
            const options: any = {
                ...requestOptions,
                decompress: false,
                responseType: "buffer",
                headers: {
                    ...requestOptions.headers,
                    "accept-encoding": "gzip, deflate, br, identity"
                }
            }

            if (accessToken) {
                options.headers.authorization = `bearer ${accessToken}`
            }

            const downloadRequest = request.stream(this.url, options)

            if (signal) {
                const abort = () => {
                    debug("Aborting download request")
                    downloadRequest.destroy()
                };

                signal.addEventListener("abort", abort, { once: true });

                downloadRequest.on("end", () => {
                    signal.removeEventListener("abort", abort)
                });
            }

            // In case the request itself fails --------------------------------
            downloadRequest.on("error", reject)

            // Count downloaded bytes --------------------------------------
            downloadRequest.on("data", (data: string) => this.state.downloadedBytes += data.length);

            // Everything else happens after we get a response -----------------
            downloadRequest.on("response", res => {
                
                // In case we get an error response ----------------------------
                if (res.statusCode >= 400) {
                    return reject(new Error(
                        `${this.url} -> ${res.statusCode}: ${res.statusMessage}\n${res.body || ""}`
                    ));
                }

                // let transforms = []
                
                

                // Un-compress the response if needed --------------------------
                let decompress;
                switch (res.headers["content-encoding"]) {
        
                    case "gzip":
                        decompress = zlib.createGunzip();
                        decompress.on("error", e => {
                            e.message = `Error un-compressing "gzip" response: ${e.message}`
                            reject(e)
                        })
                        res.pipe(decompress)
                        break;
                    
                    case "deflate":
                        decompress = zlib.createInflate();
                        decompress.on("error", e => {
                            e.message = `Error un-compressing "deflate" response: ${e.message}`
                            reject(e)
                        })
                        res.pipe(decompress)
                        break;
            
                    case "br": {
                        decompress = zlib.createBrotliDecompress();
                        decompress.on("error", e => {
                            e.message = `Error un-compressing "br" response: ${e.message}`
                            reject(e)
                        })
                        res.pipe(decompress);
                        break;
                    }

                    default:
                        decompress = new Stream.Transform({
                            readableObjectMode: false,
                            writableObjectMode: true,
                            transform(chunk, enc, cb) {
                                cb(null, chunk.toString("utf8"))
                            }
                        });
                        res.pipe(decompress);
                        break;
                }

                // Count uncompressed bytes ------------------------------------
                decompress.on("data", (data: string) => {
                    this.state.uncompressedBytes += data.length
                    this.emit("progress", this.state)
                });

                // Count incoming raw data chunks ----------------------------------
                downloadRequest.on("data", () => this.state.downloadedChunks += 1)
                
                // Pause it now. We have only set up the downloading part of the
                // whole pipeline. Caller should pipe to other streams and resume
                decompress.pause()

                resolve(decompress)
            });

            downloadRequest.resume();
        })
    }
}

export default FileDownload
