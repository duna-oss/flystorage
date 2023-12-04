<img src="https://avatars.githubusercontent.com/u/151840999" width="50px" height="50px" />

# Flystorage adapter for AWS S3

This package contains the Flystorage adapter for Azure Storage Blob

## Installation

Install all the required packages

```bash
npm install --save @flystorage/file-storage @flystorage/azure-storage-blob @azure/storage-blob
```

## Usage

```typescript
import {FileStorage} from '@flystorage/file-storage';

const storage = new FileStorage(adapter);
```

> ⚠️ Always use the FileStorage, it is essential for security and a good developer
> experience. Do not use the adapter directly.

