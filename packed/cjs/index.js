const {FileStorage} = require('@flystorage/file-storage');
const {LocalStorageAdapter} = require('@flystorage/local-fs');
const {resolve} = require("path");

const storage = new FileStorage(
    new LocalStorageAdapter(
        resolve(__dirname, 'files'),
    )
);

(async () => {
    await storage.write('some/deep/file.txt', 'contents');
    console.log(await storage.mimeType('path.svg'));
    const mimetype = await storage.mimeType('screenshot.png');
    console.log(mimetype);
    console.log(await storage.list('', {deep: true}).toArray());
})();