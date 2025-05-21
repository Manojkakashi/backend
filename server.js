// backend/server.js
require('dotenv').config();

const express = require('express');
const multer  = require('multer');
const cors    = require('cors');
const { spawn } = require('child_process');
const path    = require('path');
const fs      = require('fs');

const app = express();

// 1) Enable CORS for all origins (adjust origin array if you prefer restricting)
app.use(cors());
app.options('*', cors()); // handle pre-flight

// 2) Create uploads directory if it doesn't exist
const uploadDir = process.env.UPLOAD_DIR || 'uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// 3) Multer setup for file uploads
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename:   (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage });

// 4) Health-check endpoint (optional)
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// 5) POST /api/upload — combine files, run Python scripts, return download paths
app.post('/api/upload', upload.array('files'), (req, res) => {
  const dataPath     = path.join(uploadDir, 'data.txt');
  const smartPath    = path.join(uploadDir, 'memories.jsonl');
  const finetunePath = path.join(uploadDir, 'finetune_data.jsonl');

  // Combine uploaded .txt files into one data.txt
  const outStream = fs.createWriteStream(dataPath);
  req.files.forEach(file => {
    const content = fs.readFileSync(file.path, 'utf-8');
    outStream.write(content + '\n\n');
  });
  outStream.end();

  const pythonCmd = process.env.PYTHON_PATH || 'python';

  // 5a) Run generate_jsonl_smart.py
  let genErrorLog = '';
  const gen = spawn(
    pythonCmd,
    ['scripts/generate_jsonl_smart.py', '--input', dataPath, '--output', smartPath],
    { cwd: __dirname }
  );
  gen.stderr.on('data', chunk => genErrorLog += chunk.toString());

  gen.on('close', code => {
    if (code !== 0) {
      console.error('generate_jsonl_smart.py error:', genErrorLog);
      return res.status(500).send(`Error generating smart JSONL:\n${genErrorLog}`);
    }

    // 5b) Run prepare_finetune_dataset.py
    let prepErrorLog = '';
    const prep = spawn(
      pythonCmd,
      ['scripts/prepare_finetune_dataset.py', '--input', smartPath, '--output', finetunePath],
      { cwd: __dirname }
    );
    prep.stderr.on('data', chunk => prepErrorLog += chunk.toString());

    prep.on('close', code2 => {
      if (code2 !== 0) {
        console.error('prepare_finetune_dataset.py error:', prepErrorLog);
        return res.status(500).send(`Error preparing fine-tune JSONL:\n${prepErrorLog}`);
      }

      // 5c) Success: respond with download endpoints
      res.json({
        smart:    `/api/download/${path.basename(smartPath)}`,
        finetune: `/api/download/${path.basename(finetunePath)}`
      });
    });
  });
});

// 6) GET /api/download/:filename — serve generated files
app.get('/api/download/:filename', (req, res) => {
  const filePath = path.join(uploadDir, req.params.filename);
  if (fs.existsSync(filePath)) {
    return res.download(filePath);
  }
  res.status(404).send(`File not found: ${req.params.filename}`);
});

// 7) Start the server
const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`Backend listening on port ${port}`);
});
