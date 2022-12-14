"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const stream_1 = require("stream");
/**
 * This is a transform stream that will consume JSON objects and output NDJSON
 * string.
 */
class StringifyNDJSON extends stream_1.Transform {
    constructor() {
        super({
            readableObjectMode: false,
            writableObjectMode: true
        });
        this._lineNumber = 1;
    }
    _transform(obj, encoding, next) {
        try {
            var str = JSON.stringify(obj);
        }
        catch (err) {
            return next(err);
        }
        this.push((this._lineNumber > 1 ? "\n" : "") + str);
        this._lineNumber++;
        next();
    }
}
exports.default = StringifyNDJSON;
