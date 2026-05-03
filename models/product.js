const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
    name: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    description: String,
    image: { type: String, default: 'default-coffee.jpg' },
    category: { type: String, enum: ['Drinks', 'Snacks', 'Desserts'], default: 'Drinks' },
    isAvailable: { type: Boolean, default: true }
});

module.exports = mongoose.model('Product', productSchema);