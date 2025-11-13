// src/controllers/chatController.js
const mongoose = require('mongoose');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const { decryptText, encryptText } = require('../utils/encrypt'); // nếu có

const formatMsgs = (msgs) =>
  msgs.map((m) => ({
    id: m._id,
    conversationId: m.conversation,
    sender: m.sender,
    text: m.text,
    attachments: m.attachments || [],
    productRef: m.productRef || null,
    readBy: m.readBy || [],
    createdAt: m.createdAt,
  }));

exports.listConversations = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const skip = (page - 1) * limit;

    const convs = await Conversation.find({ participants: userId })
      .populate('participants', 'username')
      .sort({ lastMessageAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    return res.json({ data: convs });
  } catch (err) {
    next(err);
  }
};

exports.getConversation = async (req, res, next) => {
  try {
    const id = req.params.id; // expect :id
    if (!id || !mongoose.isValidObjectId(id))
      return res.status(400).json({ message: 'Invalid conversation id' });

    const conv = await Conversation.findById(id).populate(
      'participants',
      'username'
    );
    if (!conv) return res.status(404).json({ message: 'Not found' });

    return res.json({ data: conv });
  } catch (err) {
    next(err);
  }
};

exports.getMessages = async (req, res, next) => {
  try {
    const convId = req.params.id;
    if (!convId || !mongoose.isValidObjectId(convId))
      return res.status(400).json({ message: 'Invalid conversation id' });

    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const before = req.query.before; // ISO date string

    const query = { conversation: convId };
    if (before) {
      const dt = new Date(before);
      if (!isNaN(dt.getTime())) query.createdAt = { $lt: dt };
    }

    const msgs = await Message.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    // decrypt server-side if decryptText exists and text looks encrypted
    const out = msgs.map((m) => {
      let text = m.text || '';
      try {
        if (typeof decryptText === 'function' && text) text = decryptText(text);
      } catch (e) {
        // if decrypt fails, keep raw value (don't crash)
      }
      return {
        id: m._id,
        conversationId: m.conversation,
        sender: m.sender,
        text,
        attachments: m.attachments || [],
        productRef: m.productRef || null,
        readBy: m.readBy || [],
        createdAt: m.createdAt,
      };
    });

    return res.json({ data: out });
  } catch (err) {
    next(err);
  }
};

exports.createConversation = async (req, res, next) => {
  try {
    let { participants } = req.body;
    if (
      !participants ||
      !Array.isArray(participants) ||
      participants.length < 2
    ) {
      return res
        .status(400)
        .json({ message: 'Participants required (2 users).' });
    }

    participants = participants.map((p) => p.toString()).sort();

    const existing = await Conversation.findOne({
      participants: { $all: participants, $size: participants.length },
    })
      .populate('participants', 'username')
      .lean();

    if (existing)
      return res
        .status(200)
        .json({ data: existing, message: 'Conversation already exists.' });

    const conv = await Conversation.create({ participants });
    return res.status(201).json({ data: conv });
  } catch (err) {
    next(err);
  }
};

exports.markRead = async (req, res, next) => {
  try {
    const convId = req.params.id;
    if (!convId || !mongoose.isValidObjectId(convId))
      return res.status(400).json({ message: 'Invalid conversation id' });

    await Message.updateMany(
      { conversation: convId },
      { $addToSet: { readBy: req.user._id } }
    );
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};
