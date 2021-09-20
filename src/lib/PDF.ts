import * as pdfJsLib from "pdfjs-dist/legacy/build/pdf.js"


export default class PDF {

    public static async getPageText(pdf: any, pageNo: number) {
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

        return tokenizedText.items.map((token: any) => token.str).join('\n');
    }
  
    public static async getPDFText(source: any): Promise<string> {
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