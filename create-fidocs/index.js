#!/usr/bin/env node
import { runCreate } from './scaffold.js';

const code = await runCreate(process.argv.slice(2));
process.exit(code ?? 0);
