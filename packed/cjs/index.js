const {FileStorage} = require('@flystorage/file-storage');
const {LocalStorageAdapter} = require('@flystorage/local-fs');
const {resolve} = require("path");

const storage = new FileStorage(
    new LocalStorageAdapter(
        resolve(__dirname, 'files'),
    )
);

(async () => {
    const mimetype = await storage.mimeType('screenshot.png');
    console.log(mimetype);
})();