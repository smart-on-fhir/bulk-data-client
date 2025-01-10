import { Method, OptionsOfUnknownResponseBody } from "got/dist/source";
import { Algorithm } from "jsonwebtoken"
import jose from "node-jose"

export declare namespace BulkDataClient {

    interface ConfigFileOptions {

        /**
         * FHIR server base URL. Should be set either here, or as CLI parameter
         */
        fhirUrl?: string

        /**
         * The default reporter is "cli". That works well in terminal and
         * renders some fancy stuff like progress bars. However, this does not
         * look good when your STDOUT ends up in log files. For example, if
         * you are using this tool as part of some kind of pipeline and want to
         * maintain clean logs, then consider changing this to "text".
         * 
         * Can be overridden from terminal parameter `--reporter`. 
         * 
         * **Defaults to `cli`**
         */
        reporter?: "cli" | "text"

        requests?: OptionsOfUnknownResponseBody

        // Authorization -------------------------------------------------------
        
        /**
         * Ideally, this can be auto-detected from fhirUrl using metadata in the
         * CapabilityStatement or from /.well-known/smart-configuration.
         * However, if you are using this with a Bulk Data server that does not
         * provide proper metadata, you can manually set the tokenEndpoint below.
         * Leave it empty to auto-detect.
         */
        tokenUrl?: string

        /**
         * The private key used to sign authentication tokens. This must be set
         * in the config file, unless we are connecting to open server (one
         * that has no tokenUrl)
         */
        privateKey?: JWK

        clientId?: string,

        /**
         * When we request an access token, specify its lifetime in seconds.
         * Note that if the token expires during status pooling or during
         * download another authorization request will be made to get new token
         * and then proceed from there.
         * 
         * **Defaults to `300`** (5 min)
         */
        accessTokenLifetime?: number

        
        // Kick-off parameters -------------------------------------------------
        _outputFormat?: string
        _since?: string
        _type?: string
        _elements?: string
        patient?: string
        includeAssociatedData?: string
        _typeFilter?: string
        allowPartialManifests?: boolean
        organizeOutputBy?: string

        /**
         * If true, adds `handling=lenient` to the `prefer` request header. This may
         * enable a "retry" option after certain errors. It can also be used to
         * signal the server to silently ignore unsupported parameters.
         * 
         * Can be overridden from terminal parameter `--lenient`
         */
        lenient?: boolean


        // Download ------------------------------------------------------------

        /**
         * How many downloads to run in parallel. This will speed up the
         * download but can also overload the server. Don't be too greedy and
         * don't set this to more than 10!
         * 
         * **Defaults to `5`**
         */
        parallelDownloads?: number

        /**
         * In some cases it might be useful to also save the export manifest
         * file along with the downloaded NDJSON files.
         * **Defaults to `false`**
         */
        saveManifest?: boolean
        
        // Post processing options ---------------------------------------------

        /**
         * While parsing NDJSON files every single (non-empty) line is parsed
         * as JSON. It is recommended to set a reasonable limit for the line
         * length so that a huge line does not consume the entire memory.
         * 
         * **Defaults to `1000000`**
         */
        ndjsonMaxLineLength?: number

        /**
         * If `true`, verifies that every single JSON object extracted for the
         * NDJSON file has a `resourceType` property, and that this property
         * equals the expected `type` reported in the export manifest.
         * 
         * **Defaults to `true`**
         */
        ndjsonValidateFHIRResourceType?: boolean

        /**
         * If the server reports the file `count` in the export manifest,
         * verify that the number of resources found in the file matches the
         * count reported by the server.
         * 
         * **Defaults to `true`**
         */
        ndjsonValidateFHIRResourceCount?: boolean

        /**
         * The original export manifest will have an `url` property for each
         * file, containing the source location. It his is set to `true`, add
         * a `destination` property to each file containing the path (relative
         * to the manifest file) to the saved file.
         * 
         * This is ONLY useful if `saveManifest` is set to `true`.
         * 
         * **Defaults to `false`**
         */
        addDestinationToManifest?: boolean

