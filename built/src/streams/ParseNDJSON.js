"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const stream_1 = require("stream");
/**
 * This is a transform stream that takes parts of NDJSON file as Buffer chunks
 * and emits one JSON object for each non-empty line
 */
class ParseNDJSON extends stream_1.Transform {
    constructor(options) {
        super({
            writableObjectMode: true,
            readableObjectMode: true
        });
        /**
         * Cache the string contents that we have read so far until we reach a
         * new line
         */
        this._stringBuffer = "";
        /**
         * The buffer size as number of utf8 characters
         */
        this.bufferSize = 0;
        /**
         * Line counter
         */
        this._line = 0;
        /**
         * Object (resource) counter
         */
        this._count = 0;
        this.options = {
            maxLineLength: 1000000,
            expectedResourceType: "",
            expectedCount: -1
        };
        Object.assign(this.options, options || {});
    }
    get count() {
        return this._line;
    }
    _transform(chunk, encoding, next) {
        // Convert the chunk buffer to string
        const stringChunk = chunk.toString("utf8");
        // Get the char length of the chunk
        const chunkLength = stringChunk.length;
        // Check if concatenating this chunk to the buffer will result in buffer
        // overflow. Protect against very long lines (possibly bad files without
        // EOLs).
        if (this.bufferSize + chunkLength > this.options.maxLineLength) {
            this._stringBuffer = "";
            this.bufferSize = 0;
            return next(new Error(`Buffer overflow. No EOL found in ${this.options.maxLineLength} subsequent characters.`));
        }
        // Append to buffer
        this._stringBuffer += stringChunk;
        this.bufferSize = this._stringBuffer.length;
        // Find the position of the first EOL
        let eolPos = this._stringBuffer.search(/\n/);
        // The chunk might span over multiple lines
        while (eolPos > -1) {
            const jsonString = this._stringBuffer.substring(0, eolPos);
            this._stringBuffer = this._stringBuffer.substring(eolPos + 1);
            this.bufferSize = this._stringBuffer.length;
            this._line += 1;
            // If this is not an empty line!
            if (jsonString.trim().length) {
                try {
                    const json = JSON.parse(jsonString);
                    if (this.options.expectedResourceType &&
                        json.resourceType !== this.options.expectedResourceType) {
                        throw new Error(`Expected each resource to have a "${this.options.expectedResourceType}" resourceType but found "${json.resourceType}"`);
                    }
                    this.push(json);
                    this._count += 1;
                }
                catch (error) {
                    // this.push(jsonString);
                    this._stringBuffer = "";
                    this.bufferSize = 0;
                    return next(new SyntaxError(`Error parsing NDJSON on line ${this._line} ('${eolPos}'): ${error}`));
                }
            }
            eolPos = this._stringBuffer.search(/\n/);
        }
        next();
    }
    /**
     * After we have consumed and transformed the entire input, the buffer may
     * still contain the last line so make sure we handle that as well
     * @param {function} next
     */
    _final(next) {
        try {
            if (this._stringBuffer) {
                const json = JSON.parse(this._stringBuffer);
                this._stringBuffer = "";
                this.push(json);
                this._count += 1;
            }
        }
        catch (error) {
            return next(new SyntaxError(`Error parsing NDJSON on line ${this._line + 1}: ${error}`));
        }
        if (this.options.expectedCount > -1 && this._count !== this.options.expectedCount) {
            return next(new Error(`Expected ${this.options.expectedCount} resources but found ${this._count}`));
        }
        next();
    }
}
exports.default = ParseNDJSON;
