import { expect }     from "@hapi/code"
import BulkDataClient from "../src/lib/BulkDataClient"
import baseSettings   from "../config/defaults.js"
import { mockServer } from "./lib"


describe('download', () => {
    
    it("normal ndjson file", async () => {

        mockServer.mock("/download", {
            status: 200,
            body: '{"resourceType":"Patient"}\n' +
                '{"resourceType":"Patient"}',
            headers: {
                "content-type": "application/ndjson"
            }
        });

        // @ts-ignore
        const client = new BulkDataClient({ ...baseSettings, fhirUrl: mockServer.baseUrl })

        // @ts-ignore
        await client.downloadFile({
            file: {
                type: "Patient",
                url: mockServer.baseUrl + "/download",
                count: 2
            },
            fileName: "1.Patient.ndjson",
            onProgress: state => {}
        })
    })

    it("can skip attachments", async () => {

        mockServer.mock("/attachment", { body: "whatever" });

        mockServer.mock("/download", {
            body: JSON.stringify({
                resourceType: "DocumentReference",
                content:[{
                    attachment: {
                        contentType: "image/jpeg",
                        url: mockServer.baseUrl + "/attachment",
                        size: 190326
                    }
                }]
            }),
            headers: {
                "content-type": "application/ndjson"
            }
        });

        // @ts-ignore
        const client = new BulkDataClient({ ...baseSettings, fhirUrl: mockServer.baseUrl })

        // @ts-ignore
        await client.downloadFile({
            file: {
                type: "DocumentReference",
                url: mockServer.baseUrl + "/download",
                count: 1
            },
            fileName: "1.DocumentReference.ndjson",
            onProgress: state => { expect(state.attachments).to.equal(1) }
        })

        client.options.downloadAttachments = false

        // @ts-ignore
        await client.downloadFile({
            file: {
                type: "DocumentReference",
                url: mockServer.baseUrl + "/download",
                count: 1
            },
            fileName: "1.DocumentReference.ndjson",
            onProgress: state => { expect(state.attachments).to.equal(0) }
        })
    })

    it ("using http destination", async () => {

        mockServer.mock("/download", {
            status : 200,
            body   : '{"resourceType":"Patient"}\n{"resourceType":"Patient"}',
            headers: { "content-type": "application/ndjson" }
        });

        mockServer.mock({ method: "post", path: "/upload/1.Patient.ndjson" }, {
            handler(req, res) {
                req.on("data", chunk => {
                    expect(chunk.toString()).to.include('{"resourceType":"Patient"}')
                })
                req.on("end", () => res.end("done"))
            }
        })

        const options = {
            ...baseSettings,
            fhirUrl: mockServer.baseUrl,
            destination: mockServer.baseUrl + "/upload"
        }

        const client = new BulkDataClient(options as any)

        // @ts-ignore
        await client.downloadFile({
            file: {
                type: "Patient",
                url: mockServer.baseUrl + "/download",
                count: 2
            },
            fileName: "1.Patient.ndjson",
            onProgress: state => {}
        })
    })
})
