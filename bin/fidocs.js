#!/usr/bin/env node
import { main } from '../src/cli/index.js';

main().then((code) => {
  if (code) process.exitCode = code;
});
