"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileDownloadError = void 0;
class FileDownloadError extends Error {
    constructor({ body, code, fileUrl }) {
        super(`Downloading the file from ${fileUrl} returned HTTP status code ${code}.${body ? " Body: " + JSON.stringify(body) : ""}`);
        this.code = code;
        this.body = body;
        this.fileUrl = fileUrl;
        Error.captureStackTrace(this, this.constructor);
    }
}
exports.FileDownloadError = FileDownloadError;
