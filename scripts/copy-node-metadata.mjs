import { copyFile } from 'node:fs/promises';

// Build-time metadata copy. This script is not shipped in the runtime package.
await copyFile(
  new URL('../nodes/SaasThinkTank/SaasThinkTank.node.json', import.meta.url),
  new URL('../dist/nodes/SaasThinkTank/SaasThinkTank.node.json', import.meta.url),
);
