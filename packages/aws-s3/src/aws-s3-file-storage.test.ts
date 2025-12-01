import {S3Client} from '@aws-sdk/client-s3';
import {
    FileStorage,
    FileWasNotFound,
    readableToString,
    Visibility,
    closeReadable,
    UploadRequestHeaders,
    UnableToWriteFile,
    UnableToReadFile,
} from '@flystorage/file-storage';
import {BinaryToTextEncoding, createHash, randomBytes} from 'crypto';
import * as https from 'https';
import {AwsS3StorageAdapter} from './aws-s3-storage-adapter.js';
import {createReadStream} from 'node:fs';
import * as path from 'node:path';
import 'dotenv/config';
import {PassThrough} from 'node:stream';

let client: S3Client;
let storage: FileStorage;
let bucket = 'flysystem-check';
const testSegment = randomBytes(10).toString('hex');

describe('aws-s3 file storage', () => {
    beforeAll(() => {
        const [major] = process.versions.node.split('.').map(Number);
        const versionToBucketMapping = [[20, 'a'], [21, 'b'], [22, 'c'], [23, 'd']] as [number, string][];
        const bucketSuffix = versionToBucketMapping.find(([version]) => version === major);

        if (bucketSuffix) {
            bucket = `flystorage-${bucketSuffix[1]}`;
        }

        client = new S3Client();
    });

    beforeEach(async () => {
        const secondSegment = randomBytes(10).toString('hex');
        storage = new FileStorage(new AwsS3StorageAdapter(client, {
            bucket: bucket,
            prefix: `storage/${testSegment}/${secondSegment}`,
        }));
    });

    afterAll(async () => {
        await new FileStorage(new AwsS3StorageAdapter(client, {
            bucket: bucket,
            prefix: 'storage',
        })).deleteDirectory(testSegment);
        client.destroy();
    });

    test('uploading using a prepared request', async () => {
        const request = await storage.prepareUpload('prepared/request-file.txt', {
            expiresAt: Date.now() + 60 * 1000,
            headers: {
                'Content-Type': 'text/plain',
            }
        });

        await naivelyMakeRequestFile(
            request.url,
            request.headers,
            request.method,
            'this is the contents',
        );

        const contents = await storage.readToString('prepared/request-file.txt');

        expect(contents).toEqual('this is the contents');
    });

    test('writing and reading a file', async () => {
        await storage.write('path+name.txt', 'this is the contents');

        expect(await storage.readToString('path+name.txt')).toEqual('this is the contents');
    });

    test('non deep and deep listing should have consistent and similar results', async () => {
        await storage.write('file_1.txt', 'contents');
        await storage.write('file_2.txt', 'contents');
        await storage.createDirectory('directory_1');
        await storage.createDirectory('directory_2');

        const non_deep_listing = await storage.list('/', {deep: false}).toArray();
        const deep_listing = await storage.list('/', {deep: true}).toArray();

        expect(non_deep_listing).toHaveLength(4);
        expect(deep_listing).toHaveLength(4);
        expect(non_deep_listing).toEqual(deep_listing);
    });

    test('root listing should work without root-slash', async () => {
        const rootStorage = new FileStorage(new AwsS3StorageAdapter(client, {
            bucket: 'flystorage-root-check',
        }));

        await rootStorage.write('test-file.txt', 'contents');
        await rootStorage.createDirectory('test-directory');

        const non_deep_listing = await rootStorage.list('', {deep: false}).toArray();
        const deep_listing = await rootStorage.list('', {deep: true}).toArray();

        expect(non_deep_listing).toHaveLength(2);
        expect(deep_listing).toHaveLength(2);
        expect(non_deep_listing.map(item => item.path)).toEqual(deep_listing.map(item => item.path));
    });

    test('root listing should work with root-slash', async () => {
        const rootStorage = new FileStorage(new AwsS3StorageAdapter(client, {
            bucket: 'flystorage-root-check',
        }));

        await rootStorage.write('test-file.txt', 'contents');
        await rootStorage.createDirectory('test-directory');

        const non_deep_listing = await rootStorage.list('/', {deep: false}).toArray();
        const deep_listing = await rootStorage.list('/', {deep: true}).toArray();

        expect(non_deep_listing).toHaveLength(2);
        expect(deep_listing).toHaveLength(2);
        expect(non_deep_listing.map(item => item.path)).toEqual(deep_listing.map(item => item.path));
    });

    test('moving a file', async () => {
        await storage.write('from+here.txt', 'this');

        await storage.moveFile('from+here.txt', 'to+there.txt');

        expect(await storage.fileExists('from+here.txt')).toEqual(false);
        expect(await storage.readToString('to+there.txt')).toEqual('this');
    });

    test('copying a file', async () => {
        await storage.write('from+this.txt', 'this');

        await storage.copyFile('from+this.txt', 'to+that.txt');

        expect(await storage.fileExists('from+this.txt')).toEqual(true);
        expect(await storage.readToString('to+that.txt')).toEqual('this');
    });

    test('trying to copy a file that does not exist', async () => {
        await expect(storage.copyFile('404.txt', 'to.txt')).rejects.toThrow();
    });

    test('timing out when writing a file', async () => {
        const writeStream = new PassThrough();
        writeStream.write('something');

        setTimeout(() => {
            writeStream.end('this');
        }, 150);

        await expect(storage.write('somewhere.txt', writeStream, {
            timeout: 10,
        })).rejects.toThrow();

    })

    test('trying to read a file that does not exist', async () => {
        let was404 = false;

        try {
            await storage.read('404.txt');
        } catch (err) {
            if (err instanceof UnableToReadFile) {
                was404 = err.wasFileNotFound;
            }
        }

        expect(was404).toEqual(true);
    });

    test('trying to move a file that does not exist', async () => {
        await expect(storage.moveFile('404.txt', 'to.txt')).rejects.toThrow();
    });

    test('trying to download a file that does not exist', async () => {
        let was404 = false;

        try {
            await storage.temporaryUrl(`/${new Date().getTime()}`, {expiresAt: 10 * 1000});
        } catch (err) {
            if (err instanceof FileWasNotFound) {
                was404 = true;
            }
        }

        expect(was404).toEqual(true);
    });

    test('you can download public files using a public URL', async () => {
        await storage.write('public+file.txt', 'contents of the public file', {
            visibility: Visibility.PUBLIC,
        });

        const url = await storage.publicUrl('public+file.txt');
        const contents = await naivelyDownloadFile(url);

        expect(contents).toEqual('contents of the public file');
    });

    test('private files can only be downloaded using a temporary URL', async () => {
        await storage.write('private+file.txt', 'contents of the private file', {
            visibility: Visibility.PRIVATE,
        });

        await expect(naivelyDownloadFile(await storage.publicUrl('private+file.txt'))).rejects.toThrow();

        await expect(naivelyDownloadFile(
            await storage.temporaryUrl('private+file.txt', {expiresAt: Date.now() + 60 * 1000})
        )).resolves.toEqual('contents of the private file');
    });

    describe('response headers', () => {
        test('fetches file with Content-Disposition header when specified in the options', async () => {
            await storage.write('private+file.txt', 'contents of the private file', {
                visibility: Visibility.PRIVATE,
            });

            await expect(responseHeaderValue(
                await storage.temporaryUrl('private+file.txt', {expiresAt: Date.now() + 60 * 1000, responseHeaders: {'Content-Disposition': 'attachment; filename="private+file.txt"'} }),
                'Content-Disposition'
            )).resolves.toEqual('attachment; filename="private+file.txt"');
        });

        test('fetches file without Content-Disposition header when not specified in the options', async () => {
            await storage.write('private+file.txt', 'contents of the private file', {
                visibility: Visibility.PRIVATE,
            });

            await expect(responseHeaderValue(
                await storage.temporaryUrl('private+file.txt', {expiresAt: Date.now() + 60 * 1000}),
                'Content-Disposition'
            )).resolves.toBeUndefined();
        });

        test('fetches file with Cache-Control header when specified in the options', async () => {
            await storage.write('private+file.txt', 'contents of the private file', {
                visibility: Visibility.PRIVATE,
            });

            await expect(responseHeaderValue(
                await storage.temporaryUrl('private+file.txt', {expiresAt: Date.now() + 60 * 1000, responseHeaders: {'Cache-Control': 'none'} }),
                'Cache-Control'
            )).resolves.toEqual('none');
        });

        test('fetches file without Cache-Control header when not specified in the options', async () => {
            await storage.write('private+file.txt', 'contents of the private file', {
                visibility: Visibility.PRIVATE,
            });

            await expect(responseHeaderValue(
                await storage.temporaryUrl('private+file.txt', {expiresAt: Date.now() + 60 * 1000}),
                'Cache-Control'
            )).resolves.toBeUndefined();
        });

        test('fetches file with Content-Encoding header when specified in the options', async () => {
            await storage.write('private+file.txt', 'contents of the private file', {
                visibility: Visibility.PRIVATE,
            });

            await expect(responseHeaderValue(
                await storage.temporaryUrl('private+file.txt', {expiresAt: Date.now() + 60 * 1000, responseHeaders: {'Content-Encoding': 'br'} }),
                'Content-Encoding'
            )).resolves.toEqual('br');
        });

        test('fetches file without Content-Encoding header when not specified in the options', async () => {
            await storage.write('private+file.txt', 'contents of the private file', {
                visibility: Visibility.PRIVATE,
            });

            await expect(responseHeaderValue(
                await storage.temporaryUrl('private+file.txt', {expiresAt: Date.now() + 60 * 1000}),
                'Content-Encoding'
            )).resolves.toBeUndefined();
        });

        test('fetches file with Content-Language header when specified in the options', async () => {
            await storage.write('private+file.txt', 'contents of the private file', {
                visibility: Visibility.PRIVATE,
            });

            await expect(responseHeaderValue(
                await storage.temporaryUrl('private+file.txt', {expiresAt: Date.now() + 60 * 1000, responseHeaders: {'Content-Language': 'en-US'} }),
                'Content-Language'
            )).resolves.toEqual('en-US');
        });

        test('fetches file without Content-Language header when not specified in the options', async () => {
            await storage.write('private+file.txt', 'contents of the private file', {
                visibility: Visibility.PRIVATE,
            });

            await expect(responseHeaderValue(
                await storage.temporaryUrl('private+file.txt', {expiresAt: Date.now() + 60 * 1000}),
                'Content-Language'
            )).resolves.toBeUndefined();
        });

        test('fetches file with Content-Type header when specified in the options', async () => {
            await storage.write('private+file.txt', 'contents of the private file', {
                visibility: Visibility.PRIVATE,
            });

            await expect(responseHeaderValue(
                await storage.temporaryUrl('private+file.txt', {expiresAt: Date.now() + 60 * 1000, responseHeaders: {'Content-Type': 'image/jpeg+special'} }),
                'Content-Type'
            )).resolves.toEqual('image/jpeg+special');
        });

        test('fetches file with Expires header when specified in the options', async () => {
            await storage.write('private+file.txt', 'contents of the private file', {
                visibility: Visibility.PRIVATE,
            });

            await expect(responseHeaderValue(
                await storage.temporaryUrl('private+file.txt', {expiresAt: Date.now() + 60 * 1000, responseHeaders: {'Expires': 'Sat, 21 Oct 2023 07:28:00 GMT'} }),
                'Expires'
            )).resolves.toEqual('Sat, 21 Oct 2023 07:28:00 GMT');
        });

        test('fetches file without Expires header when not specified in the options', async () => {
            await storage.write('private+file.txt', 'contents of the private file', {
                visibility: Visibility.PRIVATE,
            });

            await expect(responseHeaderValue(
                await storage.temporaryUrl('private+file.txt', {expiresAt: Date.now() + 60 * 1000}),
                'Expires'
            )).resolves.toBeUndefined();
        });
    });

    test('retrieving the size of a file', async () => {
        const contents = 'this is the contents of the file';
        await storage.write('something+file.txt', contents);

        expect(await storage.fileSize('something+file.txt')).toEqual(contents.length);
    });

    test('writing a png and fetching its mime-type', async () => {
        const handle = createReadStream(path.resolve(process.cwd(), 'fixtures/screenshot.png'));
        await storage.write('image.png', handle);
        closeReadable(handle);

        const mimeType = await storage.mimeType('image.png');

        expect(mimeType).toEqual('image/png');
    });

    test('fetching the last modified', async () => {
        await storage.write('test.txt', 'contents');

        const lastModified = await storage.lastModified('test.txt');

        expect(lastModified).toBeGreaterThan(Date.now() - 5000);
        expect(lastModified).toBeLessThan(Date.now() + 5000);
    });

    test('it can request checksums', async () => {
        function hashString(input: string, algo: string, encoding: BinaryToTextEncoding = 'hex'): string {
            return createHash(algo).update(input).digest(encoding);
        }

        const contents = 'this is for the checksum';
        await storage.write('path.txt', contents);
        const expectedChecksum = hashString(contents, 'md5');

        const checksum = await storage.checksum('path.txt', {
            algo: 'etag',
        });

        expect(checksum).toEqual(expectedChecksum);
    });

    test('it can request sha256 checksums', async () => {
        function hashString(input: string, algo: string, encoding: BinaryToTextEncoding = 'hex'): string {
            return createHash(algo).update(input).digest(encoding);
        }

        const contents = 'this is for the checksum';
        await storage.write('path.txt', contents, {
            ChecksumAlgorithm: 'SHA256'
        });
        const expectedChecksum = hashString(contents, 'sha256', 'base64');

        const checksum = await storage.checksum('path.txt', {
            algo: 'sha256',
        });

        expect(checksum).toEqual(expectedChecksum);
    });

    test('uploads can be aborted', async () => {
        const reason = new Error('Because I say so');
        const controller = new AbortController();
        const options = {
            abortSignal: controller.signal,
        } as const;

        await expect((async () => {
            const promise = storage.write('cache.txt', 'some content', {
                abortSignal: controller.signal,
            });

            controller.abort(reason);

            return promise;
        })()).rejects.toThrow(UnableToWriteFile.because(
            'Because I say so',
            {cause: reason, context: {path: 'cache.txt', options}},
        ));
    })

    test('it handles custom Cache-Control header', async() => {
        await storage.write('cache.txt', 'some content', {cacheControl: "max-age=7200, public", visibility: Visibility.PUBLIC});
        const url = await storage.publicUrl('cache.txt')
        const res = await fetch(url);
        expect(res.headers.get("Cache-Control")).toEqual("max-age=7200, public")
    });
});

