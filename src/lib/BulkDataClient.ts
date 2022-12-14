import { promisify, debuglog }          from "util"
import jwt                              from "jsonwebtoken"
import jose                             from "node-jose"
import { URL, fileURLToPath }           from "url"
import { EventEmitter }                 from "events"
import aws                              from "aws-sdk"
import { basename, join, resolve, sep } from "path"
import FS, { mkdirSync }                from "fs"
import { expect }                       from "@hapi/code"
import { OptionsOfUnknownResponseBody, Response } from "got/dist/source"
import { PassThrough, Readable, Stream, Writable } from "stream"
import { pipeline }                     from "stream/promises"
import request                          from "./request"
import FileDownload                     from "./FileDownload"
import ParseNDJSON                      from "../streams/ParseNDJSON"
import StringifyNDJSON                  from "../streams/StringifyNDJSON"
import DocumentReferenceHandler         from "../streams/DocumentReferenceHandler"
import { BulkDataClient as Types }      from "../.."
import { FileDownloadError }            from "./errors"
import {
    assert,
    fhirInstant,
    formatDuration,
    getAccessTokenExpiration,
    getCapabilityStatement,
    wait
} from "./utils"

EventEmitter.defaultMaxListeners = 30;


const debug = debuglog("app-request")

/**
 * The BulkDataClient instances emit the following events:
 */
export interface BulkDataClientEvents {
    /**
     * Emitted every time new access token is received
     * @event
     */
    "authorize": (this: BulkDataClient, accessToken: string) => void;

    /**
     * Emitted when new export is started
     * @event
     */
    "kickOffStart": (this: BulkDataClient, requestOptions: OptionsOfUnknownResponseBody) => void;
    
    /**
     * Emitted when a kick-off response is received
     * @event
     */
    "kickOffEnd": (this: BulkDataClient, data: {
        response           : Response
        capabilityStatement: fhir4.CapabilityStatement
        requestParameters  : Record<string, any>
    }) => void;
    
    /**
     * Emitted when the export has began
     * @event
     */
    "exportStart": (this: BulkDataClient, status: Types.ExportStatus) => void;
    
    /**
     * Emitted for every status change while waiting for the export
     * @event
     */
    "exportProgress": (this: BulkDataClient, status: Types.ExportStatus) => void;

    "exportError": (this: BulkDataClient, details: {
        body: string | fhir4.OperationOutcome | null
        code: number | null
    }) => void;
    
    /**
     * Emitted when the export is completed
     * @event
     */
    "exportComplete": (this: BulkDataClient, manifest: Types.ExportManifest) => void;
    
    /**
     * Emitted when the download starts
     * @event
     */
    "downloadStart": (this: BulkDataClient, detail: {
        fileUrl: string
        itemType: string
        resourceType: string | null
    }) => void;
    
    /**
     * Emitted for any status change while files are being downloaded
     * @event
     */
    "downloadProgress": (this: BulkDataClient, downloads: Types.FileDownload[]) => void;

    /**
     * Emitted for every file which fails to download
     * @event
     */
    "downloadError": (this: BulkDataClient, details: {
        body: string | fhir4.OperationOutcome | null // Buffer
        code: number | null
        fileUrl: string
    }) => void;

    /**
     * Emitted when any file has been downloaded
     * @event
     */
    "downloadComplete": (this: BulkDataClient, detail: {
        fileUrl      : string
        fileSize     : number
        resourceCount: number | null // null for attachments
    }) => void;

    /**
     * Emitted when all files have been downloaded
     * @event
     */
    "allDownloadsComplete": (this: BulkDataClient, downloads: Types.FileDownload[]) => void;
    
    /**
     * Emitted on error
     * @event
     */
    "error": (this: BulkDataClient, error: Error) => void;
    
    /**
     * Emitted when the flow is aborted by the user
     * @event
     */
    "abort": (this: BulkDataClient) => void;
}

interface BulkDataClient {

