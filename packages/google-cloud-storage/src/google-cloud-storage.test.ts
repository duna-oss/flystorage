import { Storage } from '@google-cloud/storage';
import {GoogleCloudStorageFileStorage} from './google-cloud-storage.js';
import { FileStorage } from '@flystorage/file-storage';
import {randomBytes} from 'crypto';
import {resolve} from 'node:path';

const testSegment = randomBytes(10).toString('hex');
let adapter: GoogleCloudStorageFileStorage;
let storage: FileStorage;

describe('GoogleCloudStorageFileStorage', () => {
    const googleStorage = new Storage({keyFilename: resolve(process.cwd(), 'google-cloud-service-account.json')});
    const bucket = googleStorage.bucket('no-acl-bucket-for-ci', {
        userProject: 'flysystem-testing',
    });

    afterAll(async () => {
        adapter = new GoogleCloudStorageFileStorage(bucket, {
            prefix: `flystorage`,
        });
        storage = new FileStorage(adapter);
        await storage.deleteDirectory(testSegment);
    })

    beforeEach(() => {
        const secondSegment = randomBytes(10).toString('hex');

        adapter = new GoogleCloudStorageFileStorage(bucket, {
            prefix: `flystorage/${testSegment}/${secondSegment}`,
        });
        storage = new FileStorage(adapter);
    });

    test('reading a file that was written', async () => {
        await storage.write('path.txt', 'content in azure');
        const content = await storage.readToString('path.txt');

        expect(content).toEqual('content in azure');
        expect(await storage.fileExists('path.txt')).toEqual(true);
    });

    test('deleting a directory', async () => {
        await storage.createDirectory('directory/a');
        await storage.write('directory/b.txt', 'contents');

        await storage.deleteDirectory('directory');

        expect(await storage.fileExists('directory/b.txt')).toEqual(false);
    });
});