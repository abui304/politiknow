const express = require('express');
const router = express.Router();
const {
    getPosts,
    createPost,
    getPostById,
    likePost,
} = require('../controllers/postController');
const { protect } = require('../middleware/authMiddleware');

router.get('/', getPosts);

router.post('/', protect, createPost);

router.get('/:id', getPostById);

router.put('/:id/like', protect, likePost);

module.exports = router;