        /**
         * Sometimes a server may use weird names for the exported files. For
         * example, a HAPI server will use random numbers as file names. If this
         * is set to `true` files will be renamed to match the standard naming
         * convention - `{fileNumber}.{ResourceType}.ndjson`.
         * 
         * **Defaults to `true`**
         */
        forceStandardFileNames?: boolean

        /**
         * In `DocumentReference` resources, any `attachment` elements having an
         * `url` (instead of inline data) and a `size` below this number will be
         * downloaded and put inline as base64 `data`. Then the `size` property
         * will be updated and the `url` will be removed.
         * 
         * - To always disable this, set it to `0`
         * - To always enable this, set it to `Infinity` (bad idea!)
         * - To inline files smaller than 5 MB set it to `5 * 1024 * 1024` 
         * 
         * **Defaults to `0`**
         */
        inlineDocRefAttachmentsSmallerThan?: number

        /**
         * If an attachment can be inlined (based on its size and the value of
         * the `inlineDocRefAttachmentsSmallerThan` option), then its mime type
         * will be compared with this list. Only files of listed types will be
         * inlined and the rest will be downloaded into "attachment" subfolder.
         * 
         * **Defaults to `["text/plain", "application/pdf"]`**
         */
        inlineDocRefAttachmentTypes?: string[]

        /**
         * If this is true, attachments of type PDF that are being inlined will
         * first be converted to text and then inlined as base64
         * 
         * **Defaults to `false`**
         */
        pdfToText?: boolean

        // Destination options -------------------------------------------------

        /**
         * Examples:
         * - `s3://bucket-name/optional-subfolder/` - Upload to S3
         * - `./downloads` - Save to local folder (relative to the config file)
         * - `downloads` - Save to local folder (relative to the config file)
         * - `/path/to/downloads` - Save to local folder (absolute path)
         * - `file:///path/to/downloads` - Save to local folder (file url)
         * - `http://destination.dev` - Upload to http
         * - `http://username:password@destination.dev` - Upload to http with basic auth
         * - `""` - do nothing
         * - `"none"` - do nothing
         * 
         * **Defaults to `./downloads`**
         */
        destination?: string
        
        /**
         * **Example: `us-east-1`**
         */
        awsRegion?: string

        /**
         * Only needed if `destination` points to S3
         */
        awsAccessKeyId?: string
        
        /**
         * Only needed if `destination` points to S3
         */
        awsSecretAccessKey?: string

        log?: LoggingOptions

        /**
         * If the server does not provide `Retry-after` header use this number of
         * milliseconds before checking the status again
         */
        retryAfterMSec?: number

        /**
        * ResponseHeaders to include in error logs for debugging purposes
        * When 'all' is specified, all responseHeaders are returned
        * When 'none' is specified, no responseHeaders are returned
        * Otherwise, log any responseHeaders matches against 1...* strings/regexp 
        * NOTE: When an empty array is specified, an empty object of responseHeaders will be returned
        */
        logResponseHeaders: "all" | "none" | string | RegExp | (string | RegExp)[],

        /**
         * A subset of got retry configuration object, determining retry behavior when downloading files. 
         * For most scenarios, an object with only a `limit`: `number` property will be sufficient. 
         * This determines how many times a file download will be retried before failing. 
         * Each subsequent attempt will delay using an exponential backoff.
         * For more details on options, see [https://github.com/sindresorhus/got/blob/main/documentation/7-retry.md](https://github.com/sindresorhus/got/blob/main/documentation/7-retry.md).
         */
        fileDownloadRetry: {
            limit?: number;         // The number of times to retry
            methods?: Method[];     // The HTTP methods on which we should retry 
            statusCodes?: number[]; // The status codes to retry on 
            maxRetryAfter?: number; // The maximum amount of time we should wait to retry
        },
    }

