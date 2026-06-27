declare module 'yazl' {
  export class ZipFile {
    outputStream: any;
    addFile(path: string, metadataPath: string): void;
    end(): void;
  }
}
