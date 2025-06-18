"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLogger = void 0;
const winston_1 = require("winston");
const path_1 = require("path");
const crypto_1 = __importDefault(require("crypto"));
const utils_1 = require("../lib/utils");
const { combine, timestamp, uncolorize, printf } = winston_1.format;
function createLogger(destination, options = {}) {
    const exportId = crypto_1.default.randomBytes(10).toString("hex");
    // Determine log file location
    let log_path = options.file;
    // Fall back to destination if the log file isn't explicitly set
    if (!log_path) {
        const normalDest = (0, utils_1.normalizeDestination)(destination);
        if (normalDest && normalDest.startsWith(path_1.sep)) {
            // Destination is a local folder, we can just drop the log there
            log_path = (0, path_1.resolve)(normalDest, "log.ndjson");
        }
        else {
            // Destination is empty or a URL. Fall back to hardcoded path
            log_path = (0, path_1.resolve)(__dirname, "../../downloads/log.ndjson");
            console.log("Writing log to", log_path); // tell user where we put it
        }
    }
    return (0, winston_1.createLogger)({
        silent: options.enabled === false,
        transports: [
            new winston_1.transports.File({
                filename: log_path,
                maxFiles: 5,
                maxsize: 1024 * 1024 * 50,
                tailable: true,
                level: "silly",
                eol: "\n"
            })
        ],
        format: combine(timestamp({ format: "isoDateTime" }), uncolorize(), printf(info => JSON.stringify({
            ...options.metadata,
            exportId,
            timestamp: info.timestamp,
            eventId: info.eventId,
            eventDetail: info.eventDetail
        })))
    });
}
exports.createLogger = createLogger;
