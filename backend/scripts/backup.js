import { exec } from 'child_process';
import path from 'path';
import { mkdirSync, existsSync } from 'fs';

const dir = path.join(process.cwd(), 'backups');
if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
const ts = new Date().toISOString().replace(/[:.]/g, '-');
const dest = path.join(dir, `manual-${ts}`);

console.log(`Starting backup to ${dest}...`);
exec(`mongodump --db exam_hall_allotment --out "${dest}"`, (err, stdout, stderr) => {
  if (err) {
    console.error('Backup failed:', err.message);
    process.exit(1);
  }
  if (stdout) console.log(stdout);
  if (stderr) console.log(stderr);
  console.log('Backup created successfully at:', dest);
  process.exit(0);
});
