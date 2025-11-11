const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const ctrl = require("../controllers/chatController");

router.get("/conversations", auth, ctrl.listConversations);
router.get("/conversations/:id", auth, ctrl.getConversation);
router.get("/conversations/:id/messages", auth, ctrl.getMessages);
router.post("/conversations", auth, ctrl.createConversation);
router.post("/conversations/:id/read", auth, ctrl.markRead);

module.exports = router;
