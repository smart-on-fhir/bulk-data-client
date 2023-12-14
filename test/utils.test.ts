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

  })
})