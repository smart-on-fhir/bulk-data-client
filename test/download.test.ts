import nock           from "nock"
import { expect }     from "@hapi/code"
import BulkDataClient from "../src/lib/BulkDataClient"
// @ts-ignore
import baseSettings from "../config/defaults.js"

const TEST_SERVER_BASE_URL = "http://testserver.dev"


afterEach(async () => {
    nock.cleanAll()
})

describe('download', () => {


    it("normal ndjson file", async () => {

        nock(TEST_SERVER_BASE_URL)
            .get("/download")
            .reply(
                200,
                '{"resourceType":"Patient"}\n' +
                '{"resourceType":"Patient"}',
                 {
                     "content-type": "application/ndjson"
                 }
            );

        const client = new BulkDataClient({
            ...baseSettings,
            fhirUrl: TEST_SERVER_BASE_URL
        })

        // @ts-ignore
        await client.downloadFile(
            {
                type: "Patient",
                url: TEST_SERVER_BASE_URL + "/download",
                count: 2
            },
            "1.Patient.ndjson",
            state => {},
            () => {}
        )
    })

    it("can skip attachments", async () => {

        nock(TEST_SERVER_BASE_URL).get("/attachment").reply(200, "whatever");

        nock(TEST_SERVER_BASE_URL).get("/download").reply(
            200,
            JSON.stringify({
                resourceType: "DocumentReference",
                content:[{
                    attachment: {
                        contentType: "image/jpeg",
                        url: TEST_SERVER_BASE_URL + "/attachment",
                        size: 190326
                    }
                }]
            }),
            {
                "content-type": "application/ndjson"
            }
        ).persist(true);

        const client = new BulkDataClient({
            ...baseSettings,
            fhirUrl: TEST_SERVER_BASE_URL,
            downloadAttachments: true
        })

        // @ts-ignore
        await client.downloadFile(
            {
                type: "DocumentReference",
                url: TEST_SERVER_BASE_URL + "/download",
                count: 1
            },
            "1.DocumentReference.ndjson",
            state => { expect(state.attachments).to.equal(1) },
            () => {}
        )

        client.options.downloadAttachments = false

        // @ts-ignore
        await client.downloadFile(
            {
                type: "DocumentReference",
                url: TEST_SERVER_BASE_URL + "/download",
                count: 1
            },
            "1.DocumentReference.ndjson",
            state => { expect(state.attachments).to.equal(0) },
            () => {}
        )
    })

    // it("can make a system-level export", async () => {

    //     nock(TEST_SERVER_BASE_URL)
    //         .get("/$export")
    //         .reply(202, "", { "content-location": "x" });

    //     const client = new BulkDataClient({
    //         ...baseSettings,
    //         fhirUrl: TEST_SERVER_BASE_URL,
    //         global: true
    //     })

    //     await client.kickOff()
    // })

    // it("can make a group-level export", async () => {

    //     nock(TEST_SERVER_BASE_URL)
    //         .get("/Group/abc/$export")
    //         .reply(202, "", { "content-location": "x" });

    //     const client = new BulkDataClient({
    //         ...baseSettings,
    //         fhirUrl: TEST_SERVER_BASE_URL,
    //         group: "abc"
    //     })

    //     await client.kickOff()
    // })
})
