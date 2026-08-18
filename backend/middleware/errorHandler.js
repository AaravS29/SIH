export function errorHandler(error, _req, res, _next) {
  console.error(error);
  if (error.name === 'ZodError') return res.status(400).json({ error: 'Invalid request', details: error.issues });
  res.status(500).json({ error: 'Internal server error' });
}
