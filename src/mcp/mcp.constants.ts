import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const readPackageVersion = (): string =>
  (
    JSON.parse(
      readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8'),
    ) as { version: string }
  ).version;

export const MCP_SERVER_NAME = 'cosmic-arcana-mcp';
// Read from package.json (same relative path from src/ and dist/) so it follows the versioning skill.
export const MCP_SERVER_VERSION = readPackageVersion();
export const MCP_ROUTE = 'mcp';
