// Mongoose schema for the Comment.

const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
    post: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        ref:'Post', // reference to the post the comment belongs to
    },
    user: {
        type: mongoose.Schema.Types.OnjectId,
        requred: true,
        ref: 'User', // reference to the user who made the comment
    },
    text: {
        type: String,
        required: [true, 'Comment text cannot be empty'],
    },
}, {
    timestamps: true,
});

const Comment = mongoose.model('Comment', commentSchema);
module.exports = Comment;