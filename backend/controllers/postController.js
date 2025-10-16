const asyncHandler = require('express-async-handler');
const Post = require('../models/post');

const getAllPosts = asyncHandler(async (req, res) => {
    const posts = await Post.find({}).sort({ createdAt: -1}).populate('user', 'username');
    res.status(200).json(posts);
});

const getPostById = asyncHandler(async (req, res) => {
    const post = await Post.findById(req.params.id).populate('user', 'username')
    .populate({
        path: 'comments',
        populate: { path: 'user', select: 'username' }
    });

    if (post) {
        res.status(200).json(post);
    } else {
        res.status(404);
        throw new Error('Post not found');
    }
});

const likePost = asyncHandler(async (req, res) => {
    const post = await Post.findById(req.params.id);

    if (!post) {
        res.status(404);
        throw new Error('Post not found');
    }

    const alreadyLiked = post.likes.some(like => like.toString() === req.user.id.toString());
    if (alreadyLiked) {
        post.likes = post.likes.filter(
            like => like.toString() !== req.user.id.toString()
        );
    } else {
        post.likes.push(req.user.id);
    }

    await post.save();
    res.status(200).json({
        message: 'Post like status updated',
        likes: post.likes,
    });
});

module.exports = {
    getAllPosts,
    getPostById,
    likePost,
}