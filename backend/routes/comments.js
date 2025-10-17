// This file defnes the API routes for comment-related actions,
// which are nested under specific posts.

const express = require('express');
// we use { mergeParams: true } to access parameters from the parent router (e.g., :postId from the posts router)
const router = express.Router({ mergeParams: true });
const {
    getCommentsForPost,
    addCommentToPost,
} = require('../controllers/commentController');
const { protect } = require('../middleware/authMiddleware');

// route to get all comments for a specific post (public)
// corresponds to GET
router.get('/', getCommentsForPost);

// route to add a new conment to a post (protected)
// corresponds to POST
router.post('/', protect, addCommentToPost);

module.exports = router;