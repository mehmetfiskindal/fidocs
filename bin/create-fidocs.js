#!/usr/bin/env node
import { runCreate } from '../src/cli/init.js';

const code = await runCreate(process.argv.slice(2));
process.exit(code ?? 0);
