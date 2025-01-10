import BulkDataClient from "../src/lib/BulkDataClient"
import baseSettings   from "../config/defaults.js"
import { mockServer } from "./lib"


describe('kick-off', () => {
    it("makes a patient-level export by default", async () => {
        mockServer.mock("/metadata", { status: 200, body: {} });
        mockServer.mock("/Patient/\\$export", { status: 202, body: "", headers: { "content-location": "x" }});
        // @ts-ignore
        const client = new BulkDataClient({ ...baseSettings, fhirUrl: mockServer.baseUrl })
        await client.kickOff()
    })

    it("can make a system-level export", async () => {
        mockServer.mock("/metadata", { status: 200, body: {} });
        mockServer.mock("/\\$export", { status: 202, body: "", headers: { "content-location": "x" }});
        // @ts-ignore
        const client = new BulkDataClient({ ...baseSettings, fhirUrl: mockServer.baseUrl, global: true })
        await client.kickOff()
    })

    it("can make a group-level export", async () => {
        mockServer.mock("/metadata", { status: 200, body: {} });
        mockServer.mock("/Group/abc/\\$export", { status: 202, body: "", headers: { "content-location": "x" }});
        // @ts-ignore
        const client = new BulkDataClient({ ...baseSettings, fhirUrl: mockServer.baseUrl, group: "abc" })
        await client.kickOff()
    })
})

describe('status', () => {

    describe("complete", () => {
        
        it("returns the manifest", async() => {
            mockServer.mock("/status", { status: 200, body: { output: [{}] }});
            // @ts-ignore
            const client = new BulkDataClient({ ...baseSettings, fhirUrl: mockServer.baseUrl })
            await client.run(mockServer.baseUrl + "/status")
        })
    })

    describe("error", () => {
        it("throws the error", async () => {
            mockServer.mock("/status", { status: 400 });

            // @ts-ignore
            const client = new BulkDataClient({
                ...baseSettings,
                fhirUrl: mockServer.baseUrl,
                requests: {
                    ...baseSettings.requests,
                    context: {
                        ...baseSettings.requests?.context,
                        ignoreErrors: true
                    }
                }
            })

            await client.run(mockServer.baseUrl + "/status")
            .then(
                () => {
                    throw new Error("The test should have failed")
                },
                () => {
                    // Error was expected so we are good to go
                }
            )
        })
    })
})
