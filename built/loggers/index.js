"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLogger = void 0;
const winston_1 = require("winston");
const path_1 = require("path");
const crypto_1 = __importDefault(require("crypto"));
const { combine, timestamp, uncolorize, printf } = winston_1.format;
function createLogger(options = {}) {
    const exportId = crypto_1.default.randomBytes(10).toString("hex");
    return (0, winston_1.createLogger)({
        silent: options.enabled === false,
        transports: [
            new winston_1.transports.File({
                filename: options.file || (0, path_1.resolve)(__dirname, "../../downloads/log.ndjson"),
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