    interface LoggingOptions
    {
        enabled?: boolean

        /**
         * Key/value pairs to be added to every log entry. Can be used to add
         * useful information, for example which site imported this data.
         */
        metadata?: Record<string, any>

        /**
         * Path to log file. Absolute, or relative to process CWD. If not
         * provided, the file will be called log.ndjson and will be stored in
         * the downloads folder.
         */
        file?: string
    }

    interface CLIOptions {

        /**
         * FHIR server base URL. Must be set either as parameter or in the
         * configuration file.
         */
        fhirUrl?: string

        _outputFormat?: string
        _since?: string
        _type?: string
        _elements?: string
        patient?: string
        includeAssociatedData?: string
        _typeFilter?: string
        allowPartialManifests?: boolean
        organizeOutputBy?: string
        custom?: string[]

        post?: boolean

        /**
         * Relative path to config file. Defaults to "config.js".
         */
        config?: string

        reporter?: "cli" | "text"

        /**
         * Use if you have a status endpoint of an export that has already been
         * started.
         */
        status?: string
    }

    interface NormalizedOptions {
        /**
         * FHIR server base URL
         */
        fhirUrl: string

        /**
         * The Bulk Data server token URL ("none" for open servers)
         */
        tokenUrl: string

        /**
         * The private key used to sign authentication tokens
         */
        privateKey: jose.JWK.Key

        clientId: string

        scope?: string

        accessTokenLifetime: number

        reporter: "cli" | "text"

        _outputFormat?: string
        _since?: string
        _type?: string
        _elements?: string
        patient?: string
        includeAssociatedData?: string
        _typeFilter?: string
        custom?: string[]
        allowPartialManifests: boolean
        organizeOutputBy: string
        global: boolean
        group: string
        post: boolean

        /**
         * If true, adds `handling=lenient` to the `prefer` request header. This may
         * enable a "retry" option after certain errors. It can also be used to
         * signal the server to silently ignore unsupported parameters.
         * 
         * Can be overridden from terminal parameter `--lenient`
         */
        lenient: boolean

        requests: OptionsOfUnknownResponseBody

        // Download ------------------------------------------------------------

        /**
         * How many downloads to run in parallel. This will speed up the
         * download but can also overload the server. Don't be too greedy and
         * don't set this to more than 10!
         * 
         * **Defaults to `5`**
         */
        parallelDownloads: number

        /**
         * In some cases it might be useful to also save the export manifest
         * file along with the downloaded NDJSON files.
         * 
         * **Defaults to `false`**
         */
        saveManifest: boolean
        
        // Post processing options ---------------------------------------------

        /**
         * While parsing NDJSON files every single (non-empty) line is parsed
         * as JSON. It is recommended to set a reasonable limit for the line
         * length so that a huge line does not consume the entire memory.
         * 
         * **Defaults to `1000000`**
         */
        ndjsonMaxLineLength: number

        /**
         * If `true`, verifies that every single JSON object extracted for the
         * NDJSON file has a `resourceType` property, and that this property
         * equals the expected `type` reported in the export manifest.
         * 
         * **Defaults to `true`**
         */
        ndjsonValidateFHIRResourceType: boolean

        /**
         * If the server reports the file `count` in the export manifest,
         * verify that the number of resources found in the file matches the
         * count reported by the server.
         * 
         * **Defaults to `true`**
         */
        ndjsonValidateFHIRResourceCount: boolean

        /**
         * The original export manifest will have an `url` property for each
         * file, containing the source location. It his is set to `true`, add
         * a `destination` property to each file containing the path (relative
         * to the manifest file) to the saved file.
         * 
         * This is ONLY useful if `saveManifest` is set to `true`.
         * 
         * **Defaults to `false`**
         */
        addDestinationToManifest: boolean

