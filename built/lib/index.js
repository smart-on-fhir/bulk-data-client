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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Utils = exports.request = exports.PDF = exports.StringifyNDJSON = exports.ParseNDJSON = exports.FileDownload = exports.DocumentReferenceHandler = exports.BulkDataClient = void 0;
var BulkDataClient_1 = require("./BulkDataClient");
Object.defineProperty(exports, "BulkDataClient", { enumerable: true, get: function () { return __importDefault(BulkDataClient_1).default; } });
var DocumentReferenceHandler_1 = require("./DocumentReferenceHandler");
Object.defineProperty(exports, "DocumentReferenceHandler", { enumerable: true, get: function () { return __importDefault(DocumentReferenceHandler_1).default; } });
var FileDownload_1 = require("./FileDownload");
Object.defineProperty(exports, "FileDownload", { enumerable: true, get: function () { return __importDefault(FileDownload_1).default; } });
var ParseNDJSON_1 = require("./ParseNDJSON");
Object.defineProperty(exports, "ParseNDJSON", { enumerable: true, get: function () { return __importDefault(ParseNDJSON_1).default; } });
var StringifyNDJSON_1 = require("./StringifyNDJSON");
Object.defineProperty(exports, "StringifyNDJSON", { enumerable: true, get: function () { return __importDefault(StringifyNDJSON_1).default; } });
var PDF_1 = require("./PDF");
Object.defineProperty(exports, "PDF", { enumerable: true, get: function () { return __importDefault(PDF_1).default; } });
var request_1 = require("./request");
Object.defineProperty(exports, "request", { enumerable: true, get: function () { return __importDefault(request_1).default; } });
exports.Utils = __importStar(require("./utils"));
