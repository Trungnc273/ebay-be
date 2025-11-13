// src/controllers/authController.js
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretjwtkey_change_me';

exports.register = async (req, res, next) => {
  try {
    const { username, password, role } = req.body;
    if (!username || !password)
      return res.status(400).json({ message: 'username & password required' });
    const exists = await User.findOne({ username });
    if (exists) return res.status(400).json({ message: 'username taken' });
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);
    const user = await User.create({
      username,
      passwordHash: hash,
      role: role || 'buyer',
    });
    const payload = {
      userId: user._id,
      username: user.username,
      role: user.role,
    };
    const token = jwt.sign(payload, JWT_SECRET, {
      expiresIn: '7d',
    });
    res.status(201).json({
      data: {
        user: payload,
        token,
      },
    });
  } catch (err) {
    next(err);
  }
};

exports.login = async (req, res, next) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ message: 'username & password required' });
    const user = await User.findOne({ username });
    if (!user) return res.status(401).json({ message: 'invalid credentials' });
    const ok = await bcrypt.compare(password, user.passwordHash || '');
    if (!ok) return res.status(401).json({ message: 'invalid credentials' });
    const payload = {
      userId: user._id,
      username: user.username,
      role: user.role,
    };
    const token = jwt.sign(payload, JWT_SECRET, {
      expiresIn: '7d',
    });
    res.json({
      data: {
        user: payload,
        token,
      },
    });
  } catch (err) {
    next(err);
  }
};
