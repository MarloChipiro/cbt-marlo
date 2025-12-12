const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const app = express();
const PORT =  process.env.PORT;
const JWT_SECRET = 'm1a2r3l4o5c6h7i8p9i10r11o; // Change this to a secure, long, random key!

// Middleware setup
const allowedOrigins = [
    'https://effulgent-ganache-433653.netlify.app',
    'http://localhost:8888', // Add for local testing with netlify dev
    'http://localhost:3000', // Add if you still want to test on the server's port
];

app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl)
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) === -1) {
            const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
            return callback(new Error(msg), false);
        }
        return callback(null, true);
    },
    // IMPORTANT: Allow the methods and headers needed for API calls
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    allowedHeaders: 'Content-Type,Authorization', 
    credentials: true 
};	
// Enable pre-flight across all routes
app.options('*', cors(corsOptions)); 

app.use(cors(corsOptions));
app.use(bodyParser.json());

// =======================================================
// DATABASE CONNECTION
// =======================================================
const dbURI = process.env.MONGODB_URI ||'mongodb://localhost:27017/consumer_tracker';

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
    lat: Number,       // Location Latitude
    lon: Number,       // Location Longitude
    count: Number,     // Consumer Count
    age: String,       // Age Group
    // New nested structure for multi-item interactions
    interactions: [{
        type: { type: String, enum: ['Browsing', 'Purchasing', 'Returning'], required: true },
        item: { type: String, required: true },
        category: { type: String, required: true }     //Individual Consumer Interactions
    }],
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
// Function to convert nested JSON data to a flattened CSV string
// From server.js
// Function to convert already flattened JSON data (one row per interaction) to a CSV string
// server.js: The FINAL corrected convertToCsv function
function convertToCsv(data) {
    if (data.length === 0) return '';

    // Define headers for the flattened data structure
    const headers = [
        'Activity ID', 'Time', 'Latitude', 'Longitude', 'Consumer Count', 'Age Group', 
        'Behavior Type', 'Item Name', 'Item Category'
    ];
    const csvRows = [];
    // Quoting headers for robustness
    csvRows.push(headers.map(h => `"${h}"`).join(',')); 

    // Direct conversion of already flattened data (one row per interaction)
    data.forEach(row => { 
        // Access the fields created in the /api/activity/csv endpoint's flattening logic
        const csvRow = [
            row._id ? row._id.toString() : 'N/A',
            row.time || 'N/A',
            row.lat || 'N/A',
            row.lon || 'N/A',
            row.count || 'N/A',
            row.age || 'N/A',
            row.interaction_type || 'N/A',   // Use the flattened field names
            row.interaction_item || 'N/A',
            row.interaction_category || 'N/A'
        ];
        
        // Quote all fields to handle commas within item names/categories
        csvRows.push(csvRow.map(field => `"${field}"`).join(',')); 
    });

    return csvRows.join('\n');
}
// PROTECTED ENDPOINT: Get dashboard data
// PROTECTED ENDPOINT: Get dashboard data
app.get('/api/dashboard', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const activityData = await Activity.find({ userId });
        
        let metricsData = await DashboardMetrics.findOne({ userId });

        if (!metricsData) {
            metricsData = new DashboardMetrics({ totalConsumers: 0, activeLocations: 0, conversionRate: "0.0%", userId });
        }

        // --- CALCULATION SETUP ---
        const ageGroupCounts = {};
        const interactionTypeCounts = {};
        const itemCategoryCounts = {};
        let totalPurchases = 0;
        let totalConsumerCount = 0;
        
        // Loop through all activities to gather data for all metrics
        activityData.forEach(activity => {
            // Count total consumers
            totalConsumerCount += activity.count; 
            
            // Count age group occurrences (for demographics chart and target analysis)
            const ageGroup = activity.age;
            if (ageGroup) {
                ageGroupCounts[ageGroup] = (ageGroupCounts[ageGroup] || 0) + 1;
            }
            
            // Count purchases, interaction types, and categories (for conversion rate & target analysis)
            activity.interactions.forEach(interaction => {
                if (interaction.type === 'Purchasing') {
                    totalPurchases += 1; 
                }
                
                // Count interaction types
                const type = interaction.type;
                interactionTypeCounts[type] = (interactionTypeCounts[type] || 0) + 1;

                // Count item categories
                const category = interaction.category;
                itemCategoryCounts[category] = (itemCategoryCounts[category] || 0) + 1;
            });
        });
        // --- END CALCULATION SETUP ---

        // Recommended Dynamic Calculation for Active Locations (to be added to /api/dashboard in server.js)
        
        // --- DYNAMIC ACTIVE LOCATIONS CALCULATION START ---
        const uniqueLocations = new Set();
        activityData.forEach(activity => {
            // Create a unique key for each lat/lon combination
            if (activity.lat && activity.lon) {
                uniqueLocations.add(`${activity.lat.toFixed(4)},${activity.lon.toFixed(4)}`);
            }
        });
        const activeLocationsCount = uniqueLocations.size; 
        // --- DYNAMIC ACTIVE LOCATIONS CALCULATION END ---

        // Update metricsData object with the new count
        metricsData.activeLocations = activeLocationsCount;
		
        // --- DYNAMIC DEMOGRAPHICS (for chart) ---
        const dynamicDemographics = Object.keys(ageGroupCounts).map(age => ({
            age_group: age, 
            count: ageGroupCounts[age]
        }));


        // --- DYNAMIC CONVERSION RATE (for KPI) ---
        let conversionRate = "0.0%";
        if (totalConsumerCount > 0) {
            let rate = (totalPurchases / totalConsumerCount) * 100;
            conversionRate = rate.toFixed(1) + "%";
        }
        
        // Update metrics
        metricsData.totalConsumers = totalConsumerCount; 
        metricsData.conversionRate = conversionRate; 
        await metricsData.save();


        // --- TARGET KEY DEMOGRAPHICS ANALYSIS (for recommendations) ---
        
        // Helper function to find the key of the max value in an object
        const findMaxKey = (countsObj) => {
            let maxKey = 'N/A';
            let maxCount = 0;
            for (const key in countsObj) {
                if (countsObj[key] > maxCount) {
                    maxCount = countsObj[key];
                    maxKey = key;
                }
            }
            return maxKey;
        };

        const targetKeyDemographics = {
            targetAgeGroup: findMaxKey(ageGroupCounts),
            keyInteraction: findMaxKey(interactionTypeCounts),
            keyCategory: findMaxKey(itemCategoryCounts)
        };
        

        res.json({
            activity: activityData,
            demographics: dynamicDemographics, 
            dashboardMetrics: metricsData,
            // Send the analysis results to the front-end
            targetKeyDemographics: targetKeyDemographics 
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
// PROTECTED ENDPOINT: Export flattened activity data as CSV
app.get('/api/activity/csv', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const activityData = await Activity.find({ userId }).lean(); // Use .lean() for plain JS objects
        
        const flattenedData = [];

        // Flatten the data: one row per interaction
        activityData.forEach(activity => {
            activity.interactions.forEach(interaction => {
                flattenedData.push({
                    _id: activity._id,
                    time: activity.time,
                    lat: activity.lat,
                    lon: activity.lon,
                    count: activity.count,
                    age: activity.age,
                    userId: activity.userId,
                    interaction_type: interaction.type,
                    interaction_item: interaction.item,
                    interaction_category: interaction.category,
                });
            });
        });

        const csvContent = convertToCsv(flattenedData);

        res.header('Content-Type', 'text/csv');
        res.attachment('consumer_activity_flattened.csv');
        res.send(csvContent);

    } catch (error) {
        console.error('Failed to export CSV data:', error);
        res.status(500).send("Internal server error during CSV export.");
    }
});
// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on https://localhost:${PORT}`);

});



