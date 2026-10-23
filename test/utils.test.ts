import { expect }                 from "@hapi/code"
import { filterResponseHeaders, detectTokenUrl, getCapabilityStatement, getWellKnownSmartConfig } from "../src/lib/utils"
import { mockServer }             from "./lib"

describe('Utils Library', function () { 
  describe('filterExportHeaders', () => { 
    it ("returns undefined if headers is undefined or null", () => { 
      // @ts-ignore
      expect(filterResponseHeaders(undefined)).to.equal(undefined)
      // @ts-ignore
      expect(filterResponseHeaders(null)).to.equal(undefined)
    })
    it ("returns an empty object if selectedHeaders is an empty array", () => { 
      const headers = {
        'header': 'value',
        'header2': 'value2',
      }
      expect(filterResponseHeaders(headers, [])).to.equal({})
    })
    it ("returns an empty object if selectedHeaders's headers are not found", () => { 
      const headers = {
        'header': 'value',
        'header2': 'value2',
      }
      expect(filterResponseHeaders(headers, ['header3'])).to.equal({})
    })
    it ("finds matching headers given strings in selectedHeaders", () => { 
      const headers = {
        'header': 'value',
        'header2': 'value2',
      }
      expect(filterResponseHeaders(headers, ['header'])).to.equal({'header': 'value'})
      expect(filterResponseHeaders(headers, ['header2'])).to.equal({'header2': 'value2'})
      // Handles multiple options well
      expect(filterResponseHeaders(headers, ['header', 'header2'])).to.equal(headers)
    })
    it ("finds matching headers given regexps in selectedHeaders", () => { 
      const headers = {
        'header': 'value',
        'header2': 'value2',
      }
      expect(filterResponseHeaders(headers, [new RegExp('header.*')])).to.equal(headers)
      // NOTE: Partial match is still a match against both keys
      expect(filterResponseHeaders(headers, [/header/])).to.equal(headers)
      expect(filterResponseHeaders(headers, [new RegExp('header')])).to.equal(headers)
      // Expecting an additional character, only matches our second header
      expect(filterResponseHeaders(headers, [new RegExp('header.+')])).to.equal({'header2': 'value2'})
      // Handles multiple regexp fine
      expect(filterResponseHeaders(headers, [new RegExp('header2'), new RegExp('header$')])).to.equal(headers)
      // Correctly handles cases of no matching
      expect(filterResponseHeaders(headers, [new RegExp('footer.+')])).to.equal({})
    })
    it ("finds matching headers if selectedHeaders contains a mix of strings and RegExp ", () => { 
      const headers = {
        'header': 'value',
        'header2': 'value2',
        'new': 'string',
        'footer': 'random',
      }
      expect(filterResponseHeaders(headers, ['new', new RegExp('header'), new RegExp('foot.*')])).to.equal(headers)
      expect(filterResponseHeaders(headers, ['newish', new RegExp('footer.+')])).to.equal({})
    })
    it ("uses case-insensitive checks for string matching", () => { 
      const headers = {
        'header': 'value',
        'header2': 'value2',
        'NEW': 'string',
        'footer': 'random',
      }
      // SelectedHeader is case-insensitive
      expect(filterResponseHeaders(headers, ['HEADER'])).to.equal({'header': 'value'})
      // source responseHeader is also case-insensitive in check; preserves case in result
      expect(filterResponseHeaders(headers, ['new'])).to.equal({'NEW': 'string'})
    })
  })

  // The mock server normally sends "cache-control: no-store". These responses
  // are cacheable instead, like many real servers' responses. Requests made with
  // got 11's `cache` option never settled for responses like these on Node 20+,
  // making the CLI exit silently with code 0 (#26)
  describe('cacheable metadata responses', () => {

    function mockCacheable(path: string, status: number, body: object) {
      mockServer.mock(path, {
        handler(req, res) {
          res.removeHeader("cache-control")
          res.removeHeader("pragma")
          res.removeHeader("expires")
          res.status(status).json(body)
        }
      })
    }

    it ("getCapabilityStatement settles", async () => {
      mockCacheable("/metadata", 200, { resourceType: "CapabilityStatement" })
      const { body } = await getCapabilityStatement(mockServer.baseUrl)
      expect(body.resourceType).to.equal("CapabilityStatement")
    }).timeout(5000)

    it ("getWellKnownSmartConfig rejects on 404", async () => {
      mockCacheable("/.well-known/smart-configuration", 404, {})
      await expect(getWellKnownSmartConfig(mockServer.baseUrl)).to.reject(/404/)
    }).timeout(5000)

    it ("detectTokenUrl settles", async () => {
      mockCacheable("/metadata", 200, { resourceType: "CapabilityStatement" })
      mockCacheable("/.well-known/smart-configuration", 404, {})
      expect(await detectTokenUrl(mockServer.baseUrl)).to.equal("")
    }).timeout(5000)
  })
})
