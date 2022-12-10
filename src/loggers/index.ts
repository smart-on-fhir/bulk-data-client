import { transports, format, createLogger as _createLogger } from "winston"
import { resolve }        from "path"
import Crypto             from "crypto"
import { BulkDataClient } from "../../index"


const { combine, timestamp, uncolorize, printf } = format;

export function createLogger(options: BulkDataClient.LoggingOptions = {}) {
    const exportId = Crypto.randomBytes(10).toString("hex");
    
    return _createLogger({
        silent: options.enabled === false,
        transports: [
            new transports.File({
                filename     : resolve(__dirname, '../downloads/log.ndjson'),
                zippedArchive: true,
                maxFiles     : 5,
                maxsize      : 1024 * 1024,
                tailable     : true,
                silent       : process.env.NODE_ENV === "test",
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