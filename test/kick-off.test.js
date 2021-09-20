const nock           = require("nock")
const BulkDataClient = require("../built/lib/BulkDataClient").default


const baseSettings = require("../config/defaults.js");

const TEST_SERVER_BASE_URL = "http://testserver.dev"


afterEach(async () => {
    nock.cleanAll()
})

describe('kick-off', () => {


    it("makes a patient-level export by default", async () => {

        nock(TEST_SERVER_BASE_URL)
            .get("/Patient/$export")
            .reply(202, "", { "content-location": "x" });

        const client = new BulkDataClient({
            ...baseSettings,
            fhirUrl: TEST_SERVER_BASE_URL
        })

        await client.kickOff()
    })

    it("can make a system-level export", async () => {

        nock(TEST_SERVER_BASE_URL)
            .get("/$export")
            .reply(202, "", { "content-location": "x" });

        const client = new BulkDataClient({
            ...baseSettings,
            fhirUrl: TEST_SERVER_BASE_URL,
            global: true
        })

        await client.kickOff()
    })

    it("can make a group-level export", async () => {

        nock(TEST_SERVER_BASE_URL)
            .get("/Group/abc/$export")
            .reply(202, "", { "content-location": "x" });

        const client = new BulkDataClient({
            ...baseSettings,
            fhirUrl: TEST_SERVER_BASE_URL,
            group: "abc"
        })

        await client.kickOff()
    })
})

describe('status', () => {

    describe("complete", () => {
        
        it("returns the manifest", async() => {
            nock(TEST_SERVER_BASE_URL)
                .get("/status")
                .reply(200, {
                    output: [{}]
                });

            const client = new BulkDataClient({
                ...baseSettings,
                fhirUrl: TEST_SERVER_BASE_URL
            })

            await client.waitForExport(TEST_SERVER_BASE_URL + "/status")
        })
    })

    describe("error", () => {
        it("throws the error", async() => {
            nock(TEST_SERVER_BASE_URL)
                .get("/status")
                .reply(400);

            const client = new BulkDataClient({
                ...baseSettings,
                fhirUrl: TEST_SERVER_BASE_URL
            })

            await client.waitForExport(TEST_SERVER_BASE_URL + "/status")
        })
    })
})
