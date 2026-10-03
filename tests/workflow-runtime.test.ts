import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'avataragent-runtime-'));
process.env.AI_PROVIDER = 'mock';
process.env.MOCK_DELAY_MS = '5';
process.env.HELP_TIMEOUT_SEC = '600';

const { localWorkflowRuntime } = await import('../server/workflow-runtime.ts');
const { runtimeContract } = await import('./runtime-contract.ts');

runtimeContract('local', localWorkflowRuntime);
