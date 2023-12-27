import express, {Response, Request} from 'express';
import {FlystorageMulterStorageEngine} from './index.js';
import {LocalStorageAdapter} from "@flystorage/local-fs";
import {FileStorage} from "@flystorage/file-storage";
import {resolve} from "node:path";
import FormData from "form-data";
import multer from 'multer';
import fetch from 'node-fetch';

describe('FlystorageMulterStorageEngine', () => {
    test('it can process uploaded files', async () => {
        const uploadStorage = new FileStorage(
            new LocalStorageAdapter(
                resolve(process.cwd(), 'fixtures/test-files'),
            )
        );
        const fixtureStorage = new FileStorage(
            new LocalStorageAdapter(
                resolve(process.cwd(), 'fixtures'),
            )
        );

        const app = express();
        const storage = new FlystorageMulterStorageEngine(
            uploadStorage,
            async (action, _req: express.Request, file: Express.Multer.File) => {
                if (action === 'handle') {
                    return file.originalname;
                } else {
                    return file.destination;
                }
            }
        );

        const uploader = multer({storage});
        app.post('/upload', uploader.single('image'), (req: Request, res: Response) => {
            res.status(200).json({
                status: 'OK',
            });
        })
        const server = app.listen(5555);
        await new Promise(resolve => setTimeout(resolve, 100));
        const formData = new FormData();
        const stat = await fixtureStorage.statFile('screenshot.png');
        formData.append('image', await fixtureStorage.read('screenshot.png'), {
            knownLength: stat.size,
            contentType: await fixtureStorage.mimeType('screenshot.png'),
            filename: 'screenshot-uploaded.png',
        });
        const response = await fetch('http://localhost:5555/upload', {
            method: 'POST',
            body: formData,
            headers: formData.getHeaders()
        });

        expect(response.status).toEqual(200);
        server.close();

        expect(await uploadStorage.fileExists('screenshot-uploaded.png')).toEqual(true);
    })
})