import {FileStorage, Visibility} from "@flystorage/file-storage";
import {InMemoryStorageAdapter} from "./in-memory-file-storage.js";

describe('InMemoryStorageAdapter', () => {
    const adapter = new InMemoryStorageAdapter();
    const storage = new FileStorage(adapter);

    beforeEach(() => {
        adapter.deleteEverything();
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

    test('reading a file that was written', async () => {
        await storage.write('path.txt', 'content in azure');
        const content = await storage.readToString('path.txt');

        expect(content).toEqual('content in azure');
    });

    test('trying to read a file that does not exist', async () => {
        await expect(storage.readToString('404.tx')).rejects.toThrow();
    });

    test('trying to see if a non-existing file exists', async () => {
        expect(await storage.fileExists('404.txt')).toEqual(false);
    });

    test('trying to see if an existing file exists', async () => {
        await storage.write('existing.txt', 'contents');

        expect(await storage.fileExists('existing.txt')).toEqual(true);
    });

    test('deleting an existing file', async () => {
        await storage.write('existing.txt', 'contents');

        expect(await storage.fileExists('existing.txt')).toEqual(true);

        await storage.deleteFile('existing.txt');

        expect(await storage.fileExists('existing.txt')).toEqual(false);
    });

    test('deleting a non-existing file is OK', async () => {
        await expect(storage.deleteFile('404.txt')).resolves.not.toThrow();
    });

    test('copying a file', async () => {
        await storage.write('file.txt', 'copied');

        await storage.copyFile('file.txt', 'new-file.txt');

        expect(await storage.fileExists('file.txt')).toEqual(true);
        expect(await storage.fileExists('new-file.txt')).toEqual(true);
        expect(await storage.readToString('new-file.txt')).toEqual('copied');
    });

    test('moving a file', async () => {
        await storage.write('file.txt', 'moved');

        await storage.moveFile('file.txt', 'new-file.txt');

        expect(await storage.fileExists('file.txt')).toEqual(false);
        expect(await storage.fileExists('new-file.txt')).toEqual(true);
        expect(await storage.readToString('new-file.txt')).toEqual('moved');
    });

    test('setting visibility always fails', async () => {
        await storage.write('exsiting.txt', 'yes');
        await expect(storage.changeVisibility('existing.txt', Visibility.PUBLIC)).rejects.toThrow();
        await expect(storage.changeVisibility('404.txt', Visibility.PRIVATE)).rejects.toThrow();
    });

    test('listing entries in a directory, shallow', async () => {
        await storage.write('outside/path.txt', 'test');
        await storage.write('inside/a.txt', 'test');
        await storage.write('inside/b.txt', 'test');
        await storage.write('inside/c/a.txt', 'test');

        const listing = await storage.list('inside').toArray();
        expect(listing).toHaveLength(3);
        expect(listing[0].type).toEqual('file');
        expect(listing[1].type).toEqual('file');
        expect(listing[2].type).toEqual('directory');
        expect(listing[0].path).toEqual('inside/a.txt');
        expect(listing[1].path).toEqual('inside/b.txt');
        expect(listing[2].path).toEqual('inside/c');
    });

    test('listing entries in a directory, deep', async () => {
        await storage.write('outside/path.txt', 'test');
        await storage.write('inside/a.txt', 'test');
        await storage.write('inside/b.txt', 'test');
        await storage.write('inside/c/a.txt', 'test');

        const listing = await storage.list('inside', {deep: true}).toArray();
        expect(listing).toHaveLength(4);
        expect(listing[0].type).toEqual('file');
        expect(listing[1].type).toEqual('file');
        expect(listing[2].type).toEqual('directory');
        expect(listing[3].type).toEqual('file');
        expect(listing[0].path).toEqual('inside/a.txt');
        expect(listing[1].path).toEqual('inside/b.txt');
        expect(listing[2].path).toEqual('inside/c');
        expect(listing[3].path).toEqual('inside/c/a.txt');
    });

    test('deleting a full directory', async () => {
        await storage.write('directory/a.txt', 'test');
        await storage.write('directory/b.txt', 'test');
        await storage.write('directory/c/a.txt', 'test');

        await storage.deleteDirectory('directory');

        const listing = await storage.list('directory', {deep: true}).toArray();

        expect(listing).toEqual([]);
    });

    test('checking if a directory exists', async () => {
        await storage.write('directory/a.txt', 'test');
        await storage.write('directory/b.txt', 'test');
        await storage.write('directory/c/a.txt', 'test');

        expect(await storage.directoryExists('directory')).toEqual(true);
        expect(await storage.directoryExists('directory/c')).toEqual(true);
        expect(await storage.directoryExists('directory/a')).toEqual(false);
    });
});