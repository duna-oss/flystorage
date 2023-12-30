<img src="https://raw.githubusercontent.com/duna-oss/flystorage/main/flystorage.svg" width="50px" height="50px" />

# Flystorage adapter using memory

This package contains the Flystorage adapter that uses only memory

## Installation

Install all the required packages

```bash
npm install --save @flystorage/file-storage @flystorage/in-memory
```

## Usage

```typescript
import {FileStorage} from '@flystorage/file-storage';
import {InMemoryStorageAdapter} from '@flystorage/in-memory';

const adapter = new InMemoryStorageAdapter();
const storage = new FileStorage(adapter);
```

> ⚠️ Always use the FileStorage, it is essential for security and a good developer
> experience. Do not use the adapter directly.

