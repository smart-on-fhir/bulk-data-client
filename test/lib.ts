import { spawn, StdioOptions }     from "child_process"
import { join }                    from "path"
import { BulkDataClient as types } from "../index"
import baseSettings                from "../config/defaults.js"
import MockServer                  from "./MockServer"
import {
    existsSync,
    readdirSync,
    readFileSync,
    rmSync,
    writeFileSync,
    statSync
} from "fs"


export const mockServer = new MockServer("Mock Server", true)

before(async () => {
    await mockServer.start()
});

after(async () => {
    await mockServer.stop();
});

afterEach(async () => {
    mockServer.clear();
})

export function isFile(path: string): boolean {
    const stat = statSync(path, { throwIfNoEntry: false })
    return !!(stat && stat.isFile())
}

export function emptyFolder(path: string) {
    if (existsSync(path)) {
        readdirSync(path, { withFileTypes: true }).forEach(entry => {
            if (entry.name !== ".gitkeep" && entry.isFile()) {
                rmSync(join(path, entry.name))
            }
        })
    }
}

/**
 * Invokes the client and replies with a promise that will resolve when the
 * download is complete
 */
export async function invoke({
    options = {},
    args = [],
    timeout = 30000,
    stdio = "ignore",
    env = {}
}: {
    /**
     * Any custom options to pass
     */
    options?: Partial<types.NormalizedOptions>
    
    /**
     * Any custom arguments to pass
     */
    args?: string[]
    
    /**
     * Timeout in milliseconds. Defaults to `30000`.
     */
    timeout?: number,

    /**
     * Stdio option for the process
     */
    stdio?: StdioOptions

    /**
     * Environment variables for the process, overriding the defaults below.
     * Set one to `undefined` to remove it.
     */
    env?: Record<string, string | undefined>
} = {}): Promise<{
    config: types.NormalizedOptions
    log: string,
    exitCode: number | null
}>
{
    return new Promise((resolve, reject) => {

        const logFile = __dirname + "/tmp/log.ndjson"

        const fullOptions = {
            ...baseSettings,
            destination: __dirname + "/tmp/downloads",
            fhirUrl: mockServer.baseUrl,
            ...options,
            reporter: "text",
            ndjsonValidateFHIRResourceType: true,
            log: {
                ...baseSettings.log,
                ...options.log,
                file: logFile
            }
        };

        if (!isFile(logFile)) {
            writeFileSync(logFile, "")
        }

        const configPath  = join(__dirname, "tmp/config.js")

        writeFileSync(configPath,  "module.exports = " + JSON.stringify(fullOptions, null, 4), "utf8")
        
        const client = spawn("ts-node", [
            "./src/app.ts",
            "--config",
            configPath,
            ...args
        ], {
            cwd: join(__dirname, ".."),
            timeout,
            stdio,
            env: {
                ...process.env,
                // Prevent ts-mocha's own TS_NODE_PROJECT (pointed at
                // test/tsconfig.json) from leaking into the spawned CLI
                // process, which must compile against the project's real
                // root tsconfig.json.
                TS_NODE_PROJECT: undefined,
                // Skip type-checking in every spawned CLI process (ts-node 10
                // has no compile cache). Type errors are caught by `npm run build`.
                TS_NODE_TRANSPILE_ONLY: "true",
                SHOW_ERRORS: "false",
                ...env
            }
        })

        client.on("close", code => {
            resolve({
                config: fullOptions as types.NormalizedOptions,
                log: readFileSync(logFile, "utf8"),
                exitCode: code
            })
        });
    })
}
