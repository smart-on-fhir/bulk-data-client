import util                   from "util"
import { Readable }           from "stream"
import EventEmitter           from "events"
import request                from "./request"
import { createDecompressor, wait } from "./utils"
import { BulkDataClient as Types } from "../.."
import { FileDownloadError }  from "./errors"
import {
    Options,
    OptionsOfUnknownResponseBody,
    RequiredRetryOptions,
    Response,
} from "got/dist/source"


const debug = util.debuglog("app-request")

export interface FileDownloadState {
    numTries         : number
    requestOptions   : Options
    response        ?: Response
    downloadedChunks : number
    downloadedBytes  : number
    uncompressedBytes: number
    error           ?: Error | string
}

export interface FileDownloadOptions {
    signal              ?: AbortSignal
    accessToken         ?: string
    requestOptions      ?: OptionsOfUnknownResponseBody
    fileDownloadRetry   ?: Types.ConfigFileOptions["fileDownloadRetry"]
}

export interface FileDownloadEvents {
    start   : (this: FileDownload, state: FileDownloadState) => void
    progress: (this: FileDownload, state: FileDownloadState) => void
    complete: (this: FileDownload, state: FileDownloadState) => void
}

interface FileDownload {
    on<U extends keyof FileDownloadEvents>(event: U, listener: FileDownloadEvents[U]): this;
    emit<U extends keyof FileDownloadEvents>(event: U, ...args: Parameters<FileDownloadEvents[U]>): boolean;
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
            numTries         : 0,
            downloadedChunks : 0,
            downloadedBytes  : 0,
            uncompressedBytes: 0,
            requestOptions   : {}
        }
    }

    public getState() {
        return { ...this.state }
    }

    public emit(eventName: string | symbol, ...args: any[]): boolean {
        return super.emit(eventName, this.getState(), ...args)
    }

    /**
     * An exponential backoff delay function for file-download retries
     * Based on got/dist/source/core/calculate-retry-delay.js
     * This is only needed because GOT's support for stream retrying isn't working as needed for our version 
     * This may change with future versions of GOT
     * @returns the number of milliseconds to wait before the next request; 0 if no retry is needed
     */
    private calculateRetryDelay({
        attemptCount, 
        retryOptions, 
        response, 
        retryAfter 
    } : {
        attemptCount: number, 
        retryOptions: RequiredRetryOptions, 
        response: Response, 
        retryAfter?: number}
    ) {
        if (attemptCount > retryOptions.limit) {
            return 0;
        }
        const hasMethod = retryOptions.methods.includes(response.request.options.method);
        const hasStatusCode = retryOptions.statusCodes.includes(response.statusCode);
        if (!hasMethod || !hasStatusCode) {
            return 0;
        }
        if (retryAfter) {
            if (retryOptions.maxRetryAfter === undefined || retryAfter > retryOptions.maxRetryAfter) {
                return 0;
            }
            return retryAfter;
        }
        // 413 CONTENT TOO LARGE: https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/413 
        // No use in retrying, the server can't handle a request this large 
        if (response.statusCode === 413) {
            return 0;
        }
        const noise = Math.random() * 100;
        return ((2 ** (attemptCount - 1)) * 1000) + noise;
    }

    /**
     * The actual request will be made immediately but the returned stream will
     * be in paused state. Pipe it to some destination and unpause to actually
     * "consume" the downloaded data.
     */
    public run(options: FileDownloadOptions = {}): Promise<Readable>
    {
        const { signal, accessToken, requestOptions = {}, fileDownloadRetry} = options;
        this.state.numTries += 1
        return new Promise((resolve, reject) => {
            // To merge requestOptions.retry and fileDownloadRetry, we handle the cases where options could be 
            // a number or an object
            let retryOption = requestOptions.retry
            if (typeof(retryOption) === "number") {
                // When the retry option is a number, always go with the fileDownloadRetry value
                retryOption = fileDownloadRetry
            } else { 
                // When retry is an object, we should merge the two, with fileDownloadReady taking precedence
                retryOption = { ...retryOption, ...fileDownloadRetry}
            }
            const localOptions: any = {
                ...requestOptions,
                retry: retryOption,
                decompress: false,
                responseType: "buffer",
                throwHttpErrors: false,
                headers: {
                    ...requestOptions.headers,
                    "accept-encoding": "gzip, deflate, br, identity"
                }
            }

            if (accessToken) {
                localOptions.headers.authorization = `Bearer ${accessToken}`
            }

            this.state.requestOptions = { ...localOptions, url: this.url }

            this.emit("start")

            const downloadRequest = request.stream(this.url, localOptions)

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

            downloadRequest.once("end", () => this.emit("complete"));

            // In case the request itself fails --------------------------------
            // downloadRequest.on("error", reject)
            downloadRequest.on("error", error => {
                this.state.error = error
                reject(error)
            })

            // Count downloaded bytes ------------------------------------------
            downloadRequest.on("data", (data: string) => {
                this.state.downloadedBytes += data.length
            });

            // Everything else happens after we get a response -----------------
            downloadRequest.on("response", (res: Response) => {
                const delay = this.calculateRetryDelay({
                    attemptCount: this.state.numTries,
                    retryOptions: res.request.options.retry,
                    response: res
                })
                if (delay > 0) {
                    return wait(delay, signal).then(() => {
                        // Destroy this current request before making another one
                        downloadRequest.destroy()
                        return this.run(options)
                    }).then(resolve,reject)
                }
                // In case we get an error response ----------------------------
                if (res.statusCode >= 400) {
                    return reject(new FileDownloadError({
                        fileUrl         : this.url,
                        // @ts-ignore
                        body            : res.body,
                        responseHeaders : res.headers,
                        code            : res.statusCode
                    }))
                }

                // Un-compress the response if needed --------------------------
                let decompress = createDecompressor(res);
                res.pipe(decompress)
                
                // Count uncompressed bytes ------------------------------------
                decompress.on("data", (data: string) => {
                    this.state.uncompressedBytes += data.length
                    this.emit("progress")
                });
                
                // Count incoming raw data chunks ------------------------------
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
