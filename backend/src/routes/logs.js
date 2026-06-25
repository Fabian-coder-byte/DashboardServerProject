const express = require('express');
const Docker = require('dockerode');
const router = express.Router();

const docker = new Docker({ socketPath: '/var/run/docker.sock' });

// GET /api/logs/docker/:containerName?tail=100
router.get('/docker/:containerName', async (req, res) => {
  const { containerName } = req.params;
  const tail = parseInt(req.query.tail) || 100;

  try {
    const container = docker.getContainer(containerName);
    const logs = await container.logs({
      stdout: true,
      stderr: true,
      tail,
      timestamps: true
    });

    const lines = logs
      .toString('utf8')
      .split('\n')
      .map(line => line.replace(/[\x00-\x09\x0b-\x1f]/g, '').trim())
      .filter(line => line.length > 0);

    res.json({ container: containerName, lines, total: lines.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
