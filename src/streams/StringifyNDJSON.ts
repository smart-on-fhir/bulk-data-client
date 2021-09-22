import { Transform } from "stream"


/**
 * This is a transform stream that will consume JSON objects and output NDJSON
 * string.
 */
export default class StringifyNDJSON extends Transform
{
    private _lineNumber = 1;

    constructor()
    {
        super({
            readableObjectMode: false,
            writableObjectMode: true
        });
    }

    override _transform(obj: any, encoding: any, next: (err?: Error) => any)
    {
        try {
            var str = JSON.stringify(obj)
        } catch (err) {
            return next(err as Error)
        }

        this.push((this._lineNumber > 1 ? "\n" : "") + str);
        this._lineNumber++;
        next();
    }
}