    on<U extends keyof BulkDataClientEvents>(event: U, listener: BulkDataClientEvents[U]): this;
    // on(event: string, listener: Function): this;

    emit<U extends keyof BulkDataClientEvents>(event: U, ...args: Parameters<BulkDataClientEvents[U]>): boolean;
    // emit(event: string, ...args: any[]): boolean;
}

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
class BulkDataClient extends EventEmitter
{
    /**
     * The options of the instance
     */
    readonly options: Types.NormalizedOptions;

    /**
     * Used internally to emit abort signals to pending requests and other async
     * jobs.
     */
    private abortController: AbortController;

    /**
     * The last known access token is stored here. It will be renewed when it
     * expires. 
     */
    private accessToken: string = "";

    /**
     * Every time we get new access token, we set this field based on the
     * token's expiration time.
     */
    private accessTokenExpiresAt: number = 0;

    /**
     * Nothing special is done here - just remember the options and create
     * AbortController instance
     */
    constructor(options: Types.NormalizedOptions)
    {
        super();
        this.options = options;
        this.abortController = new AbortController();
        this.abortController.signal.addEventListener("abort", () => {
            this.emit("abort")
        });
    }

    /**
     * Abort any current asynchronous task. This may include:
     * - pending HTTP requests
     * - wait timers
     * - streams and stream pipelines
     */
    public abort() {
        this.abortController.abort()
    }

    /**
     * Used internally to make requests that will automatically authorize if
     * needed and that can be aborted using [this.abort()]
     * @param options Any request options
     * @param label Used to render an error message if the request is aborted
     */
    public async request<T=unknown>(options: OptionsOfUnknownResponseBody, label = "request"): Promise<Response<T>>
    {
        const _options: OptionsOfUnknownResponseBody = {
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
        }

        const accessToken = await this.getAccessToken();

        if (accessToken) {
            _options.headers = {
                ...options.headers,
                authorization: `Bearer ${ accessToken }`
            };
        }

        const req = request<T>(_options as any);

        const abort = () => {
            debug(`Aborting ${label}`)
            req.cancel()
        };

        this.abortController.signal.addEventListener("abort", abort, { once: true });

        return req.then(res => {
            this.abortController.signal.removeEventListener("abort", abort);
            return res
        });
    }

    /**
     * Get an access token to be used as bearer in requests to the server.
     * The token is cached so that we don't have to authorize on every request.
     * If the token is expired (or will expire in the next 10 seconds), a new
     * one will be requested and cached.
     */
    private async getAccessToken()
    {
        if (this.accessToken && this.accessTokenExpiresAt - 10 > Date.now() / 1000) {
            return this.accessToken;
        }

        const { tokenUrl, clientId, accessTokenLifetime, privateKey } = this.options;

        if (!tokenUrl || tokenUrl == "none" || !clientId || !privateKey) {
            return ""
        }

        const claims = {
            iss: clientId,
            sub: clientId,
            aud: tokenUrl,
            exp: Math.round(Date.now() / 1000) + accessTokenLifetime,
            jti: jose.util.randomBytes(10).toString("hex")
        };

        const token = jwt.sign(claims, privateKey.toPEM(true), {
            algorithm: privateKey.alg as jwt.Algorithm,
            keyid: privateKey.kid
        });

        const authRequest = request<Types.TokenResponse>(tokenUrl, {
            method: "POST",
            responseType: "json",
            form: {
                scope: this.options.scope || "system/*.read",
                grant_type: "client_credentials",
                client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
                client_assertion: token
            }
        });

        const abort = () => {
            debug("Aborting authorization request")
            authRequest.cancel()
        };

        this.abortController.signal.addEventListener("abort", abort, { once: true });

        return authRequest.then(res => {
            assert(res.body, "Authorization request got empty body")
            assert(res.body.access_token, "Authorization response does not include access_token")
            assert(res.body.expires_in, "Authorization response does not include expires_in")
            this.accessToken = res.body.access_token || ""
            this.accessTokenExpiresAt = getAccessTokenExpiration(res.body)
            this.emit("authorize", this.accessToken)
            return res.body.access_token
        }).finally(() => {
            this.abortController.signal.removeEventListener("abort", abort);
        });
    }

