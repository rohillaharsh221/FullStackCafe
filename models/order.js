const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
    orderId: { type: String, required: true, unique: true },

    customer: { type: String, required: true },

    items: [{
        name: String,
        price: Number,
        quantity: Number
    }],

    totalPrice: { type: Number, required: true },

    status: {
        type: String,
        enum: ['Pending', 'Preparing', 'Completed'],
        default: 'Pending'
    }

}, { timestamps: true });

module.exports = mongoose.model('Order', orderSchema);