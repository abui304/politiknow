const asyncHandler = require('express-async-handler');
const Comment = require('../models/comment');
const Post = require('../models/post');

const getCommentForPost = asyncHandler(async (req, res) => {
    const { postId } = req.params;
    const comments = await Comment.find({ post: postId }).populate('user', 'username');
    res.status(200).json(comments);
});

const addCommentToPost = asyncHandler(async (req, res) => {
    const { postId } = req.params;
    const { text } = req.body;

    if (!text) {
        res.status(400);
        throw new Error('Comment text cannot be empty.');
    }

    const postExists = await Post.findById(postId);
    if (!postExists) {
        res.status(404);
        throw new Error('Post not found.');
    }

    const comment = await Comment.create({
        text,
        user: req.user.id,
        post: postId,
    });

    res.status(201).json(comment);
});

module.exports = {
    getCommentsForPost,
    addCommentToPost,
};