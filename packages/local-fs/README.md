<img src="https://raw.githubusercontent.com/duna-oss/flystorage/main/flystorage.svg" width="50px" height="50px" />

# Flystorage adapter for the local filesystem

This package contains the Flystorage adapter for the local filesystem.

## Installation

Install all the required packages

```bash
npm install --save @flystorage/file-storage @flystorage/local-fs
```

## Usage

```typescript
import {FileStorage} from '@flystorage/file-storage';
import {LocalStorageAdapter} from '@flystorage/local-fs';

const rootDirectory = resolve(process.cwd(), 'my-files');
const adapter = new LocalStorageAdapter(rootDirectory);
const storage = new FileStorage(adapter);
```

> ⚠️ Always use the FileStorage, it is essential for security and a good developer
> experience. Do not use the adapter directly.

