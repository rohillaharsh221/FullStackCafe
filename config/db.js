const mongoose = require('mongoose');
const dbURI = process.env.MONGO_URI;

const connectDB = async () => {
    if (!dbURI) {
        console.error('❌ Error: MONGO_URI is not defined in .env file');
        process.exit(1);
    }
    try {
        await mongoose.connect(dbURI);
        console.log('✅ Successfully connected to MongoDB');
    } catch (err) {
        console.error('❌ MongoDB Connection error:', err.message);
        process.exit(1); 
    }
};

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true }
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

module.exports = { connectDB, User };