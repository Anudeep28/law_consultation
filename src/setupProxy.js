const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function (app) {
  app.get('/api/scribe-token', async (req, res) => {
    try {
      const apiKey = process.env.REACT_APP_ELEVENLABS_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: 'API key not configured' });
      }
      const response = await fetch('https://api.elevenlabs.io/v1/single-use-token/realtime_scribe', {
        method: 'POST',
        headers: { 'xi-api-key': apiKey },
      });
      if (!response.ok) {
        const err = await response.text();
        return res.status(response.status).json({ error: err });
      }
      const data = await response.json();
      res.json({ token: data.token });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });
};
