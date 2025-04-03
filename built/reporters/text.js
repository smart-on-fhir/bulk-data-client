"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = TextReporter;
const utils_1 = require("../lib/utils");
function TextReporter(client) {
    let downloadedPct = 0;
    let downloadStart = 0;
    function onKickOffStart() {
        console.log("Kick-off started");
    }
    function onKickOffEnd() {
        console.log("Kick-off completed");
    }
    function onAuthorize() {
        console.log("Got new access token");
    }
    function onExportStart(status) {
        downloadedPct = 0;
        console.log(status.message);
        console.log(`Status endpoint: ${status.statusEndpoint}`);
    }
    function onExportProgress(status) {
        if (!downloadStart) {
            console.log(status.message);
        }
    }
    function onExportPage(page, url) {
        console.log(`Received manifest page from ${url}`);
    }
    // function onExportComplete(manifest: Types.ExportManifest) {
    //     console.log("Received all export manifest pages")
    // }
    function onDownloadStart() {
        if (!downloadStart) {
            console.log("Begin file downloads...");
            downloadStart = Date.now();
        }
    }
    function onDownloadProgress(downloads) {
        const done = downloads.filter(d => d.completed);
        const pct = Math.round(done.length / downloads.length * 100);
        if (downloadedPct != pct) {
            downloadedPct = pct;
            // Only show up to 20 progress messages
            if (pct % 5 === 0) {
                const size1 = done.reduce((prev, cur) => prev + cur.downloadedBytes, 0);
                const size2 = done.reduce((prev, cur) => prev + cur.uncompressedBytes, 0);
                let line = `${pct}%`.padStart(4) + " - " +
                    `${done.length}`.padStart(String(downloads.length).length) +
                    ` out of ${downloads.length} files downloaded - ` +
                    `${(0, utils_1.humanFileSize)(size1)} total`;
                if (size2 != size1) {
                    line += ` (${(0, utils_1.humanFileSize)(size2)} uncompressed)`;
                }
                console.log(line);
            }
        }
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
    client.on("exportPage", onExportPage);
    // client.on("exportComplete"      , onExportComplete  )
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
            client.off("exportPage", onExportPage);
            // client.off("exportComplete"      , onExportComplete  )
            client.off("downloadStart", onDownloadStart);
            client.off("downloadProgress", onDownloadProgress);
            client.off("allDownloadsComplete", onDownloadComplete);
            client.off("error", onError);
        }
    };
}
