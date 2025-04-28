const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const connectDB = require('./config/db');
const foodRoutes = require('./routes/food.routes');
const dietRoutes = require('./routes/diet.routes');
const corsOptions = require('./config/cors.config');

dotenv.config();
connectDB();

const app = express();
app.use(cors(corsOptions));
app.use(express.json());

app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/diet', require('./routes/diet.routes'));
app.use('/api', foodRoutes);
app.use('/api/diet', dietRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
