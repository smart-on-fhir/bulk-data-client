"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = require("path");
const stream_1 = require("stream");
const url_1 = require("url");
const node_jose_1 = __importDefault(require("node-jose"));
const PDF_1 = __importDefault(require("../lib/PDF"));
const errors_1 = require("../lib/errors");
async function pdfToText(data) {
    const text = await PDF_1.default.getPDFText({ data });
    return Buffer.from(text);
}
/**
 * This is a transform stream that will do the following:
 * 1. Validate incoming object and verify that they have `resourceType` and `id`
 * 2. If resources are not "DocumentReference" pass them through
 * 3. If resources are "DocumentReference" having `content[0].attachment.url`:
 *    - Schedule another download for that url
 *    - Save the file under unique name to avoid duplicate conflicts
 *    - Modify content[0].attachment.url to use the downloaded file path
 */
class DocumentReferenceHandler extends stream_1.Transform {
    constructor(options) {
        super({
            readableObjectMode: true,
            writableObjectMode: true
        });
        this.options = options;
    }
    async downloadAttachment(attachment) {
        if (!attachment.url) {
            throw new Error("DocumentReferenceHandler.downloadAttachment called on attachment that has no 'url'");
        }
        // If the url is relative then convert it to absolute on the same base
        const url = new url_1.URL(attachment.url, this.options.baseUrl);
        const res = await this.options.request({
            url,
            responseType: "buffer",
            throwHttpErrors: false,
            headers: {
                accept: attachment.contentType || "application/json+fhir"
            }
        });
        if (res.statusCode >= 400) {
            throw new errors_1.FileDownloadError({
                fileUrl: attachment.url,
                body: null,
                code: res.statusCode
            });
        }
        const contentType = res.headers["content-type"] || "";
        // We may have gotten back a Binary FHIR resource
        if (contentType.match(/\bapplication\/json(\+fhir)?\b/)) {
            const json = JSON.parse(res.body.toString("utf8"));
            const { resourceType, contentType, data } = json;
            if (resourceType === "Binary") {
                const buffer = Buffer.from(data, "base64");
                this.options.onDownloadComplete(attachment.url, buffer.byteLength);
                return { contentType, data: buffer };
            }
        }
        this.options.onDownloadComplete(attachment.url, res.body.byteLength);
        return {
            contentType: contentType || attachment.contentType || "",
            data: res.body
        };
    }
    async inlineAttachmentData(node, data) {
        if (node.contentType == "application/pdf" && this.options.pdfToText) {
            data = await pdfToText(data);
            node.contentType = "text/plain";
        }
        node.size = data.byteLength;
        node.data = data.toString("base64");
        delete node.url;
        return node;
    }
    async handleAttachmentReferences(resource) {
        for (const entry of resource.content || []) {
            const attachment = entry.attachment;
            if (!attachment.url) {
                continue;
            }
            const response = await this.downloadAttachment(attachment);
            if (this.canPutAttachmentInline(response.data, response.contentType)) {
                await this.inlineAttachmentData(attachment, response.data);
            }
            else {
                const fileName = Date.now() + "-" + node_jose_1.default.util.randomBytes(6).toString("hex") + (0, path_1.extname)(attachment.url);
                await this.options.save(fileName, stream_1.Readable.from(response.data), "attachments");
                attachment.url = `./attachments/${fileName}`;
            }
            this.emit("attachment");
        }
        return resource;
    }
    canPutAttachmentInline(data, contentType) {
        if (data.byteLength > this.options.inlineAttachments) {
            return false;
        }
        if (!contentType) {
            return false;
        }
        if (!this.options.inlineAttachmentTypes.find(m => contentType.startsWith(m))) {
            return false;
        }
        return true;
    }
    _transform(resource, encoding, callback) {
        if (resource.resourceType != "DocumentReference") {
            return callback(null, resource);
        }
        else {
            this.handleAttachmentReferences(resource).then(res => callback(null, res), err => callback(err));
        }
    }
}
exports.default = DocumentReferenceHandler;
