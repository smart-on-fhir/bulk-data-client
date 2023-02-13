import                               "colors"
import { Command }              from "commander"
import { resolve }              from "path"
import jose                     from "node-jose"
import prompt                   from "prompt-sync"
import { BulkDataClient }       from ".."
import { detectTokenUrl, exit } from "./lib/utils"
import Client                   from "./lib/BulkDataClient"
import CLIReporter              from "./reporters/cli"
import TextReporter             from "./reporters/text"
import { createLogger }         from "./loggers"

const reporters = {
    cli : CLIReporter,
    text: TextReporter
}

const APP = new Command()

APP.name("node .")

APP.version("2.0.0")

// Bulk Data Server base URL
APP.option("-f, --fhir-url [url]"              , "FHIR server base URL. Must be set either as parameter or in the configuration file.")
APP.option('-F, --_outputFormat [string]'      , `The output format you expect.`)
APP.option("-s, --_since [date]"               , "Only include resources modified after this date")
APP.option('-t, --_type [list]'                , "Zero or more resource types to download. If omitted downloads everything.")
APP.option('-e, --_elements [list]'            , 'Zero or more FHIR elements to include in the downloaded resources')
APP.option('-p, --patient [list]'              , 'Zero or more patient IDs to be included. Implies --post')
APP.option('-i, --includeAssociatedData [list]', 'String of comma delimited values. When provided, server with support for the parameter and requested values SHALL return a pre-defined set of metadata associated with the request.')
APP.option('-q, --_typeFilter [string]'        , 'Experimental _typeFilter parameter passed as is to the server')
APP.option('--global'                          , 'Global (system-level) export')
APP.option('--post'                            , 'Use POST kick-off requests')
APP.option('-g, --group [id]'                  , 'Group ID - only include resources that belong to this group. Ignored if --global is set')
APP.option('--lenient'                         , 'Sets a "Prefer: handling=lenient" request header to tell the server to ignore unsupported parameters')
APP.option('-d, --destination [destination]'   , 'Download destination. See config/defaults.js for examples')
APP.option("--config <path>"                   , 'Relative path to config file.');
APP.option("--reporter [cli|text]"             , 'Reporter to use to render the output. "cli" renders fancy progress bars and tables. "text" is better for log files. Defaults to "cli".');
APP.option("-c, --custom [opt=val...]"         , "Custom parameters to be passed to the kick-off endpoint.");
APP.option("--status [url]"                    , "Status endpoint of already started export.");

