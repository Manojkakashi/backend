// backend/server.js
require('dotenv').config();

const express = require('express');
const multer  = require('multer');
const cors    = require('cors');
const { spawn } = require('child_process');
const path    = require('path');
const fs      = require('fs');

const app = express();

// --- CORS Setup ---
const allowedOrigins = [
  'http://localhost:3000',
  'https://frontend-o0cz2f4d7-manojkakashis-projects.vercel.app'
];

app.use(cors({
  origin: (origin, callback) => {
    // allow requests with no origin (e.g. mobile apps, curl)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS policy violation: origin ${origin} not allowed`));
  },
  methods: ['GET','POST','OPTIONS'],
  allowedHeaders: ['Content-Type']
}));

// Handle pre-flights
app.options('*', cors());

// --- Ensure upload directory exists ---
const uploadDir = process.env.UPLOAD_DIR || 'uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// --- Multer config ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename:    (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage });

// --- POST /api/upload ---
app.post('/api/upload', upload.array('files'), (req, res) => {
  const dataPath    = path.join(uploadDir, 'data.txt');
  const smartPath   = path.join(uploadDir, 'memories.jsonl');
  const finetunePath= path.join(uploadDir, 'finetune_data.jsonl');

  // Combine uploaded files
  const out = fs.createWriteStream(dataPath);
  req.files.forEach(f => {
    out.write(fs.readFileSync(f.path, 'utf-8') + '\n\n');
  });
  out.end();

  const pythonCmd = process.env.PYTHON_PATH || 'python';

  // 1) generate_jsonl_smart.py
  let genErr = '';
  const gen = spawn(
    pythonCmd,
    ['scripts/generate_jsonl_smart.py', '--input', dataPath, '--output', smartPath],
    { cwd: __dirname }
  );
  gen.stderr.on('data', c => genErr += c.toString());

  gen.on('close', code => {
    if (code !== 0) {
      console.error('[generate_jsonl_smart] stderr:', genErr);
      return res.status(500).send(`Error generating JSONL smart:\n${genErr}`);
    }

    // 2) prepare_finetune_dataset.py
    let prepErr = '';
    const prep = spawn(
      pythonCmd,
      ['scripts/prepare_finetune_dataset.py', '--input', smartPath, '--output', finetunePath],
      { cwd: __dirname }
    );
    prep.stderr.on('data', c => prepErr += c.toString());

    prep.on('close', code2 => {
      if (code2 !== 0) {
        console.error('[prepare_finetune_dataset] stderr:', prepErr);
        return res.status(500).send(`Error preparing fine-tune dataset:\n${prepErr}`);
      }

      // Success
      res.json({
        smart:    `/api/download/${path.basename(smartPath)}`,
        finetune: `/api/download/${path.basename(finetunePath)}`
      });
    });
  });
});

// --- GET /api/download/:filename ---
app.get('/api/download/:filename', (req, res) => {
  const file = path.join(uploadDir, req.params.filename);
  if (fs.existsSync(file)) {
    return res.download(file);
  }
  res.status(404).send(`File not found: ${req.params.filename}`);
});

// --- Optional Health Check ---
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// --- Start Server ---
const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`Backend listening on port ${port}`));