        /**
         * Sometimes a server may use weird names for the exported files. For
         * example, a HAPI server will use random numbers as file names. If this
         * is set to `true` files will be renamed to match the standard naming
         * convention - `{fileNumber}.{ResourceType}.ndjson`.
         * 
         * **Defaults to `true`**
         */
        forceStandardFileNames: boolean

        /**
         * If this is set to `false`, external attachments found in
         * DocumentReference resources will not be downloaded. The
         * DocumentReference resources will still be downloaded but no further
         * processing will be done.
         */
        downloadAttachments: boolean

        /**
         * In `DocumentReference` resources, any `attachment` elements having an
         * `url` (instead of inline data) and a `size` below this number will be
         * downloaded and put inline as base64 `data`. Then the `size` property
         * will be updated and the `url` will be removed.
         * 
         * - To always disable this, set it to `0`
         * - To always enable this, set it to `Infinity` (bad idea!)
         * - To inline files smaller than 5 MB set it to `5 * 1024 * 1024` 
         * 
         * **Defaults to `0`**
         * 
         * **Ignored** if `downloadAttachments` is set to `false`
         */
        inlineDocRefAttachmentsSmallerThan: number

        /**
         * If an attachment can be inlined (based on its size and the value of
         * the `inlineDocRefAttachmentsSmallerThan` option), then its mime type
         * will be compared with this list. Only files of listed types will be
         * inlined and the rest will be downloaded into "attachment" subfolder.
         * 
         * **Defaults to `["text/plain", "application/pdf"]`**
         * 
         * **Ignored** if `downloadAttachments` is set to `false`
         */
        inlineDocRefAttachmentTypes: string[]

        /**
         * If this is true, attachments of type PDF that are being inlined will
         * first be converted to text and then inlined as base64
         * 
         * **Defaults to `false`**
         * 
         * **Ignored** if `downloadAttachments` is set to `false`
         */
        pdfToText: boolean

        // Destination options -------------------------------------------------

        /**
         * Examples:
         * - `s3://bucket-name/optional-subfolder/` - Upload to S3
         * - `./downloads` - Save to local folder (relative to the config file)
         * - `downloads` - Save to local folder (relative to the config file)
         * - `/path/to/downloads` - Save to local folder (absolute path)
         * - `file:///path/to/downloads` - Save to local folder (file url)
         * - `http://destination.dev` - POST to http
         * - `http://username:password@destination.dev` - POST to http with basic auth
         * - `""` - do nothing
         * - `"none"` - do nothing
         * 
         * **Defaults to `./downloads`**
         */
        destination: string

        /**
         * **Example: `us-east-1`**
         */
        awsRegion: string

        /**
         * Only needed if `destination` points to S3
         */
        awsAccessKeyId: string
        
        /**
         * Only needed if `destination` points to S3
         */
        awsSecretAccessKey: string

        log: LoggingOptions

        /**
         * If the server does not provide `Retry-after` header use this number of
         * milliseconds before checking the status again
         */
        retryAfterMSec: number

        /**
        * ResponseHeaders to include in error logs for debugging purposes
        * When 'all' is specified, all responseHeaders are returned
        * When 'none' is specified, no responseHeaders are returned
        * Otherwise, log any responseHeaders matches against 1...* strings/regexp 
        * NOTE: When an empty array is specified, an empty object of responseHeaders will be returned
        */
        logResponseHeaders: "all" | "none" | string | RegExp | (string | RegExp)[]

        /**
         * A subset of got retry configuration object, determining retry behavior when downloading files. 
         * For most scenarios, an object with only a `limit`: `number` property will be sufficient. 
         * This determines how many times a file download will be retried before failing. 
         * Each subsequent attempt will delay using an exponential backoff.
         * For more details on options, see [https://github.com/sindresorhus/got/blob/main/documentation/7-retry.md](https://github.com/sindresorhus/got/blob/main/documentation/7-retry.md).
         */
        fileDownloadRetry: {
            limit?: number;         // The number of times to retry
            methods?: Method[];     // The HTTP methods on which we should retry 
            statusCodes?: number[]; // The status codes to retry on 
            maxRetryAfter?: number; // The maximum amount of time we should wait to retry
        },
    }

