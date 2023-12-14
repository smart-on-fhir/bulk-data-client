"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileDownloadError = void 0;
class FileDownloadError extends Error {
    constructor({ body, code, responseHeaders, fileUrl }) {
        super(`Downloading the file from ${fileUrl} returned HTTP status code ${code}.${body ? " Body: " + JSON.stringify(body) : ""}`);
        this.body = body;
        this.responseHeaders = responseHeaders;
        this.code = code;
        this.fileUrl = fileUrl;
        Error.captureStackTrace(this, this.constructor);
    }
}
exports.FileDownloadError = FileDownloadError;
