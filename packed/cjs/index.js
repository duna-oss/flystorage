const {FileStorage} = require('@flystorage/file-storage');
const {LocalFileStorage} = require('@flystorage/local-fs');
const {resolve} = require("path");

const storage = new FileStorage(
    new LocalFileStorage(
        resolve(__dirname, 'files'),
    )
);

(async () => {
    await storage.write('path.txt', 'contents');
})();