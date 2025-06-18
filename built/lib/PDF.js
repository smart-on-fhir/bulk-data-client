"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const pdfJsLib = __importStar(require("pdfjs-dist/legacy/build/pdf.js"));
class PDF {
    static async getPageText(pdf, pageNo) {
        const page = await pdf.getPage(pageNo);
        const tokenizedText = await page.getTextContent({
            /**
             * - Replaces all occurrences of
             * whitespace with standard spaces (0x20). The default value is `false`.
             */
            normalizeWhitespace: true,
            /**
             * - Do not attempt to combine
             * same line {@link TextItem }'s. The default value is `false`.
             */
            disableCombineTextItems: false,
            /**
             * - When true include marked
             * content items in the items array of TextContent. The default is `false`.
             */
            includeMarkedContent: false
        });
        return tokenizedText.items.map((token) => token.str).join('\n');
    }
    static async getPDFText(source) {
        const pdf = await pdfJsLib.getDocument(source).promise;
        const maxPages = pdf.numPages;
        const pageTextPromises = [];
        for (let pageNo = 1; pageNo <= maxPages; pageNo += 1) {
            pageTextPromises.push(PDF.getPageText(pdf, pageNo));
        }
        const pageTexts = await Promise.all(pageTextPromises);
        return pageTexts.join('\n');
    }
}
exports.default = PDF;
