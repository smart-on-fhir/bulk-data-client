"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = require("path");
const stream_1 = require("stream");
const PDF_1 = __importDefault(require("../lib/PDF"));
const url_1 = require("url");
const node_jose_1 = __importDefault(require("node-jose"));
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
    async downloadAttachment(url) {
        if (url.search(/^https?:\/\/.+/) === 0) {
            return this.downloadAttachmentFromAbsoluteUrl(url);
        }
        return this.downloadAttachmentFromRelativeUrl(url);
    }
    async downloadAttachmentFromAbsoluteUrl(url) {
        // console.log(`Downloading attachment from ${url}`)
        return await this.options.request({
            url,
            responseType: "buffer"
        });
    }
    async downloadAttachmentFromRelativeUrl(uri) {
        const url = new url_1.URL(uri, this.options.baseUrl);
        // console.log(`Downloading attachment from ${url}`)
        return await this.options.request({
            url,
            responseType: "buffer",
        });
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
            const response = await this.downloadAttachment(attachment.url);
            const type = attachment.contentType || response.headers["content-type"] || "";
            const isInlineable = (response.body.byteLength < this.options.inlineAttachments &&
                this.options.inlineAttachmentTypes.find(m => type.startsWith(m)));
            if (isInlineable) {
                await this.inlineAttachmentData(attachment, response.body);
            }
            else {
                const fileName = Date.now() + "-" + node_jose_1.default.util.randomBytes(6).toString("hex") + (0, path_1.extname)(attachment.url);
                await this.options.save(fileName, stream_1.Readable.from(response.body), "attachments");
                attachment.url = `./attachments/${fileName}`;
            }
            this.emit("attachment");
        }
        return resource;
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
