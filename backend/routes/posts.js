const express = require('express');
const router = express.Router();
const {
    getAllPosts,
    getPostById,
    likePost,
} = require('../controllers/postController');
const { protect } = require('../middleware/authMiddleware');

router.route('/').get(getAllPosts);
router.route('/:id').get(getPostById);
router.route('/:id/like').put(protect, likePost);

module.exports = router;