APP.action(async (args: BulkDataClient.CLIOptions) => {
    const { config, ...params } = args;
    const defaultsPath = resolve(__dirname, "../config/defaults.js");  
    const base: BulkDataClient.NormalizedOptions = require(defaultsPath)
    const options: any = { ...base };
    
    if (config) {
        const configPath   = resolve(__dirname, "..", config);
        const cfg: BulkDataClient.ConfigFileOptions = require(configPath)
        Object.assign(options, cfg)
    }

    Object.assign(options, params)


    // Verify fhirUrl ----------------------------------------------------------
    if (!options.fhirUrl) {
        console.log(
            "A 'fhirUrl' is required as configuration option, or as '-f' or " +
            "'--fhir-url' parameter!".red
        )
        return APP.help()
    }
    options.fhirUrl = options.fhirUrl.replace(/\/*$/, "/")

    // Verify tokenUrl ---------------------------------------------------------
    if (!options.tokenUrl) {
        try {
            options.tokenUrl = await detectTokenUrl(options.fhirUrl);
        } catch {
            console.log(
                "Failed to auto-detect 'tokenUrl'! " +
                "Please set it in the config file".red
            )
            return;
        }
    }

    // Verify privateKey -------------------------------------------------------
    if (options.tokenUrl !== "none") {
        if (!options.privateKey) {
            console.log(
                "A 'privateKey' option must be set in the config file!".red
            )
            return;
        }

        try {
            options.privateKey = await jose.JWK.asKey(options.privateKey, "json")
        } catch {
            console.log(
                "Invalid 'privateKey' option in the config file!".red
            )
            return;
        }
    }

    options.log = {
        enabled: true,
        ...(options.log || {})
    }

    const client = new Client(options)
    const reporter = reporters[(options as BulkDataClient.NormalizedOptions).reporter](client)
    if (options.log.enabled) {
        
        const logger = createLogger(options.log)
        const startTime = Date.now()

        // kickoff -----------------------------------------------------------------
        client.on("kickOffEnd", ({ requestParameters, capabilityStatement, response }) => {
            logger.log("info", {
                eventId: "kickoff",
                eventDetail: {
                    exportUrl          : response.requestUrl,
                    errorCode          : response.statusCode >= 400 ? response.statusCode : null,
                    errorBody          : response.statusCode >= 400 ? response.body       : null,
                    softwareName       : capabilityStatement.software?.name              || null,
                    softwareVersion    : capabilityStatement.software?.version           || null,
                    softwareReleaseDate: capabilityStatement.software?.releaseDate       || null,
                    fhirVersion        : capabilityStatement.fhirVersion                 || null,
                    requestParameters
                }
            })
        })

        // status_progress ---------------------------------------------------------
        client.on("exportProgress", e => {
            if (!e.virtual) { // skip the artificially triggered 100% event
                logger.log("info", {
                    eventId: "status_progress",
                    eventDetail: {
                        body      : e.body,
                        xProgress : e.xProgressHeader,
                        retryAfter: e.retryAfterHeader
                    }
                })
            }
        })

        // status_error ------------------------------------------------------------
        client.on("exportError", eventDetail => {
            logger.log("error", {
                eventId: "status_error",
                eventDetail
            });
        })

        // status_complete ---------------------------------------------------------
        client.on("exportComplete", manifest => {
            logger.log("info", {
                eventId: "status_complete",
                eventDetail: {
                    transactionTime : manifest.transactionTime,
                    outputFileCount : manifest.output.length,
                    deletedFileCount: manifest.deleted?.length || 0,
                    errorFileCount  : manifest.error.length
                }
            })
        })

        // download_request --------------------------------------------------------
        client.on("downloadStart", eventDetail => {
            logger.log("info", { eventId: "download_request", eventDetail })
        })

        // download_complete -------------------------------------------------------
        client.on("downloadComplete", eventDetail => {
            logger.log("info", { eventId: "download_complete", eventDetail })
        })

        // download_error ----------------------------------------------------------
        client.on("downloadError", eventDetail => {
            logger.log("info", { eventId: "download_error", eventDetail })
        })

        // export_complete ---------------------------------------------------------
        client.on("allDownloadsComplete", downloads => {
            const eventDetail = {
                files      : 0,
                resources  : 0,
                bytes      : 0,
                attachments: 0,
                duration   : Date.now() - startTime
            };
        
            downloads.forEach(d => {
                eventDetail.files       += 1
                eventDetail.resources   += d.resources
                eventDetail.bytes       += d.uncompressedBytes
                eventDetail.attachments += d.attachments
            })
        
            logger.log("info", { eventId: "export_complete", eventDetail })
        })
    }

    process.on("SIGINT", () => {
        console.log("\nExport canceled.".magenta.bold);
        reporter.detach()
        client.abort();
        process.exit(0);
    });

    process.on("uncaughtException", e => exit(e));

    client.on("error", error => {
        console.error(error)
        process.exit(1);
    })
    
    const statusEndpoint = options.status || await client.kickOff()
    const manifest = await client.waitForExport(statusEndpoint)
    const downloads = await client.downloadAllFiles(manifest)
    // console.log(downloads)
    
    if (options.reporter === "cli") {
        const answer = prompt()("Do you want to signal the server that this export can be removed? [Y/n]".cyan);
        if (!answer || answer.toLowerCase() === 'y') {
            client.cancelExport(statusEndpoint).then(
                () => console.log("\nThe server was asked to remove this export!".green.bold)
            )
        }
    }
})

async function main() {
    await APP.parseAsync(process.argv);
}

main()
