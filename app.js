require('dotenv').config();
const express = require('express');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
const webpush = require('web-push');
const morgan = require('morgan'); // 1. Import Morgan

const { connectDB, User } = require('./config/db');
const Product = require('./models/product');
const Order = require('./models/order');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

connectDB();

// ====================== MORGAN LOGGING ======================
app.use(morgan('dev')); // 2. Use Morgan (the 'dev' format is clean and colorful)

// ====================== WEB PUSH CONFIG ======================
const publicVapidKey = process.env.VAPID_PUBLIC_KEY;
const privateVapidKey = process.env.VAPID_PRIVATE_KEY;

webpush.setVapidDetails('mailto:admin@cafe.com', publicVapidKey, privateVapidKey);

// In-memory subscription store
let subscriptions = {};

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');

let currentUser = null;
let cart = [];

const adminUser = { email: 'admin@cafe.com', password: '123', name: 'Deepesh Rohilla' };

const isAuthenticated = (req, res, next) => {
    if (currentUser) next();
    else res.redirect('/login');
};

const getCartCount = () => cart.reduce((sum, item) => sum + item.quantity, 0);

// ====================== NOTIFICATION ROUTES ======================

app.post('/subscribe', (req, res) => {
    const { subscription, customerName } = req.body;
    if (customerName) {
        subscriptions[customerName] = subscription;
    }
    res.status(201).json({});
});

// ====================== USER ROUTES ======================

app.get('/', async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = 6;
    const skip = (page - 1) * limit;
    const category = req.query.category && req.query.category !== 'All' ? { category: req.query.category } : {};

    try {
        const totalProducts = await Product.countDocuments(category);
        const products = await Product.find(category).skip(skip).limit(limit);

        res.render('user/homepage', {
            products,
            user: currentUser,
            cartCount: getCartCount(),
            activeCategory: req.query.category || 'All',
            currentPage: page,
            totalPages: Math.ceil(totalProducts / limit) || 1,
            publicVapidKey
        });
    } catch (err) {
        res.status(500).send("Error loading menu");
    }
});

app.get('/login', (req, res) => res.render('login', { error: null, user: currentUser, cartCount: getCartCount() }));

app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    const user = await User.findOne({ email, password });
    if (user) { 
        currentUser = user; 
        res.redirect('/'); 
    } else {
        res.render('login', { error: 'Invalid Credentials', user: currentUser, cartCount: getCartCount() });
    }
});

app.get('/signup', (req, res) => res.render('signup', { user: currentUser, cartCount: getCartCount() }));

app.post('/signup', async (req, res) => {
    try {
        await new User(req.body).save();
        res.redirect('/login');
    } catch (err) {
        res.status(500).send("Error creating account");
    }
});

// ====================== CART & CHECKOUT ======================

app.get('/cart', (req, res) => {
    let total = cart.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
    res.render('user/cart', { cart, total, user: currentUser, cartCount: getCartCount() });
});

app.post('/add-to-cart', async (req, res) => {
    const product = await Product.findById(req.body.productId);
    if (!product || !product.isAvailable) return res.json({ success: false, message: 'Item unavailable' });

    const existingItem = cart.find(item => item.product._id.toString() === product._id.toString());
    if (existingItem) {
        existingItem.quantity += 1;
    } else {
        cart.push({ product, quantity: 1 });
    }
    res.json({ success: true, cartCount: getCartCount() });
});

app.post('/update-quantity', (req, res) => {
    const { productId, action } = req.body;
    const index = cart.findIndex(item => item.product._id.toString() === productId);
    
    if (index !== -1) {
        if (action === 'increase') cart[index].quantity += 1;
        else if (action === 'decrease') {
            cart[index].quantity -= 1;
            if (cart[index].quantity <= 0) cart.splice(index, 1);
        }
        const total = cart.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
        res.json({ success: true, currentQuantity: cart[index] ? cart[index].quantity : 0, newTotal: total, newCount: getCartCount() });
    } else res.json({ success: false });
});

app.post('/checkout', isAuthenticated, async (req, res) => {
    if (cart.length === 0) return res.redirect('/');

    const newOrder = new Order({
        orderId: 'ORD-' + Math.floor(Math.random() * 90000 + 10000),
        customer: currentUser.name,
        items: cart.map(i => ({ name: i.product.name, price: i.product.price, quantity: i.quantity })),
        totalPrice: cart.reduce((sum, i) => sum + (i.product.price * i.quantity), 0)
    });

    await newOrder.save();
    cart = [];
    res.redirect('/my-orders');
});

app.get('/my-orders', isAuthenticated, async (req, res) => {
    const orders = await Order.find({ customer: currentUser.name }).sort({ createdAt: -1 });
    res.render('user/my-orders', { orders, user: currentUser, cartCount: getCartCount() });
});

// ====================== ADMIN ROUTES ======================

app.get('/admin-login', (req, res) => res.render('admin/admin-login', { error: null }));

app.post('/admin-login', (req, res) => {
    const { email, password } = req.body;
    if (email === adminUser.email && password === adminUser.password) {
        currentUser = { name: adminUser.name, isAdmin: true };
        res.redirect('/admin/dashboard');
    } else {
        res.render('admin/admin-login', { error: 'Invalid Admin Credentials' });
    }
});

app.get('/admin/dashboard', async (req, res) => {
    const menu = await Product.find();
    res.render('admin/dashboard', { admin: adminUser, menu });
});

app.post('/admin/add-product', async (req, res) => {
    await new Product(req.body).save();
    res.redirect('/admin/dashboard');
});

app.post('/admin/toggle-stock', async (req, res) => {
    try {
        const product = await Product.findById(req.body.productId);
        if (product) {
            product.isAvailable = !product.isAvailable;
            await product.save();
        }
        res.redirect('/admin/dashboard');
    } catch (err) {
        res.status(500).send("Error updating stock status");
    }
});

app.post('/admin/delete-product', async (req, res) => {
    await Product.findByIdAndDelete(req.body.productId);
    res.redirect('/admin/dashboard');
});

app.get('/admin/orders', async (req, res) => {
    const orders = await Order.find().sort({ createdAt: -1 });
    res.render('admin/orders', { admin: adminUser, orders });
});

app.post('/update-order-status', async (req, res) => {
    const { orderId, status } = req.body;
    try {
        const order = await Order.findOneAndUpdate({ orderId: orderId }, { status: status }, { new: true });
        
        io.emit('order-status-updated', { orderId, status, customer: order.customer });

        if (status === 'Prepared' && subscriptions[order.customer]) {
            const payload = JSON.stringify({
                title: 'Order Prepared! ☕',
                body: `Hey ${order.customer}, your order ${orderId} is ready.`
            });
            webpush.sendNotification(subscriptions[order.customer], payload).catch(err => console.error(err));
        }

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

app.get('/logout', (req, res) => {
    currentUser = null;
    cart = [];
    res.redirect('/');
});

server.listen(3000, () => console.log('🚀 Server running on http://localhost:3000'));