    interface JWK {
        alg: Algorithm
        [key: string]: any
    }

    interface TokenResponse {
        access_token: string
    }

    interface ExportManifest {
            
        /**
         * indicates the server's time when the query is run. The response
         * SHOULD NOT include any resources modified after this instant,
         * and SHALL include any matching resources modified up to and
         * including this instant.
         * Note: To properly meet these constraints, a FHIR Server might need
         * to wait for any pending transactions to resolve in its database
         * before starting the export process.
         */
        transactionTime: string // FHIR instant

        /**
         * the full URL of the original bulk data kick-off request
         */
        request: string

        /**
         * indicates whether downloading the generated files requires a
         * bearer access token.
         * Value SHALL be true if both the file server and the FHIR API server
         * control access using OAuth 2.0 bearer tokens. Value MAY be false for
         * file servers that use access-control schemes other than OAuth 2.0,
         * such as downloads from Amazon S3 bucket URLs or verifiable file
         * servers within an organization's firewall.
         */
        requiresAccessToken: boolean
        
        /**
         * an array of file items with one entry for each generated file.
         * If no resources are returned from the kick-off request, the server
         * SHOULD return an empty array.
         */
        output: ExportManifestFile[]

        /**
         * array of error file items following the same structure as the output
         * array.
         * Errors that occurred during the export should only be included here
         * (not in output). If no errors occurred, the server SHOULD return an
         * empty array. Only the OperationOutcome resource type is currently
         * supported, so a server SHALL generate files in the same format as
         * bulk data output files that contain OperationOutcome resources.
         */
        error: ExportManifestFile<"OperationOutcome">[]

        /**
         * An array of deleted file items following the same structure as the
         * output array.
         * 
         * When a `_since` timestamp is supplied in the export request, this
         * array SHALL be populated with output files containing FHIR
         * Transaction Bundles that indicate which FHIR resources would have
         * been returned, but have been deleted subsequent to that date. If no
         * resources have been deleted or the _since parameter was not supplied,
         * the server MAY omit this key or MAY return an empty array.
         * 
         * Each line in the output file SHALL contain a FHIR Bundle with a type
         * of transaction which SHALL contain one or more entry items that
         * reflect a deleted resource. In each entry, the request.url and
         * request.method elements SHALL be populated. The request.method
         * element SHALL be set to DELETE.
         * 
         * Example deleted resource bundle (represents one line in output file):
         * @example 
         * ```json
         * {
         *     "resourceType": "Bundle",
         *     "id": "bundle-transaction",
         *     "meta": { "lastUpdated": "2020-04-27T02:56:00Z" },
         *     "type": "transaction",
         *     "entry":[{
         *         "request": { "method": "DELETE", "url": "Patient/123" }
         *         ...
         *     }]
         * }
         * ```
         */
        deleted?: ExportManifestFile<"Bundle">[]

        /**
         * To support extensions, this implementation guide reserves the name
         * extension and will never define a field with that name, allowing
         * server implementations to use it to provide custom behavior and
         * information. For example, a server may choose to provide a custom
         * extension that contains a decryption key for encrypted ndjson files.
         * The value of an extension element SHALL be a pre-coordinated JSON
         * object.
         */
        extension?: Record<string, any>

        /**
         * When provided, a server with support for the parameter SHALL organize
         * the resources in output files by instances of the specified resource
         * type, including a header for each resource of the type specified in
         * the parameter, followed by the resource and resources in the output
         * that contain references to that resource. When omitted, servers SHALL
         * organize each output file with resources of only single type.
         * 
         * A server unable to structure output by the requested organizeOutputBy
         * resource SHOULD return an error and FHIR OperationOutcome resource.
         * When a Prefer: handling=lenient header is included in the request,
         * the server MAY process the request instead of returning an error.
         */
        outputOrganizedBy?: string