function naivelyDownloadFile(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
        https.get(url, async res => {
            if (res.statusCode !== 200) {
                reject(new Error(`Not able to download the file from ${url}, response status [${res.statusCode}]`));
            } else {
                resolve(await readableToString(res));
            }
        });
    });
}

function naivelyMakeRequestFile(url: string, headers: UploadRequestHeaders, method: string, data: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const req = https.request(url, {
            method: method,
            headers: {
                ...headers,
                'Content-Length': new Blob([data]).size,
            }
        }, async res => {
            let responseBody = '';
            res.on('data', (chunk) => {
                responseBody += chunk;
            });
            res.on('end', () => {
                const statusCode = res.statusCode ?? 500;

                if (statusCode <= 200 && statusCode >= 299) {
                    reject(new Error(`Not able to download the file from ${url}, response status [${res.statusCode}]`));
                } else {
                    resolve();
                }
            });
        });

        req.on('error', (err) => {
            reject(err);
        });
        req.write(data);
        req.end();
    });
}

function responseHeaderValue(url: string, header: string): Promise<string | undefined> {
    return new Promise((resolve, reject) => {
        https.get(url, res => {
            if (res.statusCode !== 200) {
                reject(new Error(`Not able to download the file from ${url}, response status [${res.statusCode}]`));
            } else {
                resolve(
                    res.headers[header]?.toString()
                        ?? res.headers[header.toLowerCase()]?.toString()
                        ?? undefined
                );
            }
        });
    });
}
