import express from 'express';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import ytdl from 'ytdl-core';
import instagramGetUrl from 'instagram-url-direct';
import { getVideoMeta } from 'tiktok-scraper';
import { createServer } from 'http';
import { Server } from 'socket.io';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));

const downloadsDir = path.join(__dirname, 'downloads');
if (!fs.existsSync(downloadsDir)) {
  fs.mkdirSync(downloadsDir);
}

app.get('/', (req, res) => {
  res.render('index');
});

app.post('/download', async (req, res) => {
  const { url } = req.body;
  const clientId = req.headers['x-client-id']; // Expecting client ID in headers
  try {
    let filePath;
    let downloadStream;

    if (ytdl.validateURL(url)) {
      const videoInfo = await ytdl.getInfo(url);
      const title = videoInfo.videoDetails.title.replace(/[^a-zA-Z0-9 ]/g, "");
      filePath = path.join(downloadsDir, `${title}.mp4`);

      downloadStream = ytdl(url, { quality: 'highest' });
    } else if (url.includes('instagram.com')) {
      const { url_list } = await instagramGetUrl(url);
      filePath = path.join(downloadsDir, `${Date.now()}.mp4`);

      const response = await axios.get(url_list[0], { responseType: 'stream' });
      downloadStream = response.data;
    } else if (url.includes('tiktok.com')) {
      const videoMeta = await getVideoMeta(url);
      filePath = path.join(downloadsDir, `${Date.now()}.mp4`);

      const response = await axios.get(videoMeta.videoUrl, { responseType: 'stream' });
      downloadStream = response.data;
    } else {
      return res.status(400).send('Unsupported URL');
    }

    const fileStream = fs.createWriteStream(filePath);
    let downloadedBytes = 0;
    let totalBytes = 0;

    downloadStream.on('response', (response) => {
      totalBytes = parseInt(response.headers['content-length'], 10);
    });

    downloadStream.on('data', (chunk) => {
      downloadedBytes += chunk.length;
      const progress = (downloadedBytes / totalBytes) * 100;
      io.to(clientId).emit('progress', { progress });
    });

    downloadStream.pipe(fileStream);

    fileStream.on('finish', () => {
      res.send({ filePath }); // Send the file path to the client after download
    });

    fileStream.on('error', (err) => {
      console.error('Error writing to file:', err);
      res.status(500).send('Error writing to file.');
    });
  } catch (error) {
    console.error('Error downloading the file:', error);
    res.status(500).send('Error downloading the file.');
  }
});

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
