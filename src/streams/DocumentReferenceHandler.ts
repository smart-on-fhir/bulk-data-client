import { OptionsOfUnknownResponseBody, Response } from "got/dist/source";
import { extname } from "path";
import { Readable, Transform }  from "stream"
import PDF from "../lib/PDF"
import { URL } from "url"
import jose from "node-jose"


export interface DocumentReferenceHandlerOptions {
    inlineAttachments: number
    inlineAttachmentTypes: string[]
    pdfToText: boolean
    baseUrl: string
    request: <T=unknown>(options: OptionsOfUnknownResponseBody) => Promise<Response<T>>
    save: (fileName: string, stream: Readable, subFolder: string) => Promise<any>
}

async function pdfToText(data: Buffer) {
    const text = await PDF.getPDFText({ data });
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
export default class DocumentReferenceHandler extends Transform
{
    private options: DocumentReferenceHandlerOptions;

    constructor(options: DocumentReferenceHandlerOptions)
    {
        super({
            readableObjectMode: true,
            writableObjectMode: true
        });

        this.options = options;
    }

    private async downloadAttachment(url: string): Promise<Response<Buffer>> {
        if (url.search(/^https?:\/\/.+/) === 0) {
            url = new URL(url, this.options.baseUrl).href
        }

        const res = await this.options.request<Buffer>({
            url,
            responseType: "buffer"
        });
    }

    private async downloadAttachmentFromRelativeUrl(uri: string): Promise<Response<Buffer>> {
        const url = new URL(uri, this.options.baseUrl)
        // console.log(`Downloading attachment from ${url}`)
        return await this.options.request({
            url,
            responseType: "buffer",
        });
    }

        return res
    }

    private async inlineAttachmentData(node: fhir4.Attachment, data: Buffer) {
        if (node.contentType == "application/pdf" && this.options.pdfToText) {
            data = await pdfToText(data);
            node.contentType = "text/plain"
        }
        node.size = data.byteLength
        node.data = data.toString("base64")
        delete node.url
        return node
    }

    private async handleAttachmentReferences(resource: fhir4.DocumentReference): Promise<fhir4.DocumentReference>
    {
        for (const entry of resource.content || []) {
            const attachment = entry.attachment;

            if (!attachment.url) {
                continue;
            }

            const response = await this.downloadAttachment(attachment.url);
            
            if (this.canPutAttachmentInline(response, attachment.contentType)) {
                await this.inlineAttachmentData(attachment, response.body);
            }
            
            else {
                const fileName = Date.now() + "-" + jose.util.randomBytes(6).toString("hex") + extname(attachment.url);
                await this.options.save(
                    fileName,
                    Readable.from(response.body),
                    "attachments"
                )
                attachment.url = `./attachments/${fileName}`
            }
            this.emit("attachment")
        }

        return resource;
    }

    canPutAttachmentInline(response: Response<Buffer>, contentType?: string): boolean
    {
        if (response.body.byteLength > this.options.inlineAttachments) {
            return false
        }

        const type = contentType || response.headers["content-type"] || ""

        if (!type) {
            return false
        }

        if (!this.options.inlineAttachmentTypes.find(m => type.startsWith(m))) {
            return false
        }

        return true
    }

    override _transform(
        resource: fhir4.DocumentReference,
        encoding: any,
        callback: (err: Error | null, chunk?: fhir4.Resource) => any
    )
    {
        if (resource.resourceType != "DocumentReference") {
            return callback(null, resource)
        }
        else {
            this.handleAttachmentReferences(resource).then(
                res => callback(null, res),
                err => callback(err)
            )
        }
    }
}