    /**
     * Makes the kick-off request and resolves with the status endpoint URL
     */
    public async kickOff(): Promise<string>
    {
        const { fhirUrl, global, group, lenient, patient, post } = this.options;

        if (global) {
            var url = new URL("$export", fhirUrl);
        }
        else if (group) {
            var url = new URL(`Group/${group}/$export`, fhirUrl);
        }
        else {
            var url = new URL("Patient/$export", fhirUrl);
        }

        const { body: capabilityStatement } = await getCapabilityStatement(fhirUrl)

        const requestOptions: OptionsOfUnknownResponseBody = {
            url,
            responseType: "json",
            headers: {
                accept: "application/fhir+json",
                prefer: `respond-async${lenient ? ", handling=lenient" : ""}`
            }
        }

        if (post || patient) {
            requestOptions.method = "POST";
            requestOptions.json   = this.buildKickOffPayload();
        } else {
            this.buildKickOffQuery(url.searchParams);
        }

        this.emit("kickOffStart", requestOptions)

        const requestParameters: any = {
            _outputFormat: this.options._outputFormat                 || undefined,
            _since       : fhirInstant(this.options._since)           || undefined,
            _type        : this.options._type                         || undefined,
            _elements    : this.options._elements                     || undefined,
            includeAssociatedData: this.options.includeAssociatedData || undefined,
            _typeFilter: this.options._typeFilter                     || undefined
        }

        if (Array.isArray(this.options.custom)) {
            this.options.custom.forEach(p => {
                const [name, value] = p.trim().split("=")
                requestParameters[name] = value
            })
        }

        const res = await this.request(requestOptions, "kick-off request")
            .catch(error => {
                this.emit("kickOffEnd", { response: res, capabilityStatement, requestParameters })
                throw error
            });

        const location = res.headers["content-location"];
        
        assert(location, "The kick-off response did not include content-location header")
        
        this.emit("kickOffEnd", { response: res, capabilityStatement, requestParameters })
        
        return location
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
    public async waitForExport(statusEndpoint: string): Promise<Types.ExportManifest>
    {
        const status = {
            startedAt       : Date.now(),
            completedAt     : -1,
            elapsedTime     : 0,
            percentComplete : -1,
            nextCheckAfter  : 1000,
            message         : "Bulk Data export started",
            xProgressHeader : "",
            retryAfterHeader: "",
            statusEndpoint
        };

        this.emit("exportStart", status)

        const checkStatus: () => Promise<Types.ExportManifest> = async () => {
            
            return this.request<Types.ExportManifest>({
                url: statusEndpoint,
                throwHttpErrors: false,
                responseType: "json",
                headers: {
                    accept: "application/json"
                }
            }, "status request").then(res => {
                const now = Date.now();
                const elapsedTime = now - status.startedAt
                
                status.elapsedTime = elapsedTime

                // Export is complete
                if (res.statusCode == 200) {
                    status.completedAt = now
                    status.percentComplete = 100
                    status.nextCheckAfter = -1
                    status.message = `Bulk Data export completed in ${formatDuration(elapsedTime)}`

                    this.emit("exportProgress", { ...status, virtual: true })

                    expect(res.body, "No export manifest returned").to.exist()
                    expect(res.body.output, "The export manifest output is not an array").to.be.an.array();
                    expect(res.body.output, "The export manifest output contains no files").to.not.be.empty()

                    this.emit("exportComplete", res.body)
                    // debug("%o", status)
                    return res.body
                }

                // Export is in progress
                if (res.statusCode == 202) {
                    const now = Date.now();

                    const progress    = String(res.headers["x-progress" ] || "").trim();
                    const retryAfter  = String(res.headers["retry-after"] || "").trim();
                    const progressPct = parseInt(progress, 10);

                    let retryAfterMSec = 1000;
                    if (retryAfter.match(/\d+/)) {
                        retryAfterMSec = parseInt(retryAfter, 10) * 1000
                    } else {
                        let d = new Date(retryAfter);
                        retryAfterMSec = Math.ceil(d.getTime() - now)
                    }

                    const poolDelay = Math.min(Math.max(retryAfterMSec/10, 1000), 10000)

                    Object.assign(status, {
                        percentComplete: isNaN(progressPct) ? -1 : progressPct,
                        nextCheckAfter: poolDelay,
                        message: isNaN(progressPct) ?
                            `Bulk Data export: in progress for ${formatDuration(elapsedTime)}${progress ? ". Server message: " + progress : ""}`:
                            `Bulk Data export: ${progressPct}% complete in ${formatDuration(elapsedTime)}`
                    });

                    this.emit("exportProgress", {
                        ...status,
                        retryAfterHeader: retryAfter,
                        xProgressHeader : progress,
                        body            : res.body
                    })
                    // debug("%o", status)
                    
                    return wait(poolDelay, this.abortController.signal).then(checkStatus)
                }
                else {
                    this.emit("exportError", {
                        body: res.body as any || null,
                        code: res.statusCode || null
                    });

                    // TODO: handle unexpected response
                    throw new Error(`Unexpected status response ${res.statusCode} ${res.statusMessage}`)
                    // this.emit("error", status)
                }
            });

        };
        
        return checkStatus()
    }

    public async downloadAllFiles(manifest: Types.ExportManifest): Promise<Types.FileDownload[]>
    {
        
        return new Promise((resolve, reject) => {

            // Count how many files we have gotten for each ResourceType. This
            // is needed if the forceStandardFileNames option is true
            const fileCounts: { [key: string]: number } = {}

            const createDownloadJob = (f: Types.ExportManifestFile, initialState: Partial<Types.FileDownload> = {}) => {

                if (!(f.type in fileCounts)) {
                    fileCounts[f.type] = 0;
                }
                fileCounts[f.type]++;

                let fileName = basename(f.url)
                if (this.options.forceStandardFileNames) {
                    fileName = `${fileCounts[f.type]}.${f.type}.ndjson`
                }

                const status: Types.FileDownload = {
                    url              : f.url,
                    type             : f.type,
                    name             : fileName,
                    downloadedChunks : 0,
                    downloadedBytes  : 0,
                    uncompressedBytes: 0,
                    resources        : 0,
                    attachments      : 0,
                    running          : false,
                    completed        : false,
                    exportType       : "output",
                    error            : null,
                    ...initialState
                }

                return {
                    status,
                    descriptor: f,
                    worker: async () => {
                        status.running = true
                        status.completed = false
                        await this.downloadFile({
                            file: f,
                            fileName,
                            onProgress: state => {
                                Object.assign(status, state)
                                this.emit("downloadProgress", downloadJobs.map(j => j.status))
                            },
                            authorize: manifest.requiresAccessToken,
                            subFolder: status.exportType == "output" ? "" : status.exportType,
                            exportType: status.exportType
                        })

                        status.running = false
                        status.completed = true

                        if (this.options.addDestinationToManifest) {
                            // @ts-ignore
                            f.destination = join(this.options.destination, fileName)
                        }

                        tick()
                    }
                };
            };

            const downloadJobs = [
                ...(manifest.output  || []).map(f => createDownloadJob(f, { exportType: "output"  })),
                ...(manifest.deleted || []).map(f => createDownloadJob(f, { exportType: "deleted" })),
                ...(manifest.error   || []).map(f => createDownloadJob(f, { exportType: "error"   }))
            ];

            const tick = () => {
                
                let completed = 0
                let running   = 0
                for (const job of downloadJobs) {
                    if (job.status.completed) {
                        completed += 1
                        continue
                    }
                    if (job.status.running) {
                        running += 1
                        continue
                    }
                    if (running < this.options.parallelDownloads) {
                        running += 1
                        job.worker()
                    }
                }

                this.emit("downloadProgress", downloadJobs.map(j => j.status))

                if (completed === downloadJobs.length) {
                    const downloads = downloadJobs.map(j => j.status)
                    this.emit("allDownloadsComplete", downloads)
                    if (this.options.saveManifest) {
                        this.writeToDestination(
                            "manifest.json",
                            Readable.from(JSON.stringify(manifest, null, 4))
                        ).then(() => {
                            resolve(downloads)
                        });
                    } else {
                        resolve(downloads)
                    }
                }
            };

            tick()
        })
    }

    private async downloadFile({
        file,
        fileName,
        onProgress,
        authorize = false,
        subFolder = "",
        exportType = "output"
    }:
    {
        file       : Types.ExportManifestFile
        fileName   : string
        onProgress : (state: Partial<Types.FileDownloadProgress>) => any
        authorize ?: boolean
        subFolder ?: string
        exportType?: string
    })
    {
        let accessToken = ""

        if (authorize) {
            accessToken = await this.getAccessToken()
        }

        this.emit("downloadStart", {
            fileUrl     : file.url,
            itemType    : exportType,
            resourceType: file.type
        })

        const download = new FileDownload(file.url)

        // Collect different properties form different events. The aggregate
        // object will be used to emit progress events once, after a FHIR 
        // resource has been parsed 
        let _state = {
            ...download.getState(),
            resources: 0,
            attachments: 0,
            itemType: exportType
        }

        // Just "remember" the progress values but don't emit anything yet
        download.on("progress", state => Object.assign(_state, state))

        // Start the download (the stream will be paused though)
        let processPipeline: Readable = await download.run({
            accessToken,
            signal: this.abortController.signal,
            requestOptions: this.options.requests
        }).catch(e => {
            if (e instanceof FileDownloadError) {
                this.emit("downloadError", {
                    body: null, // Buffer
                    code: e.code,
                    fileUrl: e.fileUrl
                })
            }
            throw e
        });

        // ---------------------------------------------------------------------
        // Create an NDJSON parser to verify that every single line is valid
        // ---------------------------------------------------------------------
        let expectedResourceType = ""
        if (this.options.ndjsonValidateFHIRResourceType) {
            switch (exportType) {
                case "output": expectedResourceType = file.type; break;
                case "deleted": expectedResourceType = "Bundle" ; break;
                case "error": expectedResourceType = "OperationOutcome"; break;
                default: expectedResourceType = ""; break;
            }
        }

        const parser = new ParseNDJSON({
            maxLineLength: this.options.ndjsonMaxLineLength,
            expectedCount: exportType == "output" ? file.count || -1 : -1,
            expectedResourceType
        })

        processPipeline = processPipeline.pipe(parser);


        // ---------------------------------------------------------------------
        // Download attachments
        // ---------------------------------------------------------------------
        if (this.options.downloadAttachments !== false) {

            const docRefProcessor = new DocumentReferenceHandler({
                request: (options: OptionsOfUnknownResponseBody) => {
                    this.emit("downloadStart", {
                        fileUrl     : options.url!.toString(),
                        itemType    : "attachment",
                        resourceType: null
                    })
                    return this.request(options, "Attachment")
                },
                onDownloadComplete: (url, byteSize) => {
                    this.emit("downloadComplete", {
                        fileUrl      : url,
                        fileSize     : byteSize,
                        resourceCount: null
                    })
                },
                inlineAttachments    : this.options.inlineDocRefAttachmentsSmallerThan,
                inlineAttachmentTypes: this.options.inlineDocRefAttachmentTypes,
                pdfToText            : this.options.pdfToText,
                baseUrl              : this.options.fhirUrl,
                save: (name: string, stream: Readable, subFolder: string) => {
                    return this.writeToDestination(name, stream, subFolder)
                },
            })
    
            docRefProcessor.on("attachment", () => _state.attachments! += 1)

            processPipeline = processPipeline.pipe(docRefProcessor)
        }


        // ---------------------------------------------------------------------
        // Transforms from stream of objects back to stream of line strings
        // ---------------------------------------------------------------------
        const stringify = new StringifyNDJSON()
        stringify.on("data", () => {
            _state.resources! += 1
            onProgress(_state)
        });
        processPipeline = processPipeline.pipe(stringify);


        // ---------------------------------------------------------------------
        // Write the file to the configured destination
        // ---------------------------------------------------------------------
        await this.writeToDestination(fileName, processPipeline, subFolder)

        this.emit("downloadComplete", {
            fileUrl      : file.url,
            fileSize     : _state.uncompressedBytes,
            resourceCount: _state.resources!
        })
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
    private writeToDestination(fileName: string, inputStream: Readable, subFolder = "") {
        const destination = String(this.options.destination || "none").trim();

        // No destination ------------------------------------------------------
        if (!destination || destination.toLowerCase() == "none") {
            return pipeline(inputStream, new Writable({
                write(chunk, encoding, cb) { cb() }
            }))
        }

        // S3 ------------------------------------------------------------------
        if (destination.startsWith("s3://")) {

            if (this.options.awsAccessKeyId && this.options.awsSecretAccessKey) {
                aws.config.update({
                    accessKeyId    : this.options.awsAccessKeyId,
                    secretAccessKey: this.options.awsSecretAccessKey
                })
            }

            if (this.options.awsRegion) {
                aws.config.update({ region: this.options.awsRegion })
            }

            let bucket = destination.substring(5);
            if (subFolder) {
                bucket = join(bucket, subFolder)
            }

            const upload = new aws.S3.ManagedUpload({
                params: {
                    Bucket: bucket,
                    Key   : fileName,
                    Body  : inputStream
                }
            });

            return upload.promise()
        }

        // HTTP ----------------------------------------------------------------
        if (destination.match(/^https?\:\/\//)) {
            return pipeline(
                inputStream,
                request.stream.post(join(destination, fileName) + "?folder=" + subFolder),
                new PassThrough()
            );
        }

        // local filesystem destinations ---------------------------------------
        let path = destination.startsWith("file://") ?
            fileURLToPath(destination) :
            destination.startsWith(sep) ?
                destination :
                resolve(__dirname, "../..", destination);

        assert(FS.existsSync(path), `Destination "${path}" does not exist`)
        assert(FS.statSync(path).isDirectory, `Destination "${path}" is not a directory`)

        if (subFolder) {
            path = join(path, subFolder)
            if (!FS.existsSync(path)) {
                mkdirSync(path)
            }
        }

        return pipeline(inputStream, FS.createWriteStream(join(path, fileName)));
    }

    /**
     * Given an URL query as URLSearchParams object, appends all the
     * user-defined Bulk Data Export kick-off parameters from CLI or from config
     * files and returns the query object
     * @param params URLSearchParams object to augment
     * @returns The same URLSearchParams object, possibly augmented with new
     * parameters
     */
    private buildKickOffQuery(params: URLSearchParams): URLSearchParams
    {
        if (this.options._outputFormat) {
            params.append("_outputFormat", this.options._outputFormat);
        }

        const since = fhirInstant(this.options._since);
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
                const [name, value] = p.trim().split("=")
                params.append(name, value)
            })
        }

        return params
    }

    private buildKickOffPayload(): fhir4.Parameters
    {
        const parameters: fhir4.ParametersParameter[] = []

        // _since --------------------------------------------------------------
        const since = fhirInstant(this.options._since);
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
                let [name, value] = p.trim().split(/\s*=\s*/)

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
                else if (fhirInstant(value)) {
                    parameters.push({ name, valueInstant: fhirInstant(value) })
                }
                else {
                    parameters.push({ name, valueString: value })
                }
            })
        }

        return {
            resourceType: "Parameters",
            parameter: parameters
        };
    }

    public cancelExport(statusEndpoint: string) {
        this.abort();
        return this.request({
            method: "DELETE",
            url: statusEndpoint,
            responseType: "json"
        });
    }
}

export default BulkDataClient
