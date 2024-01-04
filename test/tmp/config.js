module.exports = {
    "fhirUrl": "http://localhost:50458",
    "tokenUrl": "none",
    "privateKey": {},
    "clientId": "",
    "scope": "system/*.read",
    "accessTokenLifetime": 300,
    "reporter": "text",
    "_outputFormat": "",
    "_since": "",
    "_type": "",
    "_elements": "",
    "patient": "",
    "includeAssociatedData": "",
    "_typeFilter": "",
    "global": false,
    "group": "",
    "lenient": true,
    "requests": {
        "https": {
            "rejectUnauthorized": true
        },
        "headers": {}
    },
    "parallelDownloads": 5,
    "saveManifest": false,
    "ndjsonMaxLineLength": 10000000,
    "ndjsonValidateFHIRResourceType": true,
    "ndjsonValidateFHIRResourceCount": true,
    "addDestinationToManifest": false,
    "forceStandardFileNames": true,
    "downloadAttachments": true,
    "inlineDocRefAttachmentsSmallerThan": 0,
    "inlineDocRefAttachmentTypes": [
        "text/plain",
        "application/pdf"
    ],
    "pdfToText": false,
    "destination": "/Users/dylanphelan/Dev/bulk-data-client/test/tmp/downloads",
    "awsRegion": "",
    "awsAccessKeyId": "",
    "awsSecretAccessKey": "",
    "log": {
        "enabled": true,
        "metadata": {},
        "file": "/Users/dylanphelan/Dev/bulk-data-client/test/tmp/log.ndjson"
    },
    "retryAfterMSec": 200,
    "logResponseHeaders": [],
    "fileDownloadRetry": {
        "limit": 5
    }
}