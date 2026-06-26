const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();
const BACKUP_PATH = path.join(process.env.DATA_PATH || '/app/data', 'backup-status.json');

function load() {
  try { return JSON.parse(fs.readFileSync(BACKUP_PATH, 'utf8')); }
  catch { return { backups: [] }; }
}

// GET /api/backup
router.get('/', (req, res) => res.json(load()));

module.exports = router;
