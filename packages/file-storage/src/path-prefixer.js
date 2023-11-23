"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PathPrefixer = void 0;
var node_path_1 = require("node:path");
var PathPrefixer = /** @class */ (function () {
    function PathPrefixer(prefix) {
        if (prefix === void 0) { prefix = ''; }
        this.prefix = '';
        if (prefix.length > 0) {
            this.prefix = (0, node_path_1.join)(prefix, '/');
        }
    }
    PathPrefixer.prototype.prefixFilePath = function (path) {
        return this.prefix.length > 0 ? (0, node_path_1.join)(this.prefix, path) : path;
    };
    PathPrefixer.prototype.prefixDirectoryPath = function (path) {
        return this.prefix.length > 0 ? (0, node_path_1.join)(this.prefix, path, '/') : (0, node_path_1.join)(path, '/');
    };
    PathPrefixer.prototype.stripFilePath = function (path) {
        return path.substring(this.prefix.length);
    };
    PathPrefixer.prototype.stripDirectoryPath = function (path) {
        return this.stripFilePath(path).replace(/\/+$/g, '');
    };
    return PathPrefixer;
}());
exports.PathPrefixer = PathPrefixer;
