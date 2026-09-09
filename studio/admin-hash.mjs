import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { checkPassword, passwordHash } from './server/security.mjs';

if (!process.stdin.isTTY) throw Error('Run in an interactive terminal. Never pass passwords as command arguments.');
const silent = new Writable({ write(_chunk, _encoding, done) { done(); } });
const rl = createInterface({ input: process.stdin, output: silent, terminal: true });
try {
  process.stderr.write('Administrator password (hidden): ');
  const password = checkPassword(await rl.question(''));
  process.stderr.write('\nConfirm password (hidden): ');
  const confirmed = await rl.question('');
  process.stderr.write('\n');
  if (password !== confirmed) throw Error('Passwords do not match.');
  console.log(await passwordHash(password));
} finally { rl.close(); }
