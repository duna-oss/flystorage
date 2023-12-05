import {FileStorage} from "@flystorage/file-storage";
import {LocalFileStorage} from "@flystorage/local-fs";
import {resolve} from "path";

const storage = new FileStorage(
    new LocalFileStorage(
        resolve(process.cwd(), 'files'),
    )
);

await storage.write('path.txt', 'contents');