const dotenv = require('dotenv');
dotenv.config({ debug: true });
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const connectDB = require('./config/db');
const { fetchAndPostBills } = require('./scripts/fetchBills.js');
const { errorHandler } = require('./middleware/errorMiddleware');


console.log('--- Checking Environment Variables ---');
console.log('MONGO_URI:', process.env.MONGO_URI ? 'Loaded Successfully' : 'MISSING!');
console.log('JWT_SECRET:', process.env.JWT_SECRET ? 'Loaded Successfully' : 'MISSING!');
console.log('OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? 'Loaded Successfully' : 'MISSING or EMPTY!');
console.log('------------------------------------');
connectDB();

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({extended: false}));

app.use('/api/users', require('./routes/users'));
app.use('/api/posts', require('./routes/posts'));
app.use('/api/posts/:postId/comments', require('./routes/comments'));

app.use(errorHandler);

cron.schedule('0 0 * * *', () => {
    console.log('Running scheduled daily bill fetch job...');
    fetchAndPostBills();
});

fetchAndPostBills();

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));