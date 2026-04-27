
// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    res.status(200).json({
      status: 'ok',
      service: 'backend',
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ status: 'error' });
  }
});
