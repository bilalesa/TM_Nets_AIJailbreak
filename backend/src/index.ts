import express from 'express';
import cors from 'cors';
import authRoutes from './routes/authRoutes.js';
import playerRoutes from './routes/playerRoutes.js';

const app = express();
app.use(cors());
app.use(express.json());

// Register the routes
app.use('/api/auth', authRoutes);
app.use('/api/players', playerRoutes);

app.listen(3001, () => console.log('Server running on port 3001'));