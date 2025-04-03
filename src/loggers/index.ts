import { transports, format, createLogger as _createLogger } from "winston"
import { resolve, sep }   from "path"
import Crypto             from "crypto"
import { BulkDataClient } from "../../index"
import {
    normalizeDestination,
} from "../lib/utils"



const { combine, timestamp, uncolorize, printf } = format;

export function createLogger(destination: string, options: BulkDataClient.LoggingOptions = {}) {
    const exportId = Crypto.randomBytes(10).toString("hex");

    // Determine log file location
    let log_path = options.file;
    // Fall back to destination if the log file isn't explicitly set
    if (!log_path) {
      const normalDest = normalizeDestination(destination);
      if (normalDest && normalDest.startsWith(sep)) {
        // Destination is a local folder, we can just drop the log there
        log_path = resolve(normalDest, "log.ndjson");
      } else {
        // Destination is empty or a URL. Fall back to hardcoded path
        log_path = resolve(__dirname, "../../downloads/log.ndjson");
        console.log("Writing log to", log_path); // tell user where we put it
      }
    }

    return _createLogger({
        silent: options.enabled === false,
        transports: [
            new transports.File({
                filename     : log_path,
                maxFiles     : 5,
                maxsize      : 1024 * 1024 * 50,
                tailable     : true,
                level        : "silly",
                eol          : "\n"
            })
        ],
        format: combine(
            timestamp({ format: "isoDateTime" }),
            uncolorize(),
            printf(info => JSON.stringify({
                ...options.metadata,
                exportId,
                timestamp  : info.timestamp,
                eventId    : info.eventId,
                eventDetail: info.eventDetail
            }))
        )
    })
}
