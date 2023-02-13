import { expect }     from "@hapi/code"
import BulkDataClient from "../src/lib/BulkDataClient"
import baseSettings   from "../config/defaults.js"
import { emptyFolder, invoke, isFile, mockServer } from "./lib"
import { existsSync, readFileSync, rmSync } from "fs"
import { join } from "path"


describe('download', function() {
    this.timeout(60000)

    after(async () => {
        emptyFolder(__dirname + "/tmp/downloads/attachments")
        emptyFolder(__dirname + "/tmp/downloads/error")
        emptyFolder(__dirname + "/tmp/downloads/deleted")
        emptyFolder(__dirname + "/tmp/downloads")
    });
    
    afterEach(async () => {
        if (existsSync(__dirname + "/tmp/log.ndjson")) {
            rmSync(__dirname + "/tmp/log.ndjson")
        }
        if (existsSync(__dirname + "/tmp/config.js")) {
            rmSync(__dirname + "/tmp/config.js")
        }
    })
    
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

    it ("can download attachments from static URL", async () => {

        // Mock the kick-off response
        mockServer.mock("/Patient/\\$export", {
            status: 202,
            headers: {
                "Content-Location": mockServer.baseUrl + "/status"
            }
        });

        // Mock the status response
        mockServer.mock("/status", {
            status: 200,
            body: {
                transactionTime: new Date().toISOString(),
                request : mockServer.baseUrl + "/Patient/$export",
                requiresAccessToken: true,
                output: [{
                    type: "DocumentReference",
                    url : mockServer.baseUrl + "/output/file_1.ndjson"
                }],
                deleted: [],
                error: []
            }
        });
        
        // Mock the download response
        mockServer.mock("/output/file_1.ndjson", {
            status : 200,
            headers: { "content-type": "application/ndjson" },
            body   : [
                
                // This one points to static text file on the same server
                {
                    resourceType: "DocumentReference",
                    content:[
                        {
                            attachment:{
                                contentType: "text/plain",
                                url: "/attachments/note1.txt"
                            }
                        }
                    ]
                }
            ].map(x => JSON.stringify(x)).join("\n")
        });

        // Mock the attachments response
        mockServer.mock("/attachments/note1.txt", {
            handler(req, res) {
                expect(req.headers.accept).to.equal("text/plain")
                res.type("text/plain")
                res.status(200)
                res.write("test data")
                res.end()
            }
        })

        const result = await invoke({
            options: {
                fhirUrl: mockServer.baseUrl
            }
        })

        // verify that 1.DocumentReference.ndjson is downloaded
        const documentReferencePath = join(result.config.destination, "1.DocumentReference.ndjson")
        expect(isFile(documentReferencePath)).to.equal(true)
        
        // parse 1.DocumentReference.ndjson and get its url property
        const json = JSON.parse(readFileSync(documentReferencePath, "utf8"));
        expect(json.content[0].attachment.contentType).to.equal("text/plain");

        // verify that this url points to existing text file
        const { url } = json.content[0].attachment
        const attachmentPath = join(result.config.destination, url)
        expect(isFile(attachmentPath)).to.equal(true)

        // verify that the attachment file contains what we expect
        expect(readFileSync(attachmentPath, "utf8")).to.equal("test data")
    })

    it ("can download attachments from Binary URL", async () => {

        // Mock the kick-off response
        mockServer.mock("/Patient/\\$export", {
            status: 202,
            headers: {
                "Content-Location": mockServer.baseUrl + "/status"
            }
        });

        // Mock the status response
        mockServer.mock("/status", {
            status: 200,
            body: {
                transactionTime: new Date().toISOString(),
                request : mockServer.baseUrl + "/Patient/$export",
                requiresAccessToken: true,
                output: [{
                    type: "DocumentReference",
                    url : mockServer.baseUrl + "/output/file_1.ndjson"
                }],
                deleted: [],
                error: []
            }
        });
        
        // Mock the download response
        mockServer.mock("/output/file_1.ndjson", {
            status : 200,
            headers: { "content-type": "application/ndjson" },
            body   : [
                
                // This one points to static text file on the same server
                {
                    resourceType: "DocumentReference",
                    content:[
                        {
                            attachment:{
                                contentType: "text/plain",
                                url: "/Binary/1"
                            }
                        }
                    ]
                }
            ].map(x => JSON.stringify(x)).join("\n")
        });

        // Mock the attachments response
        mockServer.mock("/Binary/1", {
            body: {
                resourceType: "Binary",
                id: "1",
                contentType: "text/plain",
                data: "dGVzdCBkYXRh"
            },
            headers: {
                "content-type": "application/json"
            }
        })

        const result = await invoke({
            options: {
                fhirUrl: mockServer.baseUrl
            },
            // stdio: "inherit"
        })

        // verify that 1.DocumentReference.ndjson is downloaded
        const documentReferencePath = join(result.config.destination, "1.DocumentReference.ndjson")
        expect(isFile(documentReferencePath)).to.equal(true)
        
        // parse 1.DocumentReference.ndjson and get its url property
        const json = JSON.parse(readFileSync(documentReferencePath, "utf8"));

        // verify that this url points to existing text file
        const { url } = json.content[0].attachment
        const attachmentPath = join(result.config.destination, url)
        expect(isFile(attachmentPath)).to.equal(true)

        // verify that the attachment file contains what we expect
        expect(readFileSync(attachmentPath, "utf8")).to.equal("test data")
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
            destination: mockServer.baseUrl + "/upload/"
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
