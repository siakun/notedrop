export interface VaultFs {
  readFile(path: string): Promise<string>
  readBinary(path: string): Promise<Uint8Array>
  writeFile(path: string, content: string): Promise<void>
  fileExists(path: string): Promise<boolean>
  listFiles(folderPath: string): Promise<string[]>
  listAllFiles(): Promise<string[]>
  searchByName(filename: string): Promise<string[]>
}
