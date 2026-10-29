// Hermetic stand-in for the Claude Code CLI. NOT the real binary.
// Dumps what the runner gave it so tests can assert the sandbox.
import { readdirSync } from 'node:fs';
let stdin = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => (stdin += d));
process.stdin.on('end', () => {
  const home = process.env.HOME ?? '';
  const dump = {
    env: process.env,
    cwd: process.cwd(),
    args: process.argv.slice(2),
    stdin,
    homeFiles: home ? readdirSync(home) : [],
  };
  process.stdout.write(
    JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: JSON.stringify(dump) }),
  );
});
