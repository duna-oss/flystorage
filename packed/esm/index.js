import {FileStorage} from '@flystorage/file-storage';
import {LocalStorageAdapter} from '@flystorage/local-fs';
import {join} from 'path';

const storage = new FileStorage(
    new LocalStorageAdapter(
        join(process.cwd(), 'files'),
    )
);

await storage.write('some/deep/file.txt', 'contents');
console.log(await storage.mimeType('path.svg'));
const mimetype = await storage.mimeType('screenshot.png');
console.log(mimetype);
console.log(await storage.list('', {deep: true}).toArray());