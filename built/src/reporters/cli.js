"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const utils_1 = require("../lib/utils");
require("colors");
function CLIReporter(client) {
    let downloadStart;
    function onKickOffStart() {
        console.log("Kick-off started");
    }
    function onKickOffEnd() {
        console.log("Kick-off completed");
    }
    function onAuthorize() {
        (0, utils_1.print)("Got new access token").commit();
    }
    function onExportStart(status) {
        console.log(status.message);
    }
    function onExportProgress(status) {
        (0, utils_1.print)(status.message);
    }
    function onExportComplete(manifest) {
        // console.log("Export manifest: ", manifest)
        // console.log("")
        utils_1.print.commit();
    }
    function onDownloadStart() {
        if (!downloadStart)
            downloadStart = Date.now();
    }
    function onDownloadProgress(downloads) {
        // let downloadedChunks  = 0
        let downloadedBytes = 0;
        let uncompressedBytes = 0;
        let downloadedFiles = 0;
        let resources = 0;
        let totalAttachments = 0;
        let totalFiles = downloads.length;
        downloads.forEach(d => {
            // summary.downloadedChunks  += d.downloadedChunks
            downloadedBytes += d.downloadedBytes;
            uncompressedBytes += d.uncompressedBytes;
            resources += d.resources;
            totalAttachments += d.attachments;
            if (d.completed) {
                downloadedFiles += 1;
            }
        });
        const lines = [
            "",
            "Downloading exported files".bold + `: ${(0, utils_1.generateProgress)(Math.round(downloadedFiles / totalFiles * 100), 30)}`,
            `          Downloaded Files: ${downloadedFiles} of ${totalFiles}`,
            `            FHIR Resources: ${resources.toLocaleString()}`,
            `               Attachments: ${totalAttachments.toLocaleString()}${client.options.downloadAttachments === false ? " (attachments skipped)" : ""}`,
            `           Downloaded Size: ${(0, utils_1.humanFileSize)(downloadedBytes)}`,
        ];
        if (uncompressedBytes != downloadedBytes) {
            lines.push(`         Uncompressed Size: ${(0, utils_1.humanFileSize)(uncompressedBytes)}`, `         Compression ratio: 1/${(uncompressedBytes && downloadedBytes ? Math.round(uncompressedBytes / downloadedBytes) : 1)}`);
        }
        lines.push("");
        (0, utils_1.print)(lines);
    }
    function onDownloadComplete() {
        console.log(`Download completed in ${(0, utils_1.formatDuration)(Date.now() - downloadStart)}`);
    }
    function onError(error) {
        console.error(error);
    }
    client.on("authorize", onAuthorize);
    client.on("kickOffStart", onKickOffStart);
    client.on("kickOffEnd", onKickOffEnd);
    client.on("exportStart", onExportStart);
    client.on("exportProgress", onExportProgress);
    client.on("exportComplete", onExportComplete);
    client.on("downloadStart", onDownloadStart);
    client.on("downloadProgress", onDownloadProgress);
    client.on("allDownloadsComplete", onDownloadComplete);
    client.on("error", onError);
    return {
        detach() {
            client.off("authorize", onAuthorize);
            client.off("kickOffStart", onKickOffStart);
            client.off("kickOffEnd", onKickOffEnd);
            client.off("exportStart", onExportStart);
            client.off("exportProgress", onExportProgress);
            client.off("exportComplete", onExportComplete);
            client.off("downloadStart", onDownloadStart);
            client.off("downloadProgress", onDownloadProgress);
            client.off("allDownloadsComplete", onDownloadComplete);
            client.off("error", onError);
        }
    };
}
exports.default = CLIReporter;
