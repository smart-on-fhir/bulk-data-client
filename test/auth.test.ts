import express                from "express"
import jwt                    from "jsonwebtoken"
import jose                   from "node-jose"
import { expect }             from "@hapi/code"
import BulkDataClient         from "../src/lib/BulkDataClient"
import baseSettings           from "../config/defaults.js"
import { mockServer }         from "./lib"


const TOKEN_PATH = "/auth/token"

/**
 * Mocks the token endpoint and records every request made to it, so that
 * tests can assert how many times it was called and inspect the signed
 * client assertion that was sent.
 */
function mockTokenEndpoint(overrides: { expires_in?: number } = {})
{
    const requests: any[] = []

    mockServer.mock({ method: "post", path: TOKEN_PATH }, {
        bodyParser: express.urlencoded({ extended: true }),
        handler: (req, res) => {
            requests.push(req.body)
            res.json({
                access_token: "test-access-token-" + requests.length,
                expires_in  : overrides.expires_in ?? 300,
                token_type  : "bearer"
            })
        }
    })

    return requests
}

async function generateECKey(): Promise<jose.JWK.Key>
{
    const keystore  = jose.JWK.createKeyStore()
    const generated = await keystore.generate("EC", "P-384", { alg: "ES384", use: "sig" })
    return jose.JWK.asKey(generated.toJSON(true), "json")
}

async function createAuthorizedClient(privateKey: jose.JWK.Key, overrides: Record<string, any> = {})
{
    return new BulkDataClient({
        ...baseSettings,
        fhirUrl : mockServer.baseUrl,
        tokenUrl: mockServer.baseUrl + TOKEN_PATH,
        clientId: "test-client",
        privateKey,
        ...overrides
    } as any)
}

describe("Authorization", () => {

    describe("access token requests", () => {

        it("signs the client assertion with an EC (ES384) private key and sends it as a bearer token", async () => {

            const tokenRequests = mockTokenEndpoint()

            let authorizationHeader = ""

            mockServer.mock("/metadata", { status: 200, body: {} })
            mockServer.mock("/Patient/\\$export", {
                handler: (req, res) => {
                    authorizationHeader = req.headers.authorization as string
                    res.set("content-location", "x")
                    res.status(202).end()
                }
            })

            const privateKey = await generateECKey()
            const client = await createAuthorizedClient(privateKey)

            let emittedToken = ""
            client.on("authorize", token => emittedToken = token)

            await client.kickOff()

            expect(tokenRequests.length, "the token endpoint should be called exactly once").to.equal(1)
            expect(emittedToken, "an 'authorize' event should have been emitted").to.exist()
            expect(authorizationHeader).to.equal(`Bearer ${emittedToken}`)

            const clientAssertion = tokenRequests[0].client_assertion
            expect(clientAssertion, "a signed client_assertion should be sent").to.exist()

            const decoded = jwt.decode(clientAssertion, { complete: true }) as any
            expect(decoded.header.alg).to.equal("ES384")
            expect(decoded.payload.iss).to.equal("test-client")
            expect(decoded.payload.sub).to.equal("test-client")
            expect(decoded.payload.aud).to.equal(mockServer.baseUrl + TOKEN_PATH)
        })

        it("signs the client assertion with an RSA (RS384) private key and sends it as a bearer token", async () => {

            const tokenRequests = mockTokenEndpoint()

            let authorizationHeader = ""

            mockServer.mock("/metadata", { status: 200, body: {} })
            mockServer.mock("/Patient/\\$export", {
                handler: (req, res) => {
                    authorizationHeader = req.headers.authorization as string
                    res.set("content-location", "x")
                    res.status(202).end()
                }
            })

            const keystore  = jose.JWK.createKeyStore()
            const generated = await keystore.generate("RSA", 2048, { alg: "RS384", use: "sig" })
            const privateKey = await jose.JWK.asKey(generated.toJSON(true), "json")

            const client = await createAuthorizedClient(privateKey)

            let emittedToken = ""
            client.on("authorize", token => emittedToken = token)

            await client.kickOff()

            expect(tokenRequests.length, "the token endpoint should be called exactly once").to.equal(1)
            expect(authorizationHeader).to.equal(`Bearer ${emittedToken}`)

            const decoded = jwt.decode(tokenRequests[0].client_assertion, { complete: true }) as any
            expect(decoded.header.alg).to.equal("RS384")
        })
    })

    describe("access token caching", () => {

        it("reuses a cached access token instead of requesting a new one for every request", async () => {

            const tokenRequests = mockTokenEndpoint()

            mockServer.mock("/metadata", { status: 200, body: {} })
            mockServer.mock("/Patient/\\$export", {
                status : 202,
                body   : "",
                headers: { "content-location": mockServer.baseUrl + "/status" }
            })
            mockServer.mock("/status", { status: 200, body: { output: [] } })

            const privateKey = await generateECKey()
            const client = await createAuthorizedClient(privateKey)

            // kickOff() + the status check below both make authorized requests
            await client.run()

            expect(tokenRequests.length, "only one token request should have been made").to.equal(1)
        })

        it("requests a new access token once the previous one is close to expiring", async () => {

            // Requesting a token whose lifetime is smaller than the 10 second
            // renewal buffer used internally means it will already be considered
            // stale shortly after it was issued.
            const tokenRequests = mockTokenEndpoint({ expires_in: 11 })

            mockServer.mock("/metadata", { status: 200, body: {} })
            mockServer.mock("/Patient/\\$export", { status: 202, body: "", headers: { "content-location": "x" } })

            const privateKey = await generateECKey()
            const client = await createAuthorizedClient(privateKey)

            await client.kickOff()
            expect(tokenRequests.length).to.equal(1)

            // Still within the cached token's validity window
            await client.kickOff()
            expect(tokenRequests.length, "the cached token should still be used").to.equal(1)

            await new Promise(resolve => setTimeout(resolve, 1500))

            await client.kickOff()
            expect(tokenRequests.length, "a new token should have been requested").to.equal(2)
        }).timeout(10000)
    })
})
