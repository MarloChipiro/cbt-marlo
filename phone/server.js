const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = 3000;
const JWT_SECRET = 'your-secret-key'; // Change this to a secure, long, random key!

// Middleware setup
app.use(cors());
app.use(bodyParser.json());

// =======================================================
// DATABASE CONNECTION
// =======================================================
const dbURI = 'mongodb://localhost:27017/consumer_tracker';

mongoose.connect(dbURI)
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('Could not connect to MongoDB:', err));

// =======================================================
// DEFINE MONGOOSE SCHEMAS
// =======================================================
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true }
});
const User = mongoose.model('User', userSchema);

const activitySchema = new mongoose.Schema({
    time: String,
    lat: Number,       // <--- ADDED: Location Latitude
    lon: Number,       // <--- ADDED: Location Longitude
    category: String,  // <--- ADDED: Item Category
    count: Number,
    age: String,
    behaviour: String,
    returnedItem: String, // <--- ADDED: Returned Item
    items: String,
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' } // Link data to a user
});
const Activity = mongoose.model('Activity', activitySchema);

const demographicsSchema = new mongoose.Schema({
    ageGroup: String,
    percentage: Number,
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
});
const Demographics = mongoose.model('Demographics', demographicsSchema);

const dashboardMetricsSchema = new mongoose.Schema({
    totalConsumers: Number,
    activeLocations: Number,
    conversionRate: String,
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
});
const DashboardMetrics = mongoose.model('DashboardMetrics', dashboardMetricsSchema);

// =======================================================
// AUTHENTICATION MIDDLEWARE
// =======================================================
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) return res.sendStatus(401); // If no token, return Unauthorized

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403); // If token is invalid, return Forbidden
        req.user = user;
        next();
    });
};

// =======================================================
// API ENDPOINTS
// =======================================================

// PUBLIC ENDPOINT: Register a new user
app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10); // Hash the password
        const user = new User({ username, password: hashedPassword });
        await user.save();
        res.status(201).json({ message: 'User registered successfully!' });
    } catch (error) {
        res.status(400).json({ message: 'Error registering user', error: error.message });
    }
});

// PUBLIC ENDPOINT: Log in a user
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    const user = await User.findOne({ username });

    if (!user) {
        return res.status(400).json({ message: 'Invalid username or password' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
        return res.status(400).json({ message: 'Invalid username or password' });
    }

    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '1h' });
    res.json({ token, userId: user._id });
});

// PROTECTED ENDPOINT: Get dashboard data
app.get('/api/dashboard', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const activityData = await Activity.find({ userId });
        const demographicsData = await Demographics.find({ userId });
        let metricsData = await DashboardMetrics.findOne({ userId });

        if (!metricsData) {
            metricsData = new DashboardMetrics({ totalConsumers: 0, activeLocations: 0, conversionRate: "7.2%", userId });
            await metricsData.save();
        }

        res.json({
            activity: activityData,
            demographics: demographicsData,
            dashboardMetrics: metricsData
        });
    } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
        res.status(500).json({ message: "Internal server error" });
    }
});

// PROTECTED ENDPOINT: Add consumer activity data
app.post('/api/activity', authenticateToken, async (req, res) => {
    try {
        const newActivity = new Activity({ ...req.body, userId: req.user.userId });
        await newActivity.save();

        await DashboardMetrics.findOneAndUpdate(
            { userId: req.user.userId },
            { $inc: { totalConsumers: newActivity.count, activeLocations: Math.floor(Math.random() * 3) + 1 } },
            { upsert: true, new: true }
        );

        console.log("New activity added:", newActivity);
        res.status(201).json({ message: "Activity data added successfully", data: newActivity });
    } catch (error) {
        console.error('Failed to add activity data:', error);
        res.status(400).json({ message: "Invalid activity data provided" });
    }
});

// PROTECTED ENDPOINT: Add demographics data
app.post('/api/demographics', authenticateToken, async (req, res) => {
    try {
        const newDemographics = req.body.map(item => ({ ...item, userId: req.user.userId }));
        if (Array.isArray(newDemographics)) {
            await Demographics.deleteMany({ userId: req.user.userId });
            await Demographics.insertMany(newDemographics);

            console.log("Demographics data updated:", newDemographics);
            res.status(201).json({ message: "Demographics data updated successfully", data: newDemographics });
        } else {
            res.status(400).json({ message: "Invalid demographics data provided. Expected an array." });
        }
    } catch (error) {
        console.error('Failed to update demographics:', error);
        res.status(500).json({ message: "Internal server error" });
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});