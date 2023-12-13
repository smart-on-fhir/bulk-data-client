import { expect }                 from "@hapi/code"
import { filterResponseHeaders }  from "../src/lib/utils"

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
      expect(filterResponseHeaders(headers, [] as string[])).to.equal({})
    })
    it ("returns an object containing the headers in selectedHeaders", () => { 
      const headers = {
        'header': 'value',
        'header2': 'value2',
      }
      expect(filterResponseHeaders(headers, ['header'])).to.equal({'header': 'value'})
      expect(filterResponseHeaders(headers, ['header2'])).to.equal({'header2': 'value2'})
      expect(filterResponseHeaders(headers, ['header', 'header2'])).to.equal(headers)
    })
    it ("returns an empty object if selectedHeaders's headers are not found", () => { 
      const headers = {
        'header': 'value',
        'header2': 'value2',
      }
      expect(filterResponseHeaders(headers, ['header3'])).to.equal({})
    })
  })
})