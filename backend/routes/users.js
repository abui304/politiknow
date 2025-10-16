// this file defines the API routes for user-related actions like registration and login

const express = require('express');
const router = express.Router();
const {
    registerUser,
    loginUser,
    getMe,
} = require('../controllers/userController');

const { protect } = require('../middleware/authMiddleware');

router.post('/register', registerUser);

router.post('/login', loginUser);

router.get('/me', protect, getMe);

module.exports = router;