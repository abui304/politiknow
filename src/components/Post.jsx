import React from 'react';
import './Post.css';

const MAX_LEN = 150; // char limit

const Post = ({ content, type, timestamp }) => {
    const shouldCut = content.length > MAX_LEN;
    const displayedContent = shouldCut ? content.substring(0, MAX_LEN) + '...' : content;
    const postStyle = {
        '--post-color': `var(--color-${type}, var(--color-default))` 
    };
    return (
        <div className="post" style={postStyle}>
            <div className="post-header">
                <span className="post-timestamp">
                    {new Date(timestamp).toLocaleDateString()}
                </span>
            </div>
            <div className="post-body">
                <p className="summary">{displayedContent}</p>
                    {shouldCut && <span className="read-more">Read More</span>}
            </div>
            <div className="post-footer">
                <span>{type.toUpperCase()}</span>
            </div>
        </div>
    );
};

export default Post;