const express = require('express');
const dotenv = require('dotenv');
const connectDB = require('./config/db');

dotenv.config();

connectDB();

const app = express();

app.use(express.json());

app.use('/api/users', require('./routes/users'));
app.use('/api/posts', require('./routes/posts'));
app.use('/api/comments', require('./routes/comments'));

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => console.log('Server running on port ${PORT}'));