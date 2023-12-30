<img src="https://raw.githubusercontent.com/duna-oss/flystorage/main/flystorage.svg" width="50px" height="50px" />

# Flystorage for multer

This package contains the Flystorage bindings for [multer](https://github.com/expressjs/multer).

This allows multer to upload to any of the supported Flystorage filesystems.

## Installation

Install all the required packages

```bash
npm install --save @flystorage/file-storage @flystorage/multer-storage
```

## Usage

```typescript
import {FileStorage} from '@flystorage/file-storage';
import {FlystorageMulterStorageEngine} from '@flystorage/multer-storage';
import multer from 'multer';

const adapter = createYourAdapter();
const fileStorage = new FileStorage(adapter);

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
```