        /**
         * Next link in case of paginated response
         */
        link?: [{ relation: "next"; url: string }]
    }

    interface ExportManifestFile<Type = string> {
        
        /**
         * the FHIR resource type that is contained in the file.
         * Each file SHALL contain resources of only one type, but a server MAY
         * create more than one file for each resource type returned. The number
         * of resources contained in a file MAY vary between servers. If no data
         * are found for a resource, the server SHOULD NOT return an output item
         * for that resource in the response. These rules apply only to top-level
         * resources within the response; as always in FHIR, any resource MAY
         * have a "contained" array that includes referenced resources of other
         * types.
         */
        type: Type

        /**
         * the path to the file. The format of the file SHOULD reflect that
         * requested in the _outputFormat parameter of the initial kick-off
         * request.
         */
        url: string 

        /**
         * the number of resources in the file, represented as a JSON number.
         */
        count?: number
    }

    // export type StatusResponse<T=ExportManifest | OperationOutcome | void> = Response<T>

    interface KickOfParams {
        _since               ?: string
        _outputFormat        ?: string
        patient              ?: (number|string) | (number|string)[]
        _type                ?: string | string[]
        _elements            ?: string | string[]
        includeAssociatedData?: string | string[]
        _typeFilter          ?: string | string[]
        allowPartialManifests?: boolean
        organizeOutputBy     ?: string
    }

    interface FileDownload {

        /**
         * The file URL
         */
        readonly url: string

        /**
         * The file display name (typically the URL basename)
         */
        readonly name: string

        /**
         * The FHIR resourceType
         */
        readonly type: string

        /**
         * `true` if the file has been fully downloaded
         */
        completed: boolean
    
        /**
         * Number of chunks received (downloaded as stream with chunked encoding)
         */
        downloadedChunks: number

        /**
         * Number of bytes downloaded
         */
        downloadedBytes: number

        /**
         * Number of bytes after decompression. If the response is compressed,
         * this will be greater than downloadedBytes
         */
        uncompressedBytes: number

        /**
         * Number of FHIR resources in the file (applicable for FHIR NDJSON)
         */
        resources: number

        /**
         * Number of downloaded attachments (for DocumentReferences)
         */
        attachments: number

        /**
         * Download processing error (if any)
         */
        error: Error | null

        /**
         * `true` if this is a file from the "deleted" array of the export manifest
         */
        // readonly deleted: boolean

        /**
         * The value shows which part of the manifest this download comes from.
         * Can be:
         * - "output"  - For exported files
         * - "deleted" - The "deleted" bundles
         * - "error"   - For ndjson files with error operation outcomes 
         */
        readonly exportType: "output" | "deleted" | "error"
    }

    interface FileDownloadProgress {
        // running: boolean
        // completed: boolean
        downloadedChunks: number
        downloadedBytes: number
        uncompressedBytes: number 
        resources: number
        attachments: number
        // error: Error | null
    }

    interface TokenResponse {
        token_type: "bearer"
        scope: "string"
        expires_in?: number
        access_token: string
    }

    interface ExportStatus {
        startedAt        : number
        completedAt      : number
        elapsedTime      : number
        percentComplete  : number
        nextCheckAfter   : number
        message          : string
        xProgressHeader ?: string
        retryAfterHeader?: string
        body            ?: any
        virtual         ?: boolean
        statusEndpoint   : string
    }
    
    interface ResponseHeaders {
        [key: string]: string | string[] | undefined
    } 
}

export interface JsonObject { [key: string]: JsonValue; }
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonArray | JsonObject;
export type JsonArray = JsonValue